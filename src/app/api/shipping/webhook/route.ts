import { loadShippingAccount } from "@/lib/shipping-account";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyShippingWebhook } from "@/lib/shipping-webhooks";
import { createServiceClient } from "@/lib/supabase/service";
import { getTracking } from "@/lib/shipping";
import { routeError, HttpError } from "@/lib/server-auth";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!request.headers.get("x-hmac-signature"))
      throw new HttpError(401, "Invalid signature");
    const event = z
      .object({
        id: z.string().regex(/^evt_[a-zA-Z0-9]+$/),
        description: z.string(),
        result: z.object({ id: z.string() }),
      })
      .parse(JSON.parse(raw));
    if (event.description !== "tracker.updated")
      return NextResponse.json({ received: true, ignored: true });
    if (!/^trk_[a-zA-Z0-9]+$/.test(event.result.id))
      throw new HttpError(400, "Invalid tracker");
    const db = createServiceClient();
    const { data: quote, error } = await db
      .from("shipping_quotes")
      .select("shipment_id,tenant_id")
      .eq("purchased->>tracker_id", event.result.id)
      .eq("purchase_state", "purchased")
      .maybeSingle();
    if (error) throw error;
    if (!quote) return NextResponse.json({ received: true, ignored: true });
    const account = await loadShippingAccount(quote.tenant_id);
    if (
      !verifyShippingWebhook(
        raw,
        request.headers.get("x-hmac-signature"),
        account.webhook_secret,
      )
    )
      throw new HttpError(401, "Invalid signature");
    // Resolve the current provider state rather than applying a stale event payload.
    const current = await getTracking(event.result.id, account.api_key);
    const tracking = z
      .object({
        id: z.literal(event.result.id),
        status: z.string(),
        updated_at: z.string().datetime({ offset: true }),
      })
      .parse(current);
    const { error: applyError } = await db.rpc("apply_shipping_tracking", {
      p_event: event.id,
      p_tracker: tracking.id,
      p_status: tracking.status,
      p_updated: tracking.updated_at,
    });
    if (applyError) throw applyError;
    return NextResponse.json({ received: true });
  } catch (error) {
    return routeError(error);
  }
}
