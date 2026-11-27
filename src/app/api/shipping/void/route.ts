import { z } from "zod";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { loadShippingAccount } from "@/lib/shipping-account";
import { cartonRefundStatus } from "@/lib/shipping";

const refund = z.enum(["checking", "submitted", "refunded", "rejected", "not_applicable"]);

export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin", "manager"], true, true);
    const input = z.object({ shipment_id: z.string().regex(/^shp_[a-zA-Z0-9]+$/).max(100), submit: z.boolean() })
      .strict().parse(await request.json());
    const account = await loadShippingAccount(user.tenant_id);
    const db = createServiceClient();
    const { data: claim, error } = await db.rpc("claim_carton_void", {
      p_tenant: user.tenant_id, p_shipment: input.shipment_id, p_submit: input.submit,
    });
    if (error || !claim) throw new HttpError(409, "Carton label is unavailable for voiding.");
    if (claim.status === "busy") throw new HttpError(409, "A status check is in progress. Try again shortly.");
    if (claim.status) return Response.json({ status: refund.parse(claim.status) });
    let status: z.infer<typeof refund> = "checking";
    try {
      status = refund.parse(await cartonRefundStatus(input.shipment_id, claim.submit, account.api_key));
    } catch {
      // Track the uncertainty. Repeated clicks will query the original carrier shipment.
    }
    const { error: finishError } = await db.rpc("finish_carton_void", {
      p_tenant: user.tenant_id, p_shipment: input.shipment_id, p_token: claim.token, p_status: status,
    });
    if (finishError) throw new HttpError(409, "Could not save the carrier response. Check the refund status again.");
    return Response.json({ status });
  } catch (error) { return routeError(error); }
}
