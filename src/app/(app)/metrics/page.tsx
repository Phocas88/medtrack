'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ShiftPriorities } from '@/components/workspace/shift-priorities';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  ChevronRight,
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
  months: Month[];
  details: Record<string, Detail[]>;
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

type Detail = { id: string; label: string; context?: string; value: string };
type Month = {
  key: string;
  label: string;
  received: number;
  shipped: number;
  orders: number;
  records: Detail[];
};

function DetailRows({ rows }: { rows: Detail[] }) {
  const [limit, setLimit] = useState(25);
  if (!rows.length) return <p className="text-sm text-muted-foreground">No matching records.</p>;
  return (
    <div className="min-h-0 overflow-y-auto overscroll-contain">
      <ul className="divide-y">
        {rows.slice(0, limit).map(row => (
          <li key={row.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2 text-sm">
            <div className="min-w-0 flex-1 break-words">
              <p className="font-medium">{row.label}</p>
              {row.context && <p className="text-muted-foreground">{row.context}</p>}
            </div>
            <span className="max-w-full break-all tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <button type="button" className="mt-2 min-h-11 rounded-md border px-3 text-sm"
          onClick={() => setLimit(limit + 25)}>Show more ({limit} of {rows.length} shown)</button>
      )}
    </div>
  );
}

function KPICard({ icon: Icon, title, value, subtitle, alert, rows }: {
  icon: typeof BarChart3; title: string; value: string | number; subtitle?: string; alert?: boolean; rows: Detail[];
}) {
  const displayValue = typeof value === 'number' ? formatNumber(value) : value;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={`min-w-0 rounded-lg border bg-card p-3 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${alert ? 'border-amber-500/50' : ''}`}>
          <span className="flex items-start gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon aria-hidden className={`mt-0.5 size-3.5 shrink-0 ${alert ? 'text-amber-600' : ''}`} />
            <span className="min-w-0 flex-1">{title}</span>
            <ChevronRight aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          </span>
          <span className="mt-1 block break-all text-lg font-semibold leading-tight tabular-nums sm:text-xl">{displayValue}</span>
          {subtitle && <span className="mt-1 block text-xs text-muted-foreground">{subtitle}</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%_-_1.5rem)] min-w-0 flex-col rounded-lg p-4 sm:p-6">
        <DialogTitle className="pr-6">{title}</DialogTitle>
        <DialogDescription>{displayValue} · {formatNumber(rows.length)} supporting records{subtitle ? ' · ' + subtitle : ''}</DialogDescription>
        <DetailRows rows={rows} />
      </DialogContent>
    </Dialog>
  );
}

const trendSeries = [
  { key: 'received', label: 'Units received', color: 'bg-blue-600' },
  { key: 'shipped', label: 'Units shipped', color: 'bg-emerald-600' },
  { key: 'orders', label: 'Orders placed', color: 'bg-violet-600' },
] as const;

