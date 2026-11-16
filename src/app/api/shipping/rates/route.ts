import { loadShippingAccount } from "@/lib/shipping-account";
import { z } from "zod";
import { shippingAddress, parcelSchema } from "@/lib/shipping-validation";
import { requireUser, routeError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NextResponse } from "next/server";
import { getRates } from "@/lib/shipping";

export async function POST(request: Request) {
  try {
    const authorizedUser = await requireUser(["admin", "manager"], true);
    const account = await loadShippingAccount(authorizedUser.tenant_id);

    const { from, to, parcel } = z
      .object({
        from: shippingAddress,
        to: shippingAddress,
        parcel: parcelSchema,
      })
      .parse(await request.json());

    const result = await getRates(from, to, parcel, account.api_key);

    const { error } = await createServiceClient()
      .from("shipping_quotes")
      .insert({
        shipment_id: result.shipment_id,
        tenant_id: authorizedUser.tenant_id,
        rates: result.rates,
      });
    if (error) throw error;
    return NextResponse.json(result);
  } catch (err) {
    return routeError(err);
  }
}
