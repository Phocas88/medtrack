import { createServiceClient } from "@/lib/supabase/service";
import { decryptToken } from "@/lib/shopify-crypto";
import { HttpError } from "@/lib/server-auth";
export type ShippingAccount = {
  api_key: string;
  webhook_secret: string;
  webhook_id: string;
};
export async function loadShippingAccount(
  tenant: string,
): Promise<ShippingAccount> {
  const { data, error } = await createServiceClient()
    .from("integration_credentials")
    .select("encrypted_token")
    .eq("tenant_id", tenant)
    .eq("provider", "easypost")
    .eq("connected", true)
    .single();
  if (error || !data?.encrypted_token)
    throw new HttpError(
      409,
      "Connect your EasyPost account in Integrations → Shipping first",
    );
  const account = JSON.parse(decryptToken(data.encrypted_token));
  if (
    typeof account.api_key !== "string" ||
    typeof account.webhook_secret !== "string"
  )
    throw new Error("Reconnect the shipping account");
  return account;
}
