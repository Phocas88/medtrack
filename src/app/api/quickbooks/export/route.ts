import { createHash } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { quickBooksConnection } from "@/lib/quickbooks";
import { uuid } from "@/lib/security";
export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin"], true);
    const { order_id } = z
      .object({ order_id: uuid })
      .parse(await request.json());
    const db = createServiceClient();
    const { data, error } = await db.rpc("prepare_accounting_invoice", {
      p_tenant: user.tenant_id,
      p_order: order_id,
      p_request: createHash("sha256")
        .update(`${user.tenant_id}:${order_id}`)
        .digest("hex")
        .slice(0, 40),
    });
    if (error)
      throw new HttpError(
        409,
        "Only unpaid local warehouse orders with complete customer, item and tax mappings can be invoiced; Shopify and paid POS orders require financial reconciliation",
      );
    if (data.invoice_id)
      return NextResponse.json({ invoice_id: data.invoice_id, replayed: true });
    const client = await quickBooksConnection(user.tenant_id);
    // Intuit's request-id deduplication has finite retention. Reconcile by the stable document number first.
    const prior = await client.request(
      `query?query=${encodeURIComponent(`select * from Invoice where DocNumber = '${data.snapshot.DocNumber}'`)}&minorversion=75`,
    );
    const matches = prior.QueryResponse?.Invoice || [];
    if (matches.length > 1)
      throw new HttpError(
        409,
        "Multiple matching invoices require accountant reconciliation",
      );
    let result;
    if (matches.length === 1) {
      const invoice = matches[0];
      if (
        invoice.CustomerRef?.value !== data.snapshot.CustomerRef.value ||
        invoice.PrivateNote !== data.snapshot.PrivateNote
      )
        throw new HttpError(
          409,
          "An accounting document number conflict requires reconciliation",
        );
      result = { Invoice: invoice };
    } else {
      if (Date.now() - new Date(data.created_at).getTime() > 86400000)
        throw new HttpError(
          409,
          "This unresolved export is over 24 hours old. Reconcile it with your accountant before creating another invoice.",
        );
      result = await client.request(
        `invoice?minorversion=75&requestid=${data.request_id}`,
        data.snapshot,
      );
    }
    if (!result.Invoice?.Id) throw new Error("QuickBooks returned no invoice");
    const { error: saveError } = await db
      .from("accounting_exports")
      .update({
        invoice_id: String(result.Invoice.Id),
        completed_at: new Date().toISOString(),
      })
      .eq("tenant_id", user.tenant_id)
      .eq("order_id", order_id);
    if (saveError) throw saveError;
    return NextResponse.json({ invoice_id: String(result.Invoice.Id) });
  } catch (error) {
    return routeError(error);
  }
}
