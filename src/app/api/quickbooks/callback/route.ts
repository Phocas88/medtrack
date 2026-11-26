import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { quickBooksToken, quickBooksRedirect } from "@/lib/quickbooks";
import { createServiceClient } from "@/lib/supabase/service";
import { encryptToken } from "@/lib/shopify-crypto";
import { appOrigin } from "@/lib/security";
export async function GET(request: Request) {
  try {
    const user = await requireUser(["admin"], true);
    const params = new URL(request.url).searchParams;
    const store = await cookies();
    const state = store.get("quickbooks_state")?.value;
    store.delete("quickbooks_state");
    if (!state || params.get("state") !== state)
      throw new HttpError(401, "Invalid QuickBooks authorization state");
    const code = z.string().min(1).max(4096).parse(params.get("code"));
    const realm = z
      .string()
      .regex(/^\d{1,30}$/)
      .parse(params.get("realmId"));
    const tokens = await quickBooksToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: quickBooksRedirect(),
    });
    const { data: old, error: oldError } = await createServiceClient()
      .from("integration_credentials")
      .select("shop_domain")
      .eq("tenant_id", user.tenant_id)
      .eq("provider", "quickbooks")
      .maybeSingle();
    if (oldError) throw oldError;
    if (old?.shop_domain && old.shop_domain !== realm)
      throw new HttpError(
        409,
        "Changing accounting companies requires support reconciliation of existing mappings and invoices",
      );
    const { error } = await createServiceClient()
      .from("integration_credentials")
      .upsert(
        {
          tenant_id: user.tenant_id,
          provider: "quickbooks",
          shop_domain: realm,
          encrypted_token: encryptToken(JSON.stringify(tokens)),
          connected: true,
          refresh_lease: null,
          refresh_until: null,
        },
        { onConflict: "tenant_id,provider" },
      );
    if (error) throw error;
    return NextResponse.redirect(`${appOrigin()}/integrations/quickbooks`);
  } catch (error) {
    return routeError(error);
  }
}
