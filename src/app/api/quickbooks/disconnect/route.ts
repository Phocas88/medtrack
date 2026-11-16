import { NextResponse } from "next/server";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/shopify-crypto";
export async function POST() {
  try {
    const user = await requireUser(["admin"], true, true);
    const db = createServiceClient();
    const { data, error } = await db
      .from("integration_credentials")
      .select("encrypted_token")
      .eq("tenant_id", user.tenant_id)
      .eq("provider", "quickbooks")
      .single();
    if (error) throw error;
    if (data.encrypted_token) {
      const tokens = JSON.parse(decryptToken(data.encrypted_token));
      const response = await fetch(
        "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString("base64")}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ token: tokens.refresh_token }),
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw new HttpError(
          502,
          "QuickBooks did not confirm revocation. Retry disconnect.",
        );
    }
    const { error: saveError } = await db
      .from("integration_credentials")
      .update({
        connected: false,
        encrypted_token: null,
        refresh_lease: null,
        refresh_until: null,
      })
      .eq("tenant_id", user.tenant_id)
      .eq("provider", "quickbooks");
    if (saveError) throw saveError;
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
