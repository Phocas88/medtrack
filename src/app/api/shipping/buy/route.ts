import { loadShippingAccount } from "@/lib/shipping-account";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { buyLabel, recoverLabel, type ShipmentResult } from "@/lib/shipping";
import { uuid } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin", "manager"], true);
    const account = await loadShippingAccount(user.tenant_id);

    const input = z
      .object({
        shipment_id: z
          .string()
          .regex(/^shp_[a-zA-Z0-9]+$/)
          .max(100),
        rate_id: z
          .string()
          .regex(/^rate_[a-zA-Z0-9]+$/)
          .max(100),
        order_id: uuid,
        carton_id: uuid.optional(),
      })
      .parse(await request.json());
    const db = createServiceClient();
    const { data: claim, error } = await db.rpc(input.carton_id ? "claim_carton_label_purchase" : "claim_label_purchase", {
      p_tenant: user.tenant_id,
      p_order: input.order_id,
      p_shipment: input.shipment_id,
      p_rate: input.rate_id,
      ...(input.carton_id ? { p_carton: input.carton_id } : {}),
    });
    if (error)
      throw new HttpError(
        409,
        "Label purchase unavailable. Check the order and recover any existing purchase before buying again.",
      );
    if (claim.mode === "busy")
      throw new HttpError(
        409,
        "Label purchase is in progress. Retry shortly to retrieve the result.",
      );
    let result: ShipmentResult = claim.result;
    if (claim.mode !== "cached") {
      try {
        const recovered = await recoverLabel(
          input.shipment_id,
          input.rate_id,
          account.api_key,
        );
        if (recovered) result = recovered;
        else if (claim.mode === "recover")
          throw new HttpError(
            409,
            "The previous purchase is unresolved. No new charge was attempted. Retry recovery or contact support.",
          );
        else
          result = await buyLabel(
            input.shipment_id,
            input.rate_id,
            account.api_key,
          );
        const { error: saveError } = await db.rpc("complete_label_purchase", {
          p_tenant: user.tenant_id,
          p_shipment: input.shipment_id,
          p_token: claim.token,
          p_result: result,
        });
        if (saveError) throw saveError;
      } catch (failure) {
        // A timeout may follow a successful charge. Keep the order bound to this shipment.
        await db
          .from("shipping_quotes")
          .update({ purchase_state: "uncertain", lease_until: null })
          .eq("shipment_id", input.shipment_id)
          .eq("tenant_id", user.tenant_id)
          .eq("lease_token", claim.token)
          .neq("purchase_state", "purchased");
        throw failure;
      }
    }
    return NextResponse.json({
      tracking_code: result.tracking_code,
      label_url: result.label_url,
      carrier: result.rate.carrier,
      service: result.rate.service,
      rate: result.rate.rate,
    });
  } catch (error) {
    return routeError(error);
  }
}
