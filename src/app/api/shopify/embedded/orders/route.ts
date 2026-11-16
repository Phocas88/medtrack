import { NextResponse } from "next/server";
import { shopifySession } from "@/lib/shopify-session";
import { enforceRateLimit } from "@/lib/distributed-rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { HttpError, routeError } from "@/lib/server-auth";
export async function GET(request: Request) {
  try {
    const session = shopifySession(request);
    const db = createServiceClient();
    await enforceRateLimit(
      "shopify-embedded",
      `${session.shop}:${session.subject}`,
      120,
    );
    const { data: identity, error: identityError } = await db
      .from("shopify_identity_links")
      .select("tenant_id,user_id")
      .eq("shop_domain", session.shop)
      .eq("shopify_user_id", session.subject)
      .maybeSingle();
    if (identityError) throw identityError;
    if (!identity)
      throw new HttpError(403, "Link your Stokora account to continue");
    const [
      { data: profile, error: profileError },
      { data: connection, error: connectionError },
    ] = await Promise.all([
      db
        .from("users")
        .select("id,role,is_active,access_level")
        .eq("id", identity.user_id)
        .eq("tenant_id", identity.tenant_id)
        .single(),
      db
        .from("integration_credentials")
        .select("connected")
        .eq("tenant_id", identity.tenant_id)
        .eq("provider", "shopify")
        .eq("shop_domain", session.shop)
        .single(),
    ]);
    if (
      profileError ||
      connectionError ||
      !connection?.connected ||
      !profile?.is_active ||
      profile.access_level === "scanner_only" ||
      !["admin", "manager"].includes(profile.role)
    )
      throw new HttpError(403, "An active manager account is required");
    const { data, error } = await db
      .from("sales_orders")
      .select(
        "id,order_number,status,created_at,tracking_number,customer:customers(name)",
      )
      .eq("tenant_id", identity.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json(
      { orders: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
