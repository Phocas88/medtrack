'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DollarSign,
  Package,
  Clock,
  ShoppingCart,
  Users,
  FileText,
  Download,
} from 'lucide-react';
import { formatDateTime, movementTypeLabel } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';

export default function ReportsPage() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);

  async function runReport(reportId: string) {
    if (!tenantId) return;
    setLoading(reportId);
    const supabase = createClient();

    try {
      switch (reportId) {
        case 'inventory-valuation': {
          const { data: lots } = await supabase
            .from('lots')
            .select('product_id, quantity_on_hand')
            .eq('tenant_id', tenantId)
            .eq('status', 'active');

          const stockMap: Record<string, number> = {};
          (lots || []).forEach((l) => {
            stockMap[l.product_id] = (stockMap[l.product_id] || 0) + l.quantity_on_hand;
          });

          const { data: allProducts } = await supabase
            .from('products')
            .select('id, name, sku, cost, price')
            .eq('tenant_id', tenantId)
            .eq('is_archived', false);

          const rows = (allProducts || []).map((p) => ({
            sku: p.sku,
            product: p.name,
            on_hand: stockMap[p.id] || 0,
            unit_cost: p.cost,
            unit_price: p.price,
            total_cost: ((stockMap[p.id] || 0) * p.cost).toFixed(2),
            total_retail: ((stockMap[p.id] || 0) * p.price).toFixed(2),
          }));
          exportToCSV(rows, 'inventory_valuation');
          break;
        }

        case 'stock-on-hand': {
          const { data: lots } = await supabase
            .from('lots')
            .select('lot_number, quantity_on_hand, location, expiration_date, status, product:products(name, sku)')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .gt('quantity_on_hand', 0);

          const rows = (lots || []).map((l) => {
            const p = l.product as unknown as { name: string; sku: string };
            return {
              product: p?.name || '',
              sku: p?.sku || '',
              lot_number: l.lot_number,
              quantity: l.quantity_on_hand,
              location: l.location || '',
              expiration: l.expiration_date || '',
              status: l.status,
            };
          });
          exportToCSV(rows, 'stock_on_hand');
          break;
        }

        case 'expiration': {
          const { data: lots } = await supabase
            .from('lots')
            .select('lot_number, quantity_on_hand, expiration_date, location, product:products(name, sku)')
            .eq('tenant_id', tenantId)
            .eq('status', 'active')
            .gt('quantity_on_hand', 0)
            .not('expiration_date', 'is', null)
            .order('expiration_date');

          const rows = (lots || []).map((l) => {
            const p = l.product as unknown as { name: string; sku: string };
            const days = l.expiration_date ? Math.ceil((new Date(l.expiration_date).getTime() - Date.now()) / 86400000) : null;
            return {
              product: p?.name || '',
              sku: p?.sku || '',
              lot_number: l.lot_number,
              quantity: l.quantity_on_hand,
              expiration_date: l.expiration_date || '',
              days_remaining: days ?? '',
              location: l.location || '',
            };
          });
          exportToCSV(rows, 'expiration_report');
          break;
        }

        case 'sales-by-lot': {
          const { data: shipmentLines } = await supabase
            .from('shipment_lines')
            .select(`
              quantity,
              lot:lots(lot_number, expiration_date),
              product:products(name, sku),
              shipment:shipments(shipped_at, customer:customers(name), order:sales_orders(order_number))
            `)
            .eq('tenant_id', tenantId);

          const rows = (shipmentLines || []).map((sl) => {
            const lot = sl.lot as unknown as { lot_number: string; expiration_date: string } | null;
            const product = sl.product as unknown as { name: string; sku: string } | null;
            const shipment = sl.shipment as unknown as { shipped_at: string; customer: { name: string }; order: { order_number: string } } | null;
            return {
              product: product?.name || '',
              sku: product?.sku || '',
              lot_number: lot?.lot_number || '',
              quantity_shipped: sl.quantity,
              customer: shipment?.customer?.name || '',
              ship_date: formatDateTime(shipment?.shipped_at || ''),
              order_number: shipment?.order?.order_number || '',
            };
          });
          exportToCSV(rows, 'sales_by_lot');
          break;
        }

        case 'customer-history': {
          const { data: shipmentLines } = await supabase
            .from('shipment_lines')
            .select(`
              quantity,
              lot:lots(lot_number),
              product:products(name, sku),
              shipment:shipments(shipped_at, customer:customers(name, email))
            `)
            .eq('tenant_id', tenantId);

          const rows = (shipmentLines || []).map((sl) => {
            const lot = sl.lot as unknown as { lot_number: string } | null;
            const product = sl.product as unknown as { name: string; sku: string } | null;
            const shipment = sl.shipment as unknown as { shipped_at: string; customer: { name: string; email: string } } | null;
            return {
              customer: shipment?.customer?.name || '',
              customer_email: shipment?.customer?.email || '',
              product: product?.name || '',
              sku: product?.sku || '',
              lot_number: lot?.lot_number || '',
              quantity: sl.quantity,
              ship_date: formatDateTime(shipment?.shipped_at || ''),
            };
          });
          exportToCSV(rows, 'customer_purchase_history');
          break;
        }

        case 'audit-log': {
          const { data: movements } = await supabase
            .from('stock_movements')
            .select('*, product:products(name, sku), lot:lots(lot_number), user:users(full_name)')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5000);

          const rows = (movements || []).map((m) => ({
            date: formatDateTime(m.created_at),
            type: movementTypeLabel(m.movement_type),
            product: (m.product as unknown as { name: string })?.name || '',
            sku: (m.product as unknown as { sku: string })?.sku || '',
            lot_number: (m.lot as unknown as { lot_number: string })?.lot_number || '',
            quantity: m.quantity,
            user: (m.user as unknown as { full_name: string })?.full_name || '',
            reason: m.reason || '',
            reference: m.reference_number || '',
          }));
          exportToCSV(rows, 'audit_log');
          break;
        }
      }
      toast.success('Report exported');
    } catch {
      toast.error('Failed to generate report');
    }
    setLoading(null);
  }

  const reports = [
    { id: 'inventory-valuation', title: 'Inventory Valuation', desc: 'Cost and retail value of all products on hand', icon: DollarSign },
    { id: 'stock-on-hand', title: 'Stock on Hand', desc: 'Current stock by product and location', icon: Package },
    { id: 'expiration', title: 'Expiration Report', desc: 'All lots with expiration dates, sorted by soonest', icon: Clock },
    { id: 'sales-by-lot', title: 'Sales by Lot', desc: 'Shipments broken down by lot number', icon: ShoppingCart },
    { id: 'customer-history', title: 'Customer Purchase History', desc: 'What each customer received with lot traceability', icon: Users },
    { id: 'audit-log', title: 'Audit Log Export', desc: 'Full movement history for inspections', icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Export inventory and compliance reports" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <report.icon className="h-4 w-4 text-muted-foreground" />
                {report.title}
              </CardTitle>
              <CardDescription>{report.desc}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                onClick={() => runReport(report.id)}
                disabled={loading === report.id}
              >
                <Download className="h-4 w-4 mr-2" />
                {loading === report.id ? 'Generating...' : 'Export CSV'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
