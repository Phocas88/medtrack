'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isReleasedRoute } from '@/lib/release-scope';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LiteDashboard } from './lite-dashboard';
import { ThreePLDashboard } from './threepl-dashboard';
import {
  Package,
  DollarSign,
  AlertTriangle,
  Clock,
  Layers,
  ArrowLeftRight,
  ClipboardList,
  PackagePlus,
  PackageOpen,
  Truck,
  RotateCcw,
  Warehouse,
  Grid3X3,
  ClipboardCheck,
  ShieldCheck,
  BarChart3,
  TrendingUp,
  Users,
  Building2,
  Tag,
  Globe,
  Settings,
  FileText,
  ScanLine,
  Boxes,
  RefreshCw,
  Wrench,
  XCircle,
  ChevronRight,
} from 'lucide-react';
import { formatCurrency, formatDate, daysUntilExpiry } from '@/lib/format';

// ── Module tile definitions ──
interface ModuleTile {
  label: string;
  href: string;
  icon: typeof Package;
  color: string; // tailwind bg color
  iconColor: string;
}

interface ModuleGroup {
  title: string;
  tiles: ModuleTile[];
}

const MODULE_GROUPS: ModuleGroup[] = [
  {
    title: 'Inventory',
    tiles: [
      { label: 'Products', href: '/products', icon: Package, color: 'bg-blue-50 hover:bg-blue-100', iconColor: 'text-blue-600' },
      { label: 'Lots & Serials', href: '/lots', icon: Layers, color: 'bg-blue-50 hover:bg-blue-100', iconColor: 'text-blue-600' },
      { label: 'Stock Movements', href: '/movements', icon: ArrowLeftRight, color: 'bg-blue-50 hover:bg-blue-100', iconColor: 'text-blue-600' },
      { label: 'Product Matrix', href: '/product-matrix', icon: BarChart3, color: 'bg-blue-50 hover:bg-blue-100', iconColor: 'text-blue-600' },
      { label: 'Expiration', href: '/expiration', icon: Clock, color: 'bg-blue-50 hover:bg-blue-100', iconColor: 'text-blue-600' },
    ],
  },
  {
    title: 'Warehouse',
    tiles: [
      { label: 'Locations', href: '/locations', icon: Warehouse, color: 'bg-emerald-50 hover:bg-emerald-100', iconColor: 'text-emerald-600' },
      { label: 'Bins', href: '/bins', icon: Grid3X3, color: 'bg-emerald-50 hover:bg-emerald-100', iconColor: 'text-emerald-600' },
      { label: 'Cycle Counts', href: '/cycle-counts', icon: ClipboardCheck, color: 'bg-emerald-50 hover:bg-emerald-100', iconColor: 'text-emerald-600' },
      { label: 'Quarantine', href: '/quarantine', icon: ShieldCheck, color: 'bg-emerald-50 hover:bg-emerald-100', iconColor: 'text-emerald-600' },
      { label: 'Transfers', href: '/transfers', icon: ArrowLeftRight, color: 'bg-emerald-50 hover:bg-emerald-100', iconColor: 'text-emerald-600' },
      { label: 'Task Board', href: '/task-board', icon: ClipboardList, color: 'bg-emerald-50 hover:bg-emerald-100', iconColor: 'text-emerald-600' },
    ],
  },
  {
    title: 'Orders & Fulfillment',
    tiles: [
      { label: 'Work Orders', href: '/work-orders', icon: Wrench, color: 'bg-amber-50 hover:bg-amber-100', iconColor: 'text-amber-600' },
      { label: 'Purchase Orders', href: '/purchase-orders', icon: ClipboardList, color: 'bg-amber-50 hover:bg-amber-100', iconColor: 'text-amber-600' },
      { label: 'Receive', href: '/receive', icon: PackagePlus, color: 'bg-amber-50 hover:bg-amber-100', iconColor: 'text-amber-600' },
      { label: 'Put-Away', href: '/put-away', icon: PackageOpen, color: 'bg-amber-50 hover:bg-amber-100', iconColor: 'text-amber-600' },
      { label: 'Ship', href: '/ship', icon: Truck, color: 'bg-amber-50 hover:bg-amber-100', iconColor: 'text-amber-600' },
      { label: 'Returns', href: '/returns', icon: RotateCcw, color: 'bg-amber-50 hover:bg-amber-100', iconColor: 'text-amber-600' },
      { label: 'Reorder', href: '/reorder', icon: RefreshCw, color: 'bg-amber-50 hover:bg-amber-100', iconColor: 'text-amber-600' },
    ],
  },
  {
    title: 'Sales & Customers',
    tiles: [
      { label: 'Customers', href: '/customers', icon: Users, color: 'bg-purple-50 hover:bg-purple-100', iconColor: 'text-purple-600' },
      { label: 'Suppliers', href: '/suppliers', icon: Building2, color: 'bg-purple-50 hover:bg-purple-100', iconColor: 'text-purple-600' },
      { label: 'Promotions', href: '/promotions', icon: Tag, color: 'bg-purple-50 hover:bg-purple-100', iconColor: 'text-purple-600' },
      { label: 'Pricing', href: '/pricing', icon: DollarSign, color: 'bg-purple-50 hover:bg-purple-100', iconColor: 'text-purple-600' },
      { label: 'Customer Portal', href: '/customer-portal', icon: Globe, color: 'bg-purple-50 hover:bg-purple-100', iconColor: 'text-purple-600' },
    ],
  },
  {
    title: 'Reports & Analytics',
    tiles: [
      { label: 'Metrics', href: '/metrics', icon: BarChart3, color: 'bg-slate-50 hover:bg-slate-100', iconColor: 'text-slate-600' },
      { label: 'Analytics', href: '/analytics', icon: TrendingUp, color: 'bg-slate-50 hover:bg-slate-100', iconColor: 'text-slate-600' },
      { label: 'Reports', href: '/reports', icon: FileText, color: 'bg-slate-50 hover:bg-slate-100', iconColor: 'text-slate-600' },
      { label: 'Audit Trail', href: '/audit', icon: ScanLine, color: 'bg-slate-50 hover:bg-slate-100', iconColor: 'text-slate-600' },
      { label: 'Compliance', href: '/compliance', icon: ShieldCheck, color: 'bg-slate-50 hover:bg-slate-100', iconColor: 'text-slate-600' },
    ],
  },
  {
    title: 'Administration',
    tiles: [
      { label: 'Services', href: '/services', icon: Boxes, color: 'bg-gray-50 hover:bg-gray-100', iconColor: 'text-gray-600' },
      { label: 'User Mgmt', href: '/admin/users', icon: Users, color: 'bg-gray-50 hover:bg-gray-100', iconColor: 'text-gray-600' },
      { label: 'Settings', href: '/settings', icon: Settings, color: 'bg-gray-50 hover:bg-gray-100', iconColor: 'text-gray-600' },
    ],
  },
];

