'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart3,
  TrendingUp,
  Package,
  DollarSign,
  AlertTriangle,
  Truck,
  Clock,
  Users,
  Activity,
  ShieldCheck,
  Layers,
  Archive,
  Target,
  Zap,
} from 'lucide-react';
import { formatCurrency, formatNumber, formatDate } from '@/lib/format';

interface MetricsData {
  // KPIs
  totalValue: number;
  totalSKUs: number;
  totalLots: number;
  turnoverRate: number;
  // Inventory Health
  lowStockItems: { name: string; sku: string; stock: number; threshold: number }[];
  stockOutItems: { name: string; sku: string; lastMovement: string | null }[];
  deadStock: { name: string; sku: string; qty: number; lastMove: string | null }[];
  overStockItems: { name: string; sku: string; stock: number; parMax: number }[];
  // Velocity
  topMovers: { name: string; sku: string; shipped: number }[];
  slowMovers: { name: string; sku: string; shipped: number; stock: number }[];
  // Financial
  categoryValues: { category: string; value: number; pct: number }[];
  marginItems: { name: string; sku: string; cost: number; price: number; marginPct: number }[];
  totalCOGS: number;
  totalRevenuePotential: number;
  // Fulfillment
  totalOrders: number;
  shippedOrders: number;
  avgFulfillmentDays: number;
  // Supplier
  supplierPerf: { name: string; poCount: number; onTimePct: number }[];
  // Expiration
  expiringItems: { product: string; lot: string; expDate: string; qty: number; days: number }[];
  expiredCount: number;
}

