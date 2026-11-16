import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { enforceRateLimit } from "@/lib/distributed-rate-limit";
import { HttpError } from "@/lib/server-auth";
export async function requirePortalCustomer(customerId?: string) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) throw new HttpError(401, "Sign in required");
  await enforceRateLimit("portal", user.id, 120);
  let query = createServiceClient()
    .from("portal_memberships")
    .select(
      "customer_id,tenant_id,customer:customers(id,tenant_id,name,email,phone,ship_to_address,price_tier_id)",
    )
    .eq("auth_user_id", user.id);
  if (customerId) query = query.eq("customer_id", customerId);
  const { data, error } = await query.order("created_at").limit(2);
  if (error || !data?.length)
    throw new HttpError(403, "No portal access for this account");
  if (data.length > 1 && !customerId)
    throw new HttpError(409, "Choose a supplier account");
  return { membership: data[0], session };
}
