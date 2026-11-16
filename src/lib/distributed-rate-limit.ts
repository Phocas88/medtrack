import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { HttpError } from "@/lib/server-auth";

/** Atomic across instances. Store hashes rather than raw user identifiers or addresses. */
export async function enforceRateLimit(
  scope: string,
  identity: string,
  limit = 60,
  seconds = 60,
) {
  const key = createHash("sha256").update(`${scope}:${identity}`).digest("hex");
  const { data, error } = await createServiceClient().rpc("consume_api_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: seconds,
  });
  if (error)
    throw new HttpError(503, "Request limiter unavailable. Please retry.");
  if (!data)
    throw new HttpError(429, "Too many requests. Please retry shortly.");
}