function TrendCharts({ months }: { months: Month[] }) {
  const [range, setRange] = useState(12);
  const [monthKey, setMonthKey] = useState('');
  const visible = months.slice(-range);
  const selected = visible.find(month => month.key === monthKey) ?? visible[visible.length - 1];

  return (
    <section className="space-y-3" aria-labelledby="trends-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="trends-heading" className="text-lg font-semibold">Warehouse trends</h2>
          <p className="text-xs text-muted-foreground">Select any month to see its activity. The current month is partial.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Trend period</span>
          <select value={range} onChange={event => setRange(Number(event.target.value))}
            className="min-h-10 rounded-md border bg-background px-2">
            <option value={6}>6 months</option>
            <option value={12}>12 months</option>
            <option value={24}>24 months</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {trendSeries.map(series => {
          const max = Math.max(1, ...visible.map(month => month[series.key]));
          const total = visible.reduce((sum, month) => sum + month[series.key], 0);
          return (
            <Card key={series.key} className="min-w-0 p-3">
              <h3 className="text-sm font-medium text-muted-foreground">{series.label}</h3>
              <p className="break-all text-lg font-semibold tabular-nums">{formatNumber(total)}</p>
              <div className="mt-2 flex min-w-0 gap-1 overflow-x-auto pb-1">
                {visible.map(month => (
                  <button key={month.key} type="button" onClick={() => setMonthKey(month.key)}
                    aria-label={`${month.label}: ${formatNumber(month[series.key])} ${series.label.toLowerCase()}`}
                    aria-pressed={month.key === selected.key}
                    title={`${month.label}: ${formatNumber(month[series.key])}`}
                    className="flex h-24 min-w-5 flex-1 items-end rounded-t bg-muted/50 px-px outline-offset-[-2px] hover:bg-muted focus-visible:outline focus-visible:outline-2 aria-pressed:bg-muted">
                    <span aria-hidden className={`w-full rounded-t ${series.color} ${month.key === selected.key ? '' : 'opacity-65'}`}
                      style={{ height: `${month[series.key] / max * 100}%` }} />
                  </button>
                ))}
              </div>
              <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                <span>{visible[0].label}</span><span>{visible[visible.length - 1].label}</span>
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{selected.label} activity</h3>
          <select aria-label="Activity month" value={selected.key} onChange={event => setMonthKey(event.target.value)}
            className="min-h-10 rounded-md border bg-background px-2 text-sm">
            {visible.map(month => <option key={month.key} value={month.key}>{month.label}</option>)}
          </select>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatNumber(selected.received)} received · {formatNumber(selected.shipped)} shipped · {formatNumber(selected.orders)} orders
        </p>
        <details className="text-sm">
          <summary className="cursor-pointer py-2 font-medium">Show source records ({formatNumber(selected.records.length)})</summary>
          <div className="max-h-72 overflow-y-auto"><DetailRows key={selected.key} rows={selected.records} /></div>
        </details>
      </Card>
    </section>
  );
}

async function readPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await query(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

export default function MetricsPage() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<MetricsData | null>(null);

  const loadMetrics = useCallback(async (signal: AbortSignal) => {
    if (!tenantId) return;
    const supabase = createClient();
    setLoading(true);
    setError(false);

    try {
      const [products, lots, movements, pos, suppliers, orders] = await Promise.all([
        readPages((from, to) => supabase.from('products').select('id,name,sku,cost,price,low_stock_threshold,par_level_max,category').eq('tenant_id', tenantId).eq('is_archived', false).order('id').range(from, to).abortSignal(signal)),
        readPages((from, to) => supabase.from('lots').select('id,product_id,lot_number,quantity_on_hand,cost_at_receipt,status,expiration_date').eq('tenant_id', tenantId).eq('status', 'active').order('id').range(from, to).abortSignal(signal)),
        readPages((from, to) => supabase.from('stock_movements').select('id,product_id,movement_type,quantity,created_at,reference_number').eq('tenant_id', tenantId).in('movement_type', ['ship', 'receive']).order('id').range(from, to).abortSignal(signal)),
        readPages((from, to) => supabase.from('purchase_orders').select('id,supplier_id,status,expected_date,updated_at').eq('tenant_id', tenantId).eq('status', 'received').order('id').range(from, to).abortSignal(signal)),
        readPages((from, to) => supabase.from('suppliers').select('id,name').eq('tenant_id', tenantId).eq('is_archived', false).order('id').range(from, to).abortSignal(signal)),
        readPages((from, to) => supabase.from('sales_orders').select('id,order_number,status,created_at').eq('tenant_id', tenantId).order('id').range(from, to).abortSignal(signal)),
      ]);

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

      const today = new Date().toISOString().slice(0, 10);
      const alreadyExpired = expiringItems.filter(item => item.expDate < today);
      const months = Array.from({ length: 24 }, (_, index): Month => {
        const now = new Date();
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23 + index, 1));
        return {
          key: date.toISOString().slice(0, 7),
          label: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date),
          received: 0, shipped: 0, orders: 0, records: [],
        };
      });
      const byMonth = new Map(months.map(month => [month.key, month]));
      const outboundCosts: Detail[] = [];

      for (const movement of [...movements].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))) {
        const product = productMap.get(movement.product_id);
        const quantity = Math.abs(movement.quantity);
        const received = movement.movement_type === 'receive';
        const row = {
          id: 'movement-' + movement.id,
          label: product?.sku ?? 'Archived or unavailable SKU',
          context: [formatDate(movement.created_at), movement.reference_number].filter(Boolean).join(' · '),
          value: `${formatNumber(quantity)} ${received ? 'received' : 'shipped'}`,
        };
        const month = byMonth.get(new Date(movement.created_at).toISOString().slice(0, 7));
        if (month) {
          month[received ? 'received' : 'shipped'] += quantity;
          month.records.push(row);
        }
        if (!received) outboundCosts.push({
          ...row, context: [row.context, row.value].filter(Boolean).join(' · '),
          value: formatCurrency(quantity * (product?.cost || 0)),
        });
      }
      const orderDetails = [...orders].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).map(order => {
        const row = {
          id: 'order-' + order.id, label: order.order_number,
          context: formatDate(order.created_at), value: order.status ?? 'Unknown status',
        };
        const month = byMonth.get(new Date(order.created_at).toISOString().slice(0, 7));
        if (month) {
          month.orders++;
          month.records.push(row);
        }
        return row;
      });

      const values = activeLots.map(lot => ({
        id: lot.id, label: lot.lot_number,
        context: [productMap.get(lot.product_id)?.sku, formatNumber(lot.quantity_on_hand) + ' on hand'].filter(Boolean).join(' · '),
        value: formatCurrency(lot.quantity_on_hand * lot.cost_at_receipt),
      }));
      const expiryRows = (items: MetricsData['expiringItems']): Detail[] => items.map((item, index) => ({
        id: item.lot + '-' + index, label: item.lot, context: item.product,
        value: formatDate(item.expDate + 'T12:00:00'),
      }));
      const retail = products.map(product => ({
        id: product.id, label: product.name, context: product.sku,
        value: formatCurrency((stockByProduct.get(product.id) ?? 0) * product.price),
      }));
      const details: MetricsData['details'] = {
        values, outboundCosts, retail,
        products: products.map(product => ({
          id: product.id, label: product.name, context: product.sku,
          value: formatNumber(stockByProduct.get(product.id) ?? 0) + ' on hand',
        })),
        stockOuts: stockOutItems.map(item => ({ id: item.sku, label: item.name, context: item.sku,
          value: item.lastMovement ? 'Last shipped ' + formatDate(item.lastMovement) : 'No shipments' })),
        deadStock: deadStock.map(item => ({ id: item.sku, label: item.name,
          context: item.sku + (item.lastMove ? ' · Last shipped ' + formatDate(item.lastMove) : ' · No shipments'),
          value: formatNumber(item.qty) + ' on hand' })),
        expiring: expiryRows(expiringItems),
        expired: expiryRows(alreadyExpired),
        orders: orderDetails,
        shipped: orderDetails.filter(order => order.value === 'shipped'),
        ratio: [
          { id: 'cost', label: 'Estimated shipped cost', value: formatCurrency(totalCostShipped) },
          { id: 'value', label: 'Current inventory value', value: formatCurrency(totalValue) },
        ],
        margin: [
          { id: 'retail', label: 'Revenue potential', value: formatCurrency(totalRevenuePotential) },
          { id: 'value', label: 'Current inventory value', value: formatCurrency(totalValue) },
        ],
      };
      if (signal.aborted) return;
      setData({
        months,
        details,
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
        supplierPerf,
        expiringItems,
        expiredCount: alreadyExpired.length,
      });
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadMetrics(controller.signal);
    return () => controller.abort();
  }, [loadMetrics, attempt]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Metrics" />
        <div className="text-center py-12 text-muted-foreground">Loading metrics...</div>
      </div>
    );
  }

  if (error || !data) {
    return <div role="alert" className="space-y-2">
      <PageHeader title="Metrics Command Center" />
      <p>Could not load warehouse metrics.</p>
      <button type="button" className="underline" onClick={() => setAttempt(count => count + 1)}>Retry</button>
    </div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Metrics Command Center" description="Track inventory health, movement, and fulfillment." />

      <ShiftPriorities />

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <KPICard icon={DollarSign} title="Inventory Value" rows={data.details.values} value={formatCurrency(data.totalValue)} />
        <KPICard icon={Package} title="Active SKUs" rows={data.details.products} value={data.totalSKUs} />
        <KPICard icon={TrendingUp} title="Shipped cost ratio" rows={data.details.ratio} value={`${data.turnoverRate}x`} subtitle="All-time shipped cost ÷ current inventory" />
        <KPICard icon={AlertTriangle} title="Stock-Outs" rows={data.details.stockOuts} value={data.stockOutItems.length} alert={data.stockOutItems.length > 0} />
        <KPICard icon={Clock} title="Expiring" rows={data.details.expiring} value={data.expiringItems.length} subtitle="Within 90 days or overdue" alert={data.expiringItems.length > 0} />
        <KPICard icon={Archive} title="Dead Stock" rows={data.details.deadStock} value={data.deadStock.length} subtitle="No move 90d" />
      </div>

      <TrendCharts months={data.months} />

      {/* Metric categories */}
      <Tabs defaultValue="health" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
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
            <KPICard icon={DollarSign} title="Estimated shipped cost" rows={data.details.outboundCosts} value={formatCurrency(data.totalCOGS)} />
            <KPICard icon={DollarSign} title="Revenue Potential" rows={data.details.retail} value={formatCurrency(data.totalRevenuePotential)} subtitle="Stock × price" />
            <KPICard icon={BarChart3} title="Potential margin" rows={data.details.margin} value={data.totalRevenuePotential > 0 ? `${(((data.totalRevenuePotential - data.totalValue) / data.totalRevenuePotential) * 100).toFixed(1)}%` : '0%'} />
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
            <KPICard icon={Truck} title="Total Orders" rows={data.details.orders} value={data.totalOrders} />
            <KPICard icon={ShieldCheck} title="Shipped" rows={data.details.shipped} value={data.shippedOrders} />
            <KPICard icon={BarChart3} title="Shipped order share" rows={data.details.orders} value={data.totalOrders > 0 ? `${((data.shippedOrders / data.totalOrders) * 100).toFixed(0)}%` : '—'} />
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
            <KPICard icon={Clock} title="Expiring (90 days)" rows={data.details.expiring} value={data.expiringItems.length} alert={data.expiringItems.length > 0} />
            <KPICard icon={AlertTriangle} title="Already Expired" rows={data.details.expired} value={data.expiredCount} alert={data.expiredCount > 0} subtitle="Still in stock" />
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
