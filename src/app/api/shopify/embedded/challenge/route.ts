import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { shopifySession } from "@/lib/shopify-session";
import { enforceRateLimit } from "@/lib/distributed-rate-limit";
import { createServiceClient } from "@/lib/supabase/service";
import { routeError } from "@/lib/server-auth";
export async function POST(request: Request) {
  try {
    const session = shopifySession(request);
    await enforceRateLimit(
      "shopify-link",
      `${session.shop}:${session.subject}`,
      10,
    );
    const challenge = randomBytes(32).toString("hex");
    const { error } = await createServiceClient()
      .from("shopify_link_challenges")
      .insert({
        challenge_hash: createHash("sha256").update(challenge).digest("hex"),
        shop_domain: session.shop,
        shopify_user_id: session.subject,
      });
    if (error) throw error;
    return NextResponse.json(
      { path: `/shopify/link?challenge=${challenge}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