type ProductRow = { id: string; sku: string; name: string; low_stock_threshold: number | null };
type LotRow = {
  id: string;
  product_id: string;
  lot_number: string;
  quantity_on_hand: number;
  cost_at_receipt: number;
  expiration_date: string | null;
  location: string | null;
};

async function readPages<T>(query: (from: number, to: number) => PromiseLike<{
  data: T[] | null; error: unknown;
}>) {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await query(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < size) return rows;
  }
}

type DashboardData = { products: ProductRow[]; lots: LotRow[] };
type DetailRow = { id: string; title: string; description: string; value: string };

function MetricDetails({ rows }: { rows: DetailRow[] }) {
  const [limit, setLimit] = useState(50);
  if (!rows.length) return <p className="py-4 text-sm text-muted-foreground">No matching records.</p>;
  return (
    <div className="min-h-0 overflow-y-auto overscroll-contain">
      <ul className="divide-y">
        {rows.slice(0, limit).map(row => (
          <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
            <div className="min-w-0 flex-1 break-words">
              <p className="font-medium">{row.title}</p>
              <p className="text-muted-foreground">{row.description}</p>
            </div>
            <span className="max-w-full break-all font-medium tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit(limit + 50)} className="my-2 min-h-11 rounded-md border px-3 text-sm">
          Show more ({Math.min(limit, rows.length)} of {rows.length} shown)
        </button>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const { preset } = useAuth();

  if (preset === 'lite') return <LiteDashboard />;
  if (preset === '3pl') return <ThreePLDashboard />;
  return <FullDashboard />;
}

function FullDashboard() {
  const { tenantId, role } = useAuth();
  const [snapshot, setSnapshot] = useState<{ tenant: string; data: DashboardData } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const data = snapshot?.tenant === tenantId ? snapshot?.data : undefined;

  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    const supabase = createClient();
    setLoadError(null);
    Promise.all([
      readPages((from, to) => supabase.from('products')
        .select('id, sku, name, low_stock_threshold').eq('tenant_id', tenantId)
        .eq('is_archived', false).order('id').range(from, to).abortSignal(controller.signal)),
      readPages((from, to) => supabase.from('lots')
        .select('id, product_id, lot_number, quantity_on_hand, cost_at_receipt, expiration_date, location')
        .eq('tenant_id', tenantId).eq('status', 'active')
        .order('id').range(from, to).abortSignal(controller.signal)),
    ]).then(([products, lots]) => {
      if (!controller.signal.aborted) setSnapshot({ tenant: tenantId, data: { products, lots } });
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError('Dashboard totals could not be loaded.');
    });
    return () => controller.abort();
  }, [tenantId, attempt]);

  const products = data?.products ?? [];
  const lots = data?.lots ?? [];
  const productsById = new Map(products.map(product => [product.id, product]));
  const stock = new Map<string, number>();
  for (const lot of lots) stock.set(lot.product_id, (stock.get(lot.product_id) ?? 0) + lot.quantity_on_hand);

  const productRows = products.map(product => ({
    ...product,
    onHand: stock.get(product.id) ?? 0,
    threshold: product.low_stock_threshold ?? 10,
  }));
  const productDetail = (product: typeof productRows[number]): DetailRow => ({
    id: product.id, title: product.name, description: product.sku,
    value: product.onHand.toLocaleString() + ' on hand',
  });
  const lotDetail = (lot: LotRow, value: string): DetailRow => ({
    id: lot.id, title: lot.lot_number,
    description: [productsById.get(lot.product_id)?.sku, lot.location].filter(Boolean).join(' · ') || 'Active lot',
    value,
  });
  const inventoryValue = lots.reduce((sum, lot) => sum + lot.quantity_on_hand * lot.cost_at_receipt, 0);
  const stockOuts = productRows.filter(product => product.onHand === 0).map(productDetail);
  const lowStock = productRows.filter(product => product.onHand > 0 && product.onHand <= product.threshold)
    .map(product => ({ ...productDetail(product), description: product.sku + ' · threshold ' + product.threshold }));
  const expiring = lots.filter(lot => lot.expiration_date && lot.quantity_on_hand > 0 && (daysUntilExpiry(lot.expiration_date) ?? 999) <= 90)
    .sort((a, b) => (a.expiration_date ?? '').localeCompare(b.expiration_date ?? ''))
    .map(lot => lotDetail(lot, formatDate(lot.expiration_date)));

  // Filter admin group for non-admins
  const groups = MODULE_GROUPS
    .filter(group => group.title !== 'Administration' || role === 'admin')
    .map(group => ({ ...group, tiles: group.tiles.filter(tile => isReleasedRoute(tile.href)) }))
    .filter(group => group.tiles.length > 0);

  const metrics = [
    { label: 'Products', value: products.length, icon: Package, color: 'text-blue-600', rows: productRows.map(productDetail), description: 'Active products and their on-hand stock.', href: '/products' },
    { label: 'Inventory value', value: formatCurrency(inventoryValue), icon: DollarSign, color: 'text-emerald-600', rows: lots.map(lot => lotDetail(lot, formatCurrency(lot.quantity_on_hand * lot.cost_at_receipt))), description: 'Active lot quantities valued at receipt cost.', href: '/lots' },
    { label: 'Stock-outs', value: stockOuts.length, icon: XCircle, color: 'text-red-600', rows: stockOuts, description: 'Active products with zero units on hand.', href: '/reorder' },
    { label: 'Low stock', value: lowStock.length, icon: AlertTriangle, color: 'text-amber-600', rows: lowStock, description: 'Products with stock remaining at or below their low-stock threshold.', href: '/reorder' },
    { label: 'Expiring', value: expiring.length, icon: Clock, color: 'text-orange-600', rows: expiring, description: 'In-stock active lots expiring within 90 days, including overdue lots still marked active.', href: '/expiration' },
  ];

  return (
    <div className="min-w-0 space-y-5 md:space-y-8">
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          {loadError}
          <button type="button" className="underline" onClick={() => setAttempt(attempt + 1)}>Retry</button>
        </div>
      )}
      <section aria-label="Inventory summary" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map(metric => (
          <Dialog key={metric.label}>
            <DialogTrigger asChild>
              <button type="button" disabled={!data}
                className="min-w-0 rounded-lg border bg-card px-3 py-2.5 text-left hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-70">
                <span className="flex items-start gap-1.5 text-xs font-medium text-muted-foreground">
                  <metric.icon aria-hidden className={`mt-0.5 size-3.5 shrink-0 ${metric.color}`} />
                  <span className="min-w-0 flex-1">{metric.label}</span>
                  <ChevronRight aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                </span>
                <span className="mt-1 block break-all text-lg font-semibold leading-tight tabular-nums sm:text-xl">
                  {data ? metric.value.toLocaleString() : '—'}
                </span>
              </button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[85dvh] w-[calc(100%_-_1.5rem)] min-w-0 flex-col rounded-lg p-4 sm:p-6">
              <div className="space-y-1 pr-7">
                <DialogTitle>{metric.label}</DialogTitle>
                <DialogDescription>{metric.description}</DialogDescription>
                <p className="break-all text-xl font-semibold tabular-nums">{metric.value.toLocaleString()}</p>
              </div>
              <MetricDetails rows={metric.rows} />
              <Link href={metric.href} className="self-start text-sm font-medium underline">Open {metric.href.slice(1)}</Link>
            </DialogContent>
          </Dialog>
        ))}
      </section>

      {/* Module Groups */}
      {groups.map((group) => (
        <div key={group.title}>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px flex-1 bg-border" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-2">{group.title}</h2>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {group.tiles.map((tile) => (
              <Link key={tile.href} href={tile.href}
                className="group min-w-0 rounded-lg border bg-card hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                <CardContent className="flex h-full items-center gap-2 p-2.5 sm:flex-col sm:p-4 sm:text-center">
                  <div className={`shrink-0 rounded-lg p-2 sm:p-3 ${tile.color} transition-transform group-hover:scale-110`}>
                    <tile.icon className={`h-5 w-5 ${tile.iconColor}`} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 min-w-0 break-words">{tile.label}</span>
                </CardContent>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
