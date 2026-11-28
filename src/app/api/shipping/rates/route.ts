import { loadShippingAccount } from "@/lib/shipping-account";
import { z } from "zod";
import { shippingAddress, parcelSchema } from "@/lib/shipping-validation";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { recommendRate } from "@/lib/shipping-routing";
import { getRates } from "@/lib/shipping";

export async function POST(request: Request) {
  try {
    const authorizedUser = await requireUser(["admin", "manager"], true);
    const account = await loadShippingAccount(authorizedUser.tenant_id);

    const { from, to, parcel, order_id, carton_id } = z
      .object({
        from: shippingAddress,
        to: shippingAddress,
        parcel: parcelSchema,
        order_id: z.string().uuid().optional(),
        carton_id: z.string().uuid().optional(),
      })
      .parse(await request.json());

    const db = createServiceClient();
    if (carton_id) {
      if (!order_id) throw new HttpError(400, "Order required for carton");
      const { data, error } = await db.from("shipment_cartons")
        .select("id, shipments!inner(order_id)")
        .eq("id", carton_id).eq("tenant_id", authorizedUser.tenant_id)
        .eq("shipments.order_id", order_id).eq("tracking_number", "").maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Unlabeled carton not found");
    }
    const result = await getRates(from, to, parcel, account.api_key);

    const { error } = await db
      .from("shipping_quotes")
      .insert({
        shipment_id: result.shipment_id,
        tenant_id: authorizedUser.tenant_id,
        rates: result.rates,
        ...(carton_id ? { carton_id, order_id } : {}),
      });
    if (error) throw error;
    const access = await db.rpc('suite_workspace_available', { p_tenant: authorizedUser.tenant_id, p_product: 'shipping' });
    if (access.error) throw access.error;
    if (!access.data) return NextResponse.json(result);
    const rules = await db.from('shipping_routing_rules').select('*').eq('tenant_id', authorizedUser.tenant_id);
    if (rules.error) throw rules.error;
    return NextResponse.json({
      ...result,
      recommendation: recommendRate(rules.data, result.rates, to.country || 'US', parcel.weight),
    });
  } catch (err) {
    return routeError(err);
  }
}