function MetricBar({ label, value, maxValue, color = 'bg-primary' }: { label: string; value: number; maxValue: number; color?: string }) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium truncate">{label}</span>
        <span className="text-muted-foreground shrink-0 ml-2">{formatNumber(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, title, value, subtitle, alert }: {
  icon: typeof BarChart3; title: string; value: string | number; subtitle?: string; alert?: boolean;
}) {
  return (
    <Card className={alert ? 'border-amber-500/50' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <Icon className={`h-5 w-5 ${alert ? 'text-amber-500' : 'text-muted-foreground'}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function MetricsPage() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MetricsData | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [prodRes, lotRes, movRes, poRes, suppRes, orderRes] = await Promise.all([
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false),
      supabase.from('lots').select('*').eq('tenant_id', tenantId),
      supabase.from('stock_movements').select('*').eq('tenant_id', tenantId),
      supabase.from('purchase_orders').select('*').eq('tenant_id', tenantId),
      supabase.from('suppliers').select('*').eq('tenant_id', tenantId).eq('is_archived', false),
      supabase.from('sales_orders').select('*').eq('tenant_id', tenantId),
    ]);

    const products = prodRes.data || [];
    const lots = lotRes.data || [];
    const movements = movRes.data || [];
    const pos = poRes.data || [];
    const suppliers = suppRes.data || [];
    const orders = orderRes.data || [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

    // Stock by product
    const stockByProduct = new Map<string, number>();
    const activeLots = lots.filter((l) => l.status === 'active');
    activeLots.forEach((l) => {
      stockByProduct.set(l.product_id, (stockByProduct.get(l.product_id) || 0) + l.quantity_on_hand);
    });

    // Total value
    let totalValue = 0;
    activeLots.forEach((l) => { totalValue += l.quantity_on_hand * l.cost_at_receipt; });

    // Turnover
    const totalCostShipped = movements
      .filter((m) => m.movement_type === 'ship')
      .reduce((s, m) => s + Math.abs(m.quantity) * (productMap.get(m.product_id)?.cost || 0), 0);
    const turnover = totalValue > 0 ? parseFloat((totalCostShipped / totalValue).toFixed(1)) : 0;

    // Low stock
    const lowStockItems: MetricsData['lowStockItems'] = [];
    const stockOutItems: MetricsData['stockOutItems'] = [];
    const overStockItems: MetricsData['overStockItems'] = [];

    // Ship volume per product
    const shipVolume = new Map<string, number>();
    movements.filter((m) => m.movement_type === 'ship').forEach((m) => {
      shipVolume.set(m.product_id, (shipVolume.get(m.product_id) || 0) + Math.abs(m.quantity));
    });

    // Last movement per product
    const lastOutbound = new Map<string, string>();
    movements.filter((m) => m.movement_type === 'ship').forEach((m) => {
      const ex = lastOutbound.get(m.product_id);
      if (!ex || m.created_at > ex) lastOutbound.set(m.product_id, m.created_at);
    });

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const deadStock: MetricsData['deadStock'] = [];

    products.forEach((p) => {
      const stock = stockByProduct.get(p.id) || 0;
      if (stock === 0) {
        stockOutItems.push({ name: p.name, sku: p.sku, lastMovement: lastOutbound.get(p.id) || null });
      } else if (stock <= p.low_stock_threshold) {
        lowStockItems.push({ name: p.name, sku: p.sku, stock, threshold: p.low_stock_threshold });
      }
      if (p.par_level_max && stock > p.par_level_max) {
        overStockItems.push({ name: p.name, sku: p.sku, stock, parMax: p.par_level_max });
      }
      if (stock > 0) {
        const lastMove = lastOutbound.get(p.id);
        if (!lastMove || new Date(lastMove) < ninetyDaysAgo) {
          deadStock.push({ name: p.name, sku: p.sku, qty: stock, lastMove: lastMove || null });
        }
      }
    });

    lowStockItems.sort((a, b) => a.stock - b.stock);

    // Top & slow movers
    const topMovers = Array.from(shipVolume.entries())
      .map(([pid, shipped]) => ({ name: productMap.get(pid)?.name || '', sku: productMap.get(pid)?.sku || '', shipped }))
      .filter((m) => m.name)
      .sort((a, b) => b.shipped - a.shipped)
      .slice(0, 10);

    const slowMovers = products
      .filter((p) => (stockByProduct.get(p.id) || 0) > 0)
      .map((p) => ({ name: p.name, sku: p.sku, shipped: shipVolume.get(p.id) || 0, stock: stockByProduct.get(p.id) || 0 }))
      .sort((a, b) => a.shipped - b.shipped)
      .slice(0, 10);

    // Category values
    const catMap = new Map<string, number>();
    activeLots.forEach((l) => {
      const cat = productMap.get(l.product_id)?.category || 'Uncategorized';
      catMap.set(cat, (catMap.get(cat) || 0) + l.quantity_on_hand * l.cost_at_receipt);
    });
    const categoryValues = Array.from(catMap.entries())
      .map(([category, value]) => ({ category, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    // Margins
    const marginItems = products
      .filter((p) => p.price > 0)
      .map((p) => ({ name: p.name, sku: p.sku, cost: p.cost, price: p.price, marginPct: ((p.price - p.cost) / p.price) * 100 }))
      .sort((a, b) => b.marginPct - a.marginPct)
      .slice(0, 15);

    const totalRevenuePotential = products.reduce((s, p) => s + (stockByProduct.get(p.id) || 0) * p.price, 0);

    // Orders
    const shippedOrders = orders.filter((o) => o.status === 'shipped').length;

    // Supplier perf
    const perfMap = new Map<string, { total: number; onTime: number }>();
    pos.filter((po) => po.status === 'received').forEach((po) => {
      const ex = perfMap.get(po.supplier_id) || { total: 0, onTime: 0 };
      ex.total++;
      if (!po.expected_date || new Date(po.updated_at) <= new Date(po.expected_date)) ex.onTime++;
      perfMap.set(po.supplier_id, ex);
    });
    const supplierPerf = Array.from(perfMap.entries())
      .map(([sid, { total, onTime }]) => ({
        name: supplierMap.get(sid)?.name || 'Unknown',
        poCount: total,
        onTimePct: total > 0 ? Math.round((onTime / total) * 100) : 0,
      }))
      .sort((a, b) => b.poCount - a.poCount);

    // Expiration
    const expiringItems = activeLots
      .filter((l) => l.expiration_date && l.quantity_on_hand > 0)
      .map((l) => {
        const days = Math.ceil((new Date(l.expiration_date!).getTime() - Date.now()) / 86400000);
        return {
          product: productMap.get(l.product_id)?.name || '',
          lot: l.lot_number,
          expDate: l.expiration_date!,
          qty: l.quantity_on_hand,
          days,
        };
      })
      .filter((l) => l.days <= 90)
      .sort((a, b) => a.days - b.days);

    const expiredCount = activeLots.filter((l) => {
      if (!l.expiration_date) return false;
      return new Date(l.expiration_date) < new Date() && l.quantity_on_hand > 0;
    }).length;

    setData({
      totalValue,
      totalSKUs: products.length,
      totalLots: activeLots.length,
      turnoverRate: turnover,
      lowStockItems,
      stockOutItems,
      deadStock,
      overStockItems,
      topMovers,
      slowMovers,
      categoryValues,
      marginItems,
      totalCOGS: totalCostShipped,
      totalRevenuePotential,
      totalOrders: orders.length,
      shippedOrders,
      avgFulfillmentDays: 0,
      supplierPerf,
      expiringItems,
      expiredCount,
    });
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Metrics" />
        <div className="text-center py-12 text-muted-foreground">Loading metrics...</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Metrics Command Center" description="Real-time warehouse performance intelligence" />

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KPICard icon={DollarSign} title="Inventory Value" value={formatCurrency(data.totalValue)} />
        <KPICard icon={Package} title="Active SKUs" value={data.totalSKUs} />
        <KPICard icon={TrendingUp} title="Turnover" value={`${data.turnoverRate}x`} subtitle="COGS / avg inv" />
        <KPICard icon={AlertTriangle} title="Stock-Outs" value={data.stockOutItems.length} alert={data.stockOutItems.length > 0} />
        <KPICard icon={Clock} title="Expiring" value={data.expiringItems.length} subtitle="Within 90 days" alert={data.expiringItems.length > 0} />
        <KPICard icon={Archive} title="Dead Stock" value={data.deadStock.length} subtitle="No move 90d" />
      </div>

      {/* Tabbed sections — SAP/Apprise style */}
      <Tabs defaultValue="health" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="health" className="flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /><span className="hidden sm:inline">Inventory Health</span><span className="sm:hidden">Health</span></TabsTrigger>
          <TabsTrigger value="velocity" className="flex items-center gap-1.5"><Zap className="h-4 w-4" /><span className="hidden sm:inline">Velocity</span><span className="sm:hidden">Vel</span></TabsTrigger>
          <TabsTrigger value="financial" className="flex items-center gap-1.5"><DollarSign className="h-4 w-4" /><span className="hidden sm:inline">Financial</span><span className="sm:hidden">Fin</span></TabsTrigger>
          <TabsTrigger value="fulfillment" className="flex items-center gap-1.5"><Truck className="h-4 w-4" /><span className="hidden sm:inline">Fulfillment</span><span className="sm:hidden">Ship</span></TabsTrigger>
          <TabsTrigger value="expiration" className="flex items-center gap-1.5"><Clock className="h-4 w-4" /><span className="hidden sm:inline">Expiration</span><span className="sm:hidden">Exp</span></TabsTrigger>
        </TabsList>

        {/* ── INVENTORY HEALTH ── */}
        <TabsContent value="health">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Stock-Outs */}
            <Card className={data.stockOutItems.length > 0 ? 'border-red-300' : ''}>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-red-500" /> Stock-Out Warnings ({data.stockOutItems.length})</CardTitle></CardHeader>
              <CardContent>
                {data.stockOutItems.length === 0 ? <p className="text-sm text-muted-foreground">No stock-outs</p> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Last Shipped</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.stockOutItems.slice(0, 10).map((item, i) => (
                        <TableRow key={i}>
                          <TableCell><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-muted-foreground font-mono">{item.sku}</p></TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.lastMovement ? formatDate(item.lastMovement) : 'Never'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Low Stock */}
            <Card className={data.lowStockItems.length > 0 ? 'border-amber-300' : ''}>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-amber-500" /> Low Stock ({data.lowStockItems.length})</CardTitle></CardHeader>
              <CardContent>
                {data.lowStockItems.length === 0 ? <p className="text-sm text-muted-foreground">All adequately stocked</p> : (
                  <div className="space-y-3">
                    {data.lowStockItems.slice(0, 8).map((item, i) => (
                      <MetricBar key={i} label={`${item.name} (${item.sku})`} value={item.stock} maxValue={item.threshold} color={item.stock === 0 ? 'bg-red-500' : 'bg-amber-500'} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dead Stock */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Archive className="h-4 w-4 text-gray-500" /> Dead Stock ({data.deadStock.length})</CardTitle></CardHeader>
              <CardContent>
                {data.deadStock.length === 0 ? <p className="text-sm text-muted-foreground">No dead stock</p> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Last Move</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.deadStock.slice(0, 8).map((item, i) => (
                        <TableRow key={i}>
                          <TableCell><p className="font-medium text-sm">{item.name}</p><p className="text-xs text-muted-foreground font-mono">{item.sku}</p></TableCell>
                          <TableCell className="text-right">{item.qty}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.lastMove ? formatDate(item.lastMove) : 'Never'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Overstock */}
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers className="h-4 w-4 text-blue-500" /> Overstock ({data.overStockItems.length})</CardTitle></CardHeader>
              <CardContent>
                {data.overStockItems.length === 0 ? <p className="text-sm text-muted-foreground">No overstock items</p> : (
                  <div className="space-y-3">
                    {data.overStockItems.slice(0, 8).map((item, i) => (
                      <MetricBar key={i} label={`${item.name}`} value={item.stock} maxValue={item.stock} color="bg-blue-500" />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── VELOCITY ── */}
        <TabsContent value="velocity">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-green-500" /> Top Movers</CardTitle></CardHeader>
              <CardContent>
                {data.topMovers.length === 0 ? <p className="text-sm text-muted-foreground">No data</p> : (
                  <div className="space-y-3">
                    {data.topMovers.map((m, i) => (
                      <MetricBar key={i} label={`#${i + 1} ${m.name}`} value={m.shipped} maxValue={data.topMovers[0]?.shipped || 1} color="bg-green-500" />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-gray-500" /> Slow Movers</CardTitle></CardHeader>
              <CardContent>
                {data.slowMovers.length === 0 ? <p className="text-sm text-muted-foreground">No data</p> : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Shipped</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.slowMovers.map((m, i) => (
                        <TableRow key={i}>
                          <TableCell><p className="font-medium text-sm">{m.name}</p><p className="text-xs text-muted-foreground font-mono">{m.sku}</p></TableCell>
                          <TableCell className="text-right">{m.stock}</TableCell>
                          <TableCell className="text-right">{m.shipped}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── FINANCIAL ── */}
        <TabsContent value="financial">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KPICard icon={DollarSign} title="Total COGS" value={formatCurrency(data.totalCOGS)} />
            <KPICard icon={DollarSign} title="Revenue Potential" value={formatCurrency(data.totalRevenuePotential)} subtitle="Stock × price" />
            <KPICard icon={BarChart3} title="Gross Margin" value={data.totalRevenuePotential > 0 ? `${(((data.totalRevenuePotential - data.totalValue) / data.totalRevenuePotential) * 100).toFixed(1)}%` : '0%'} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base">Value by Category</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.categoryValues.map((c, i) => (
                    <MetricBar key={i} label={c.category} value={c.value} maxValue={data.categoryValues[0]?.value || 1} color="bg-primary" />
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top Margins</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Cost</TableHead><TableHead className="text-right">Price</TableHead><TableHead className="text-right">Margin</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.marginItems.slice(0, 10).map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm">{m.name}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{formatCurrency(m.cost)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(m.price)}</TableCell>
                        <TableCell className="text-right"><Badge variant="outline" className={m.marginPct >= 50 ? 'bg-green-100 text-green-800' : m.marginPct >= 20 ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}>{m.marginPct.toFixed(1)}%</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── FULFILLMENT ── */}
        <TabsContent value="fulfillment">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <KPICard icon={Truck} title="Total Orders" value={data.totalOrders} />
            <KPICard icon={ShieldCheck} title="Shipped" value={data.shippedOrders} />
            <KPICard icon={BarChart3} title="Fill Rate" value={data.totalOrders > 0 ? `${((data.shippedOrders / data.totalOrders) * 100).toFixed(0)}%` : '—'} />
          </div>
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Supplier Performance</CardTitle></CardHeader>
            <CardContent>
              {data.supplierPerf.length === 0 ? <p className="text-sm text-muted-foreground">No supplier data</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Supplier</TableHead><TableHead className="text-right">POs</TableHead><TableHead className="text-right">On-Time</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.supplierPerf.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{s.name}</TableCell>
                        <TableCell className="text-right">{s.poCount}</TableCell>
                        <TableCell className="text-right"><Badge variant="outline" className={s.onTimePct >= 90 ? 'bg-green-100 text-green-800' : s.onTimePct >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}>{s.onTimePct}%</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── EXPIRATION ── */}
        <TabsContent value="expiration">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <KPICard icon={Clock} title="Expiring (90 days)" value={data.expiringItems.length} alert={data.expiringItems.length > 0} />
            <KPICard icon={AlertTriangle} title="Already Expired" value={data.expiredCount} alert={data.expiredCount > 0} subtitle="Still in stock" />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Expiring Lots (FIFO Order)</CardTitle></CardHeader>
            <CardContent>
              {data.expiringItems.length === 0 ? <p className="text-sm text-muted-foreground">No lots expiring within 90 days</p> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Lot</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Expires</TableHead><TableHead className="text-right">Days</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.expiringItems.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium text-sm">{item.product}</TableCell>
                        <TableCell className="font-mono text-xs">{item.lot}</TableCell>
                        <TableCell className="text-right">{item.qty}</TableCell>
                        <TableCell className="text-sm">{formatDate(item.expDate)}</TableCell>
                        <TableCell className="text-right"><Badge variant="outline" className={item.days <= 0 ? 'bg-red-100 text-red-800' : item.days <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}>{item.days <= 0 ? 'EXPIRED' : `${item.days}d`}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
