import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit } from "@/lib/distributed-rate-limit";
import { HttpError } from "@/lib/server-auth";
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
export async function zapierTenant(key: string | null) {
  if (!key || !/^stk_[a-f0-9]{64}$/.test(key))
    throw new HttpError(401, "Invalid API key");
  const { data, error } = await createServiceClient()
    .from("tenant_api_keys")
    .select("tenant_id")
    .eq("provider", "zapier")
    .eq("key_hash", hashApiKey(key))
    .single();
  if (error || !data) throw new HttpError(401, "Invalid API key");
  await enforceRateLimit("zapier", data.tenant_id, 120);
  return data.tenant_id as string;
}
