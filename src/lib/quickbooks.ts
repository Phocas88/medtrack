import { createServiceClient } from "@/lib/supabase/service";
import { encryptToken, decryptToken } from "@/lib/shopify-crypto";
import { HttpError } from "@/lib/server-auth";
import { appOrigin } from "@/lib/security";
export const quickBooksRedirect = () =>
  `${appOrigin()}/api/quickbooks/callback`;
type Tokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};
export async function quickBooksToken(
  body: Record<string, string>,
): Promise<Tokens> {
  const id = process.env.QUICKBOOKS_CLIENT_ID,
    secret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!id || !secret)
    throw new HttpError(503, "QuickBooks OAuth is not configured");
  const response = await fetch(
    "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new HttpError(
      502,
      "QuickBooks authorization failed. Reconnect if access was revoked.",
    );
  const data = await response.json();
  if (
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    !Number.isFinite(data.expires_in)
  )
    throw new Error("Invalid OAuth response");
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
}
export async function quickBooksConnection(tenant: string) {
  const db = createServiceClient();
  const { data: connection, error } = await db
    .from("integration_credentials")
    .select("*")
    .eq("tenant_id", tenant)
    .eq("provider", "quickbooks")
    .eq("connected", true)
    .single();
  if (
    error ||
    !connection?.encrypted_token ||
    !/^\d+$/.test(connection.shop_domain || "")
  )
    throw new HttpError(409, "Connect QuickBooks first");
  let tokens = JSON.parse(decryptToken(connection.encrypted_token)) as Tokens;
  if (tokens.expires_at < Date.now() + 120000) {
    const { data: lease, error: leaseError } = await db.rpc(
      "claim_integration_refresh",
      { p_tenant: tenant, p_provider: "quickbooks" },
    );
    if (leaseError || !lease)
      throw new HttpError(
        503,
        "QuickBooks credentials are refreshing. Retry shortly.",
      );
    try {
      const { data: latest, error: readError } = await db
        .from("integration_credentials")
        .select("encrypted_token")
        .eq("tenant_id", tenant)
        .eq("provider", "quickbooks")
        .eq("refresh_lease", lease)
        .single();
      if (readError) throw readError;
      tokens = JSON.parse(decryptToken(latest.encrypted_token));
      if (tokens.expires_at < Date.now() + 120000)
        tokens = await quickBooksToken({
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
        });
      const { data: saved, error: saveError } = await db
        .from("integration_credentials")
        .update({
          encrypted_token: encryptToken(JSON.stringify(tokens)),
          refresh_until: null,
          refresh_lease: null,
        })
        .eq("tenant_id", tenant)
        .eq("provider", "quickbooks")
        .eq("connected", true)
        .eq("refresh_lease", lease)
        .select("tenant_id");
      if (saveError || !saved?.length)
        throw new Error("Credential save failed");
    } catch (failure) {
      await db
        .from("integration_credentials")
        .update({ refresh_until: null, refresh_lease: null })
        .eq("tenant_id", tenant)
        .eq("provider", "quickbooks")
        .eq("refresh_lease", lease);
      throw failure;
    }
  }
  const base =
    process.env.QUICKBOOKS_ENVIRONMENT === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";
  return {
    realm: connection.shop_domain,
    async request(path: string, body?: unknown) {
      const response = await fetch(
        `${base}/v3/company/${connection.shop_domain}/${path}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
          cache: "no-store",
        },
      );
      if (!response.ok)
        throw new HttpError(
          502,
          "QuickBooks rejected the request. Check mappings and account access.",
        );
      return response.json();
    },
  };
}
