'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { generateInvoicePDF, generatePackingSlipPDF } from '@/lib/pdf';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Printer, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface InvoiceButtonProps {
  orderId: string;
  tenantId: string;
}

export function InvoiceButton({ orderId, tenantId }: InvoiceButtonProps) {
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [loadingSlip, setLoadingSlip] = useState(false);

  async function fetchOrderData() {
    const supabase = createClient();

    // Fetch order with customer
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('*, customer:customers(*)')
      .eq('id', orderId)
      .single();

    if (orderErr || !order) throw new Error('Failed to load order');

    // Fetch order lines with products
    const { data: lines } = await supabase
      .from('sales_order_lines')
      .select('*, product:products(*)')
      .eq('order_id', orderId);

    // Fetch tenant info
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name, settings')
      .eq('id', tenantId)
      .single();

    // Fetch shipment for this order (for packing slip)
    const { data: shipment } = await supabase
      .from('shipments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Fetch shipment lines with lot info if shipment exists
    let shipmentLines: Array<{
      product_id: string;
      quantity: number;
      lot?: { lot_number: string } | null;
      product?: { name: string; sku: string } | null;
    }> = [];
    if (shipment) {
      const { data: sLines } = await supabase
        .from('shipment_lines')
        .select('*, product:products(name, sku), lot:lots(lot_number)')
        .eq('shipment_id', shipment.id);
      shipmentLines = sLines || [];
    }

    return { order, lines: lines || [], tenant, shipment, shipmentLines };
  }

  async function handlePrintInvoice() {
    setLoadingInvoice(true);
    try {
      const { order, lines, tenant } = await fetchOrderData();
      const settings = (tenant?.settings || {}) as Record<string, string>;

      const invoiceLines = lines.map((line: { product?: { name: string; sku: string } | null; quantity_ordered: number; unit_price: number }) => ({
        productName: line.product?.name || 'Unknown Product',
        sku: line.product?.sku || '',
        quantity: line.quantity_ordered,
        unitPrice: line.unit_price,
        lineTotal: line.quantity_ordered * line.unit_price,
      }));

      const subtotal = invoiceLines.reduce((sum: number, l: { lineTotal: number }) => sum + l.lineTotal, 0);
      const taxRate = parseFloat(settings.tax_rate || '0') / 100;
      const tax = subtotal * taxRate;

      generateInvoicePDF({
        companyName: tenant?.name || 'Company',
        companyAddress: settings.address || '',
        invoiceNumber: order.order_number,
        invoiceDate: formatDate(order.ship_date || order.created_at),
        customerName: order.customer?.name || 'Customer',
        customerEmail: order.customer?.email || null,
        customerPhone: order.customer?.phone || null,
        customerAddress: order.customer?.ship_to_address || null,
        lines: invoiceLines,
        subtotal,
        tax,
        total: subtotal + tax,
        paymentTerms: settings.payment_terms || undefined,
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate invoice');
    } finally {
      setLoadingInvoice(false);
    }
  }

  async function handlePrintPackingSlip() {
    setLoadingSlip(true);
    try {
      const { order, shipment, shipmentLines, tenant } = await fetchOrderData();
      const settings = (tenant?.settings || {}) as Record<string, string>;

      const slipLines = shipmentLines.map((line) => ({
        productName: line.product?.name || 'Unknown Product',
        sku: line.product?.sku || '',
        lotNumber: line.lot?.lot_number || null,
        quantity: line.quantity,
      }));

      generatePackingSlipPDF({
        companyName: tenant?.name || 'Company',
        companyAddress: settings.address || '',
        shipmentNumber: order.order_number,
        shipmentDate: formatDate(shipment?.shipped_at || order.ship_date || order.created_at),
        trackingNumber: shipment?.tracking_number || null,
        customerName: order.customer?.name || 'Customer',
        customerAddress: order.customer?.ship_to_address || null,
        lines: slipLines,
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate packing slip');
    } finally {
      setLoadingSlip(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePrintInvoice}
        disabled={loadingInvoice}
        title="Print Invoice"
      >
        {loadingInvoice ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handlePrintPackingSlip}
        disabled={loadingSlip}
        title="Print Packing Slip"
      >
        {loadingSlip ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Printer className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
