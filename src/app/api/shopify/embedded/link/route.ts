import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createClient } from "@/lib/supabase/server";
export async function POST(request: Request) {
  try {
    await requireUser(["admin", "manager"]);
    const { challenge } = z
      .object({ challenge: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(await request.json());
    const { data, error } = await (
      await createClient()
    ).rpc("link_shopify_identity", {
      p_challenge: createHash("sha256").update(challenge).digest("hex"),
    });
    if (error)
      throw new HttpError(
        409,
        "This link expired or the store does not belong to your warehouse. Return to Shopify to try again.",
      );
    return NextResponse.json({
      return_url: `https://${data}/admin/apps/${process.env.SHOPIFY_API_KEY}`,
    });
  } catch (error) {
    return routeError(error);
  }
}
