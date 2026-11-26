'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DollarSign, Package, ShoppingCart, AlertTriangle, RefreshCw, TrendingUp, ArrowRight, Loader2,
} from 'lucide-react';
import { formatCurrency, formatRelativeDate } from '@/lib/format';

interface LiteKPIs {
  revenue: number;
  cogs: number;
  profit: number;
  marginPct: number;
  orderCount: number;
  lowStockCount: number;
  openPOs: number;
  inventoryValue: number;
  lastSync: string | null;
  shopifyConnected: boolean;
  recentOrders: { order_number: string; status: string; created_at: string; total: number }[];
}

export function LiteDashboard() {
  const { tenantId } = useAuth();
  const router = useRouter();
  const [kpi, setKpi] = useState<LiteKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      const supabase = createClient();

      // Get tenant settings for Shopify status
      const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', tenantId!).single();
      const settings = (tenant?.settings as Record<string, unknown>) || {};
      const shopify = (settings.shopify as Record<string, unknown>) || {};

      // Revenue from ship movements this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data: movements } = await supabase
        .from('stock_movements').select('quantity, product_id')
        .eq('tenant_id', tenantId!).eq('movement_type', 'ship')
        .gte('created_at', monthStart.toISOString());

      const { data: products } = await supabase
        .from('products').select('id, price, cost, low_stock_threshold')
        .eq('tenant_id', tenantId!).eq('is_archived', false);

      const prodMap = new Map((products || []).map((p) => [p.id, p]));

      let revenue = 0, cogs = 0;
      (movements || []).forEach((m) => {
        const p = prodMap.get(m.product_id);
        if (p) {
          revenue += Math.abs(m.quantity) * p.price;
          cogs += Math.abs(m.quantity) * p.cost;
        }
      });

      // Inventory value + low stock
      const { data: lots } = await supabase
        .from('lots').select('product_id, quantity_on_hand, cost_at_receipt')
        .eq('tenant_id', tenantId!).eq('status', 'active');

      let invValue = 0;
      const stockByProduct = new Map<string, number>();
      (lots || []).forEach((l) => {
        invValue += l.quantity_on_hand * l.cost_at_receipt;
        stockByProduct.set(l.product_id, (stockByProduct.get(l.product_id) || 0) + l.quantity_on_hand);
      });

      let lowStock = 0;
      (products || []).forEach((p) => {
        const stock = stockByProduct.get(p.id) || 0;
        if (stock <= p.low_stock_threshold) lowStock++;
      });

      // Open POs
      const { count: openPOs } = await supabase
        .from('purchase_orders').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!).in('status', ['draft', 'sent', 'partial']);

      // Recent orders
      const { data: orders } = await supabase
        .from('sales_orders').select('order_number, status, created_at')
        .eq('tenant_id', tenantId!).order('created_at', { ascending: false }).limit(8);

      const profit = revenue - cogs;

      setKpi({
        revenue, cogs, profit,
        marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
        orderCount: (movements || []).length,
        lowStockCount: lowStock,
        openPOs: openPOs || 0,
        inventoryValue: invValue,
        lastSync: (shopify.last_sync as string) || null,
        shopifyConnected: !!(shopify.connected || shopify.store_url),
        recentOrders: (orders || []).map((o) => ({ ...o, total: 0 })),
      });
      setLoading(false);
    }
    load();
  }, [tenantId]);

  const handleSync = async () => {
    setSyncing(true);
    await fetch('/api/shopify/sync-products', { method: 'POST' });
    await fetch('/api/shopify/sync-orders', { method: 'POST' });
    setSyncing(false);
    window.location.reload();
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  // Not connected to Shopify — show CTA
  if (!kpi?.shopifyConnected) {
    return (
      <div className="flex items-center justify-center py-20">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-6 space-y-4">
            <ShoppingCart className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold">Connect Your Shopify Store</h2>
            <p className="text-sm text-muted-foreground">Sync products, orders, and inventory to get started with Stokora.</p>
            <Button onClick={() => router.push('/integrations/shopify')}>
              Connect Shopify <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-600" /><span className="text-xs text-muted-foreground">Revenue (MTD)</span></div>
          <p className="text-xl font-bold truncate">{formatCurrency(kpi?.revenue || 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-blue-600" /><span className="text-xs text-muted-foreground">Profit</span></div>
          <p className="text-xl font-bold truncate">{formatCurrency(kpi?.profit || 0)}</p>
          <p className="text-xs text-muted-foreground">{(kpi?.marginPct || 0).toFixed(1)}% margin</p>
        </CardContent></Card>
        <Card className={kpi?.lowStockCount ? 'border-amber-300' : ''}><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-amber-600" /><span className="text-xs text-muted-foreground">Low Stock</span></div>
          <p className="text-xl font-bold truncate">{kpi?.lowStockCount || 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-purple-600" /><span className="text-xs text-muted-foreground">Inv. Value</span></div>
          <p className="text-xl font-bold truncate">{formatCurrency(kpi?.inventoryValue || 0)}</p>
        </CardContent></Card>
      </div>

      {/* Shopify sync status + actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Shopify Sync</p>
            <p className="text-xs text-muted-foreground">{kpi?.lastSync ? `Last: ${formatRelativeDate(kpi.lastSync)}` : 'Never synced'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </CardContent></Card>
        <Card className="cursor-pointer hover:shadow-sm transition" onClick={() => router.push('/reorder')}><CardContent className="p-4">
          <p className="text-sm font-medium">Open POs</p>
          <p className="text-xl font-bold truncate">{kpi?.openPOs || 0}</p>
        </CardContent></Card>
        <Card className="cursor-pointer hover:shadow-sm transition" onClick={() => router.push('/products')}><CardContent className="p-4">
          <p className="text-sm font-medium">Orders This Month</p>
          <p className="text-xl font-bold truncate">{kpi?.orderCount || 0}</p>
        </CardContent></Card>
      </div>

      {/* Recent orders */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {(kpi?.recentOrders || []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No orders yet. Sync from Shopify to import.</p>
          ) : (
            <div className="space-y-2">
              {(kpi?.recentOrders || []).map((o, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium font-mono">{o.order_number}</p>
                    <p className="text-xs text-muted-foreground">{formatRelativeDate(o.created_at)}</p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">{o.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Products', href: '/products', icon: Package },
          { label: 'Purchase Orders', href: '/purchase-orders', icon: ShoppingCart },
          { label: 'Reorder', href: '/reorder', icon: AlertTriangle },
          { label: 'Reports', href: '/reports', icon: TrendingUp },
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
