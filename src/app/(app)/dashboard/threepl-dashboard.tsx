'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Users, Package, Truck, DollarSign, Warehouse, ClipboardList, ArrowRight, Loader2,
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/format';

interface ThreePLKPIs {
  totalClients: number;
  totalSKUs: number;
  ordersThisMonth: number;
  inventoryValue: number;
  clients: { id: string; name: string; skuCount: number; orderCount: number }[];
}

export function ThreePLDashboard() {
  const { tenantId } = useAuth();
  const router = useRouter();
  const [kpi, setKpi] = useState<ThreePLKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      const supabase = createClient();

      // Clients = customers
      const { data: customers } = await supabase
        .from('customers').select('id, name')
        .eq('tenant_id', tenantId!).eq('is_archived', false);

      // Products per client (via supplier or direct)
      const { count: totalSKUs } = await supabase
        .from('products').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!).eq('is_archived', false);

      // Orders this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data: orders } = await supabase
        .from('sales_orders').select('customer_id')
        .eq('tenant_id', tenantId!).gte('created_at', monthStart.toISOString());

      // Inventory value
      const { data: lots } = await supabase
        .from('lots').select('quantity_on_hand, cost_at_receipt')
        .eq('tenant_id', tenantId!).eq('status', 'active');
      const invValue = (lots || []).reduce((s, l) => s + l.quantity_on_hand * l.cost_at_receipt, 0);

      // Per-client stats
      const ordersByClient = new Map<string, number>();
      (orders || []).forEach((o) => {
        ordersByClient.set(o.customer_id, (ordersByClient.get(o.customer_id) || 0) + 1);
      });

      const clients = (customers || []).map((c) => ({
        id: c.id, name: c.name,
        skuCount: 0, // would need per-client product mapping
        orderCount: ordersByClient.get(c.id) || 0,
      })).sort((a, b) => b.orderCount - a.orderCount);

      setKpi({
        totalClients: (customers || []).length,
        totalSKUs: totalSKUs || 0,
        ordersThisMonth: (orders || []).length,
        inventoryValue: invValue,
        clients,
      });
      setLoading(false);
    }
    load();
  }, [tenantId]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-blue-600" /><span className="text-xs text-muted-foreground">Active Clients</span></div>
          <p className="text-2xl font-bold">{kpi?.totalClients || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-green-600" /><span className="text-xs text-muted-foreground">Total SKUs</span></div>
          <p className="text-2xl font-bold">{formatNumber(kpi?.totalSKUs || 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Truck className="h-4 w-4 text-amber-600" /><span className="text-xs text-muted-foreground">Orders (MTD)</span></div>
          <p className="text-2xl font-bold">{kpi?.ordersThisMonth || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-purple-600" /><span className="text-xs text-muted-foreground">Inv. Value</span></div>
          <p className="text-2xl font-bold">{formatCurrency(kpi?.inventoryValue || 0)}</p>
        </CardContent></Card>
      </div>

      {/* Client list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Clients</CardTitle>
          <Button variant="outline" size="sm" onClick={() => router.push('/customers')}>
            <Users className="h-3.5 w-3.5 mr-1" /> Manage Clients
          </Button>
        </CardHeader>
        <CardContent>
          {(kpi?.clients || []).length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="font-semibold">No clients yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first client to start managing their inventory</p>
              <Button className="mt-4" onClick={() => router.push('/customers')}>
                Add Client <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {kpi?.clients.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/30 cursor-pointer transition"
                  onClick={() => router.push('/customers')}>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                      {c.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.orderCount} orders this month</p>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Receive', href: '/receive', icon: Package },
          { label: 'Ship', href: '/ship', icon: Truck },
          { label: 'Scanner', href: '/scanner', icon: Warehouse },
          { label: 'Task Board', href: '/task-board', icon: ClipboardList },
        ].map((a) => (
          <Card key={a.href} className="cursor-pointer hover:shadow-sm transition" onClick={() => router.push(a.href)}>
            <CardContent className="p-4 flex items-center gap-3">
              <a.icon className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm font-medium">{a.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
