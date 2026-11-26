import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, routeError } from "@/lib/server-auth";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/distributed-rate-limit";

export async function GET(request: Request) {
  try {
    const user = await requireUser(["admin", "manager"]);
    await enforceRateLimit("orders", user.id, 120);
    const params = z
      .object({
        q: z.string().max(200).default(""),
        status: z
          .enum([
            "all",
            "draft",
            "confirmed",
            "picking",
            "shipped",
            "cancelled",
            "externally_fulfilled",
          ])
          .default("all"),
        page: z.coerce.number().int().min(0).max(100000).default(0),
      })
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const { data, error } = await (
      await createClient()
    ).rpc("list_order_desk", {
      p_query: params.q,
      p_status: params.status,
      p_page: params.page,
    });
    if (error) throw error;
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireUser(["admin", "manager"]);
    const input = z
      .object({
        order_id: z.string().uuid(),
        expected: z.enum(["draft", "confirmed"]),
        target: z.enum(["confirmed", "cancelled"]),
      })
      .parse(await request.json());
    const { error } = await (
      await createClient()
    ).rpc("transition_order", {
      p_order: input.order_id,
      p_expected: input.expected,
      p_target: input.target,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
