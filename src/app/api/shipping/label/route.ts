import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser, routeError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
export async function GET(request: Request) {
  try {
    const user = await requireUser(["admin", "manager"]);
    const order = z
      .string()
      .uuid()
      .parse(new URL(request.url).searchParams.get("order_id"));
    const carton = z.string().uuid().nullable().parse(new URL(request.url).searchParams.get("carton_id"));
    const query = createServiceClient()
      .from("shipping_quotes")
      .select("shipment_id,rate_id,purchase_state,purchased")
      .eq("tenant_id", user.tenant_id)
      .eq("order_id", order)
      .neq("purchase_state", "quoted");
    const { data, error } = await (carton ? query.eq("carton_id", carton) : query.is("carton_id", null))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json(
      { quote: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
