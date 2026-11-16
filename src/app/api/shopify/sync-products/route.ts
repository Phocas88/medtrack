import { requireUser, routeError } from "@/lib/server-auth";
import { loadShopifyConnection } from "@/lib/shopify-connection";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  try {
    const authUser = await requireUser(["admin", "manager"], true);
    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const client = await loadShopifyConnection(authUser.tenant_id);
    const { products: shopifyProducts } = await client.getProducts(250);

    const skus = shopifyProducts
      .flatMap((product) => product.variants.map((variant) => variant.sku))
      .filter(Boolean);
    if (new Set(skus).size !== skus.length)
      throw new Error("Shopify SKUs must be unique before importing products");
    let created = 0;
    let updated = 0;

    for (const sp of shopifyProducts) {
      for (const variant of sp.variants) {
        if (!variant.sku) continue; // skip variants without SKU

        let productId: string;
        // Check if product exists by SKU
        const { data: existing } = await svc
          .from("products")
          .select("id")
          .eq("tenant_id", authUser.tenant_id)
          .eq("sku", variant.sku)
          .limit(1);

        if (existing && existing.length > 0) {
          // Update price
          const { error: writeError } = await svc
            .from("products")
            .update({
              price: parseFloat(variant.price) || 0,
              image_url: sp.images[0]?.src || null,
            })
            .eq("id", existing[0].id);
          if (writeError) throw writeError;
          productId = existing[0].id;
          updated++;
        } else {
          // Create new product
          const { data: inserted, error: writeError } = await svc
            .from("products")
            .insert({
              tenant_id: authUser.tenant_id,
              name:
                sp.variants.length > 1
                  ? `${sp.title} - ${variant.title}`
                  : sp.title,
              sku: variant.sku,
              category: sp.product_type || null,
              cost: 0,
              price: parseFloat(variant.price) || 0,
              unit_of_measure: "each",
              low_stock_threshold: 10,
              is_lot_tracked: false,
              is_serial_tracked: false,
              storage_requirement: "room_temp",
              expiry_alert_days: 60,
              lead_time_days: 7,
              image_url: sp.images[0]?.src || null,
            })
            .select("id")
            .single();
          if (writeError) throw writeError;
          productId = inserted.id;
          created++;
        }
        const { error: mappingError } = await svc.rpc("map_shopify_variant", {
          p_tenant: authUser.tenant_id,
          p_product: productId,
          p_variant: `gid://shopify/ProductVariant/${variant.id}`,
          p_item: `gid://shopify/InventoryItem/${variant.inventory_item_id}`,
        });
        if (mappingError) throw mappingError;
      }
    }

    return NextResponse.json({ synced: created + updated, created, updated });
  } catch (error) {
    return routeError(error);
  }
}
