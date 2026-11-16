import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  verifyShopifyHmac,
  findTenantByShopDomain,
} from "@/lib/shopify-webhooks";
import { routeError, HttpError } from "@/lib/server-auth";
import { drainIntegrationJobs } from "@/lib/integration-jobs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!verifyShopifyHmac(raw, request.headers.get("x-shopify-hmac-sha256")))
      throw new HttpError(401, "Invalid signature");
    const topic = request.headers.get("x-shopify-topic");
    const domain = request.headers.get("x-shopify-shop-domain");
    const eventId = request.headers.get("x-shopify-webhook-id");
    if (!domain || !eventId) throw new HttpError(400, "Missing event headers");
    if (
      ![
        "orders/create",
        "orders/updated",
        "orders/paid",
        "orders/cancelled",
      ].includes(topic || "")
    )
      return NextResponse.json({ received: true, ignored: true });
    const db = createServiceClient();
    const tenant = await findTenantByShopDomain(db, domain);
    if (!tenant) throw new HttpError(404, "Store not found");
    const body = JSON.parse(raw);
    if (!/^\d+$/.test(String(body.id)))
      throw new HttpError(400, "Invalid order ID");
    const { error } = await db
      .from("integration_jobs")
      .upsert(
        {
          tenant_id: tenant.id,
          provider: "shopify",
          event_id: `${domain}:${eventId}`,
          payload: { order_id: String(body.id) },
        },
        { onConflict: "event_id", ignoreDuplicates: true },
      );
    if (error) throw error;
    after(async () => {
      try {
        await drainIntegrationJobs(3);
      } catch {
        console.error("Integration worker failed");
      }
    });
    return NextResponse.json({ received: true, queued: true });
  } catch (error) {
    return routeError(error);
  }
}
