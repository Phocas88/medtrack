import { z } from "zod";
import { NextResponse, after } from "next/server";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { loadShopifyConnection } from "@/lib/shopify-connection";
import { drainIntegrationJobs } from "@/lib/integration-jobs";
import { uuid } from "@/lib/security";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    const user = await requireUser(["admin", "manager"], true);
    const db = createServiceClient();
    const product = new URL(request.url).searchParams.get("preview");
    if (product !== null) {
      const { data: mapping, error: mappingError } = await db
        .from("shopify_inventory_mappings")
        .select("product_id")
        .eq("tenant_id", user.tenant_id)
        .eq("product_id", uuid.parse(product))
        .maybeSingle();
      if (mappingError) throw mappingError;
      if (!mapping) throw new HttpError(404, "No Shopify mapping for this product");
      const { data, error } = await db.rpc("shopify_warehouse_stock_preview", {
        p_tenant: user.tenant_id,
        p_product: mapping.product_id,
      });
      if (error) throw error;
      return NextResponse.json({ warehouses: data }, { headers: { "Cache-Control": "no-store" } });
    }
    const client = await loadShopifyConnection(user.tenant_id);
    const [locations, mappings] = await Promise.all([
      client.getLocations(),
      db
        .from("shopify_inventory_mappings")
        .select(
          "product_id,variant_id,location_id,publish_enabled,product:products(name,sku)",
        )
        .eq("tenant_id", user.tenant_id),
    ]);
    if (mappings.error) throw mappings.error;
    return NextResponse.json(
      { locations: locations.locations, mappings: mappings.data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin"], true);
    const input = z
      .object({
        product_id: uuid,
        location_id: z.string().regex(/^gid:\/\/shopify\/Location\/\d+$/),
        publish_enabled: z.boolean(),
      })
      .parse(await request.json());
    const db = createServiceClient();
    const { data: mapping, error } = await db
      .from("shopify_inventory_mappings")
      .select("inventory_item_id")
      .eq("tenant_id", user.tenant_id)
      .eq("product_id", input.product_id)
      .single();
    if (error || !mapping)
      throw new HttpError(
        404,
        "Import this product from Shopify before mapping inventory",
      );
    if (input.publish_enabled) {
      const client = await loadShopifyConnection(user.tenant_id);
      await client.inventoryQuantity(
        mapping.inventory_item_id,
        input.location_id,
      );
    }
    const { error: saveError } = await db
      .from("shopify_inventory_mappings")
      .update({
        location_id: input.location_id,
        publish_enabled: input.publish_enabled,
      })
      .eq("tenant_id", user.tenant_id)
      .eq("product_id", input.product_id);
    if (saveError) throw saveError;
    const { error: queueError } = await db.rpc("enqueue_shopify_stock", {
      p_tenant: user.tenant_id,
      p_product: input.product_id,
    });
    if (queueError) throw queueError;
    after(async () => {
      try {
        await drainIntegrationJobs(3);
      } catch {
        console.error("Inventory worker failed");
      }
    });
    return NextResponse.json({ queued: input.publish_enabled });
  } catch (error) {
    return routeError(error);
  }
}
