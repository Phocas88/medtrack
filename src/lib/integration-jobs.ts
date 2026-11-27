import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { loadShopifyConnection } from "@/lib/shopify-connection";

/** Bounded drain; persisted leases allow another invocation to recover abandoned work. */
export async function drainIntegrationJobs(limit = 5) {
  const db = createServiceClient();
  const deadline = Date.now() + 40000;
  let completed = 0,
    failed = 0;
  for (let index = 0; index < limit && Date.now() < deadline; index++) {
    const { data: job, error } = await db.rpc("claim_integration_job");
    if (error) throw error;
    if (!job) break;
    try {
      const client = await loadShopifyConnection(job.tenant_id);
      if (job.payload.kind === "inventory") {
        const { data: mapping, error: mappingError } = await db
          .from("shopify_inventory_mappings")
          .select("*")
          .eq("tenant_id", job.tenant_id)
          .eq("product_id", job.payload.product_id)
          .maybeSingle();
        if (mappingError) throw mappingError;
        if (mapping?.publish_enabled) {
          // Capture the provider baseline BEFORE reconciling orders. A checkout after
          // this read changes Shopify availability and makes compare-and-set fail safely.
          const baseline = await client.inventoryQuantity(
            mapping.inventory_item_id,
            mapping.location_id,
          );
          const { orders: openOrders } = await client.getOrders("open", 50);
          for (const order of openOrders) {
            const event = createHash("sha256")
              .update(JSON.stringify(order))
              .digest("hex");
            const { error: reconcileError } = await db.rpc(
              "import_shopify_order",
              {
                p_tenant_id: job.tenant_id,
                p_order: order,
                p_event_id: `reconcile:${job.tenant_id}:${order.id}:${event}`,
              },
            );
            if (reconcileError) throw reconcileError;
          }
          const { data: lease, error: leaseError } = await db
            .from("integration_jobs")
            .select("id")
            .eq("id", job.id)
            .eq("lease_token", job.lease_token)
            .gt("lease_until", new Date(Date.now() + 30000).toISOString())
            .maybeSingle();
          if (leaseError || !lease)
            throw new Error(
              "Inventory job lease must be recovered before publishing",
            );
          const { data: quantity, error: quantityError } = await db.rpc(
            "stock_publish_quantity",
            { p_tenant: job.tenant_id, p_product: job.payload.product_id },
          );
          if (quantityError) throw quantityError;
          await client.publishInventory(
            mapping.inventory_item_id,
            mapping.location_id,
            quantity,
            `gid://stokora/InventoryUpdate/${job.id}-${job.revision}`,
            baseline,
          );
        }
      } else if (job.payload.kind === "fulfillment") {
        const { data: shipment, error: shipmentError } = await db
          .from("shipments")
          .select(
            "tracking_number,shopify_split,order_id,order:sales_orders(order_number,carrier),lines:shipment_lines(quantity,product:products(sku))",
          )
          .eq("tenant_id", job.tenant_id)
          .eq("id", job.payload.shipment_id)
          .single();
        if (shipmentError) throw shipmentError;
        const order = shipment.order as unknown as {
          order_number: string;
          carrier: string | null;
        };
        const lines = shipment.lines as unknown as {
          quantity: number;
          product: { sku: string };
        }[];
        const shipped: Record<string, number> = Object.create(null);
        for (const line of lines)
          shipped[line.product.sku] =
            (shipped[line.product.sku] || 0) + line.quantity;
        await client.fulfillWarehouseOrder(
          order.order_number.replace(/^SHOPIFY-/, ""),
          shipped,
          shipment.tracking_number,
          order.carrier,
          shipment.shopify_split ? {
            attempted: !!job.fulfillment_attempted_at,
            beforeMutation: async () => {
              const { data: claimed, error } = await db.rpc("mark_split_fulfillment_attempt", { p_job: job.id, p_lease: job.lease_token });
              if (error || !claimed) throw new Error("An earlier shipment must be reconciled first");
            },
          } : undefined,
        );
      } else {
        const { order } = await client.getOrder(String(job.payload.order_id));
        const { error: importError } = await db.rpc("import_shopify_order", {
          p_tenant_id: job.tenant_id,
          p_order: order,
          p_event_id: job.event_id,
        });
        if (importError) throw importError;
      }
      const { error: saveError } = await db.rpc("finish_integration_job", {
        p_job: job.id,
        p_token: job.lease_token,
        p_revision: job.revision,
        p_success: true,
      });
      if (saveError) throw saveError;
      completed++;
    } catch {
      const { error: saveError } = await db.rpc("finish_integration_job", {
        p_job: job.id,
        p_token: job.lease_token,
        p_revision: job.revision,
        p_success: false,
      });
      if (saveError) throw saveError;
      failed++;
    }
  }
  return { completed, failed };
}
