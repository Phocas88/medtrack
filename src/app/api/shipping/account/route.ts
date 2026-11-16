import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  validateShippingAccount,
  registerShippingWebhook,
} from "@/lib/shipping";
import { encryptToken } from "@/lib/shopify-crypto";
import { appOrigin } from "@/lib/security";
export async function GET() {
  try {
    const user = await requireUser(["admin", "manager"]);
    const { data, error } = await createServiceClient()
      .from("integration_credentials")
      .select("connected")
      .eq("tenant_id", user.tenant_id)
      .eq("provider", "easypost")
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(
      { connected: !!data?.connected },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
export async function POST(request: Request) {
  let lease: string | null = null,
    tenant: string | null = null;
  try {
    const user = await requireUser(["admin"], true);
    const { api_key } = z
      .object({ api_key: z.string().trim().min(20).max(300) })
      .parse(await request.json());
    const db = createServiceClient();
    const { data: existing, error: existingError } = await db
      .from("integration_credentials")
      .select("connected")
      .eq("tenant_id", user.tenant_id)
      .eq("provider", "easypost")
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.connected)
      throw new HttpError(
        409,
        "A shipping account is already connected. Contact support to rotate credentials while preserving existing label and tracking access.",
      );
    tenant = user.tenant_id;
    const { data: claim, error: claimError } = await db.rpc(
      "claim_shipping_connection",
      { p_tenant: tenant },
    );
    if (claimError || !claim)
      throw new HttpError(
        409,
        "Shipping account connection is already active or in progress",
      );
    lease = claim;
    await validateShippingAccount(api_key);
    const secret = randomBytes(32).toString("hex");
    const encrypted = encryptToken(
      JSON.stringify({ api_key, webhook_secret: secret, webhook_id: "" }),
    );
    void encrypted;
    // Ensure encryption and application-origin configuration are valid before creating a webhook.
    const callback = `${appOrigin()}/api/shipping/webhook`;
    const webhook = await registerShippingWebhook(callback, secret, api_key);
    const { data: saved, error } = await db
      .from("integration_credentials")
      .update({
        connected: true,
        encrypted_token: encryptToken(
          JSON.stringify({
            api_key,
            webhook_secret: secret,
            webhook_id: webhook,
          }),
        ),
        refresh_lease: null,
        refresh_until: null,
      })
      .eq("tenant_id", user.tenant_id)
      .eq("provider", "easypost")
      .eq("refresh_lease", lease)
      .select("tenant_id");
    if (error || !saved?.length)
      throw error || new Error("Shipping connection lease expired");
    return NextResponse.json({ connected: true });
  } catch (error) {
    if (tenant && lease)
      await createServiceClient()
        .from("integration_credentials")
        .update({ refresh_lease: null, refresh_until: null })
        .eq("tenant_id", tenant)
        .eq("provider", "easypost")
        .eq("refresh_lease", lease);
    return routeError(error);
  }
}
