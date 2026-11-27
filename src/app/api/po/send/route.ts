import { PRODUCT_NAME } from "@/lib/brand";
import { escapeHtml } from "@/lib/html";
import { requireUser, routeError } from "@/lib/server-auth";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function svc() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
  try {
    const authorizedUser = await requireUser(["admin", "manager"], true);
    const authUser = authorizedUser;

    const { po_id } = await request.json();
    if (!po_id)
      return NextResponse.json({ error: "po_id required" }, { status: 400 });

    const supabase = svc();

    // Get PO with supplier and lines
    const { data: po, error: poErr } = await supabase
      .from("purchase_orders")
      .select("*, supplier:suppliers(*)")
      .eq("id", po_id)
      .eq("tenant_id", authUser.tenant_id)
      .single();

    if (poErr || !po)
      return NextResponse.json({ error: "PO not found" }, { status: 404 });

    const supplier = po.supplier as Record<string, string> | null;
    if (!supplier?.email) {
      return NextResponse.json(
        { error: "Supplier has no email address on file" },
        { status: 400 },
      );
    }

    // Get PO lines with product details
    const { data: lines } = await supabase
      .from("po_lines")
      .select("*, product:products(name, sku, unit_of_measure)")
      .eq("po_id", po_id);

    // Get tenant info for ship-to
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, settings")
      .eq("id", authUser.tenant_id)
      .single();

    const tenantName = tenant?.name || "Our Company";
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const shipTo = (settings.address as string) || "";

    // Build email body
    const lineRows = (lines || [])
      .map((l: Record<string, unknown>) => {
        const prod = l.product as Record<string, string> | null;
        return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(prod?.sku || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(prod?.name || l.description || "—")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${escapeHtml(l.quantity_ordered)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${escapeHtml(prod?.unit_of_measure || "ea")}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${(Number(l.unit_cost) || 0).toFixed(2)}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${((Number(l.quantity_ordered) || 0) * (Number(l.unit_cost) || 0)).toFixed(2)}</td>
      </tr>`;
      })
      .join("");

    const totalAmount = (lines || []).reduce(
      (s: number, l: Record<string, unknown>) =>
        s + (Number(l.quantity_ordered) || 0) * (Number(l.unit_cost) || 0),
      0,
    );

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto">
        <h2 style="color:#1a2744">Purchase Order: ${escapeHtml(po.po_number)}</h2>
        <p>Dear ${escapeHtml(supplier.contact_name || supplier.name)},</p>
        <p>Please find our purchase order below. We kindly request confirmation of receipt and expected delivery date.</p>

        <table style="width:100%;margin:20px 0;font-size:14px">
          <tr><td><strong>PO Number:</strong></td><td>${escapeHtml(po.po_number)}</td></tr>
          <tr><td><strong>Date:</strong></td><td>${new Date().toLocaleDateString()}</td></tr>
          ${po.expected_date ? `<tr><td><strong>Requested Delivery:</strong></td><td>${new Date(po.expected_date).toLocaleDateString()}</td></tr>` : ""}
          <tr><td><strong>Ship To:</strong></td><td>${escapeHtml(tenantName)}${shipTo ? "<br>" + escapeHtml(shipTo) : ""}</td></tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
          <thead>
            <tr style="background:#f8f9fa">
              <th style="padding:10px;text-align:left;border-bottom:2px solid #dee2e6">SKU</th>
              <th style="padding:10px;text-align:left;border-bottom:2px solid #dee2e6">Product</th>
              <th style="padding:10px;text-align:center;border-bottom:2px solid #dee2e6">Qty</th>
              <th style="padding:10px;text-align:center;border-bottom:2px solid #dee2e6">UOM</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #dee2e6">Unit Cost</th>
              <th style="padding:10px;text-align:right;border-bottom:2px solid #dee2e6">Total</th>
            </tr>
          </thead>
          <tbody>${lineRows}</tbody>
          <tfoot>
            <tr style="font-weight:bold">
              <td colspan="5" style="padding:10px;text-align:right;border-top:2px solid #dee2e6">Total:</td>
              <td style="padding:10px;text-align:right;border-top:2px solid #dee2e6">$${totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        ${po.notes ? `<p><strong>Notes:</strong> ${escapeHtml(po.notes)}</p>` : ""}

        <p>Please confirm this order by replying to this email.</p>
        <p>Thank you,<br>${escapeHtml(authUser.full_name)}<br>${escapeHtml(tenantName)}</p>

        <hr style="margin:30px 0;border:none;border-top:1px solid #eee">
        <p style="font-size:12px;color:#999">Sent via ${PRODUCT_NAME}</p>
      </div>
    `;

    // Send via Resend if configured, otherwise log
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey)
      return NextResponse.json(
        { error: "Email delivery is not configured; PO was not sent" },
        { status: 503 },
      );
    if (resendKey) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${escapeHtml(tenantName)} <orders@${process.env.NEXT_PUBLIC_APP_DOMAIN || "stokora.com"}>`,
          to: supplier.email,
          subject: `Purchase Order ${escapeHtml(po.po_number)} from ${escapeHtml(tenantName)}`,
          html: htmlBody,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        return NextResponse.json(
          { error: errData.message || "Email send failed" },
          { status: 500 },
        );
      }
    }

    // Update PO status to 'sent'
    await supabase
      .from("purchase_orders")
      .update({ status: "sent" })
      .eq("id", po_id);

    // Log to audit
    await supabase.from("stock_movements").insert({
      tenant_id: authUser.tenant_id,
      product_id: null,
      user_id: authUser.id,
      quantity: 0,
      movement_type: "adjust",
      reason: `PO ${escapeHtml(po.po_number)} sent to ${supplier.name} (${supplier.email})`,
      reference_number: po.po_number,
      metadata: {
        action: "po_sent",
        supplier_email: supplier.email,
        line_count: (lines || []).length,
      },
    });

    return NextResponse.json({
      success: true,
      sent_to: supplier.email,
      po_number: po.po_number,
      lines: (lines || []).length,
      total: totalAmount,
      email_sent: !!resendKey,
    });
  } catch (err) {
    return routeError(err);
  }
}
