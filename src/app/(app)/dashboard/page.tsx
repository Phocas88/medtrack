'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
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
} from 'lucide-react';
import { formatCurrency, daysUntilExpiry } from '@/lib/format';

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

// ── KPI data ──
interface KPIData {
  totalProducts: number;
  totalValue: number;
  lowStockCount: number;
  stockOutCount: number;
  expiringCount: number;
}

export default function DashboardPage() {
  const { preset } = useAuth();

  if (preset === 'lite') return <LiteDashboard />;
  if (preset === '3pl') return <ThreePLDashboard />;
  return <FullDashboard />;
}

function FullDashboard() {
  const { tenantId, role } = useAuth();
  const router = useRouter();
  const [kpi, setKpi] = useState<KPIData | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    async function load() {
      const supabase = createClient();

      const { count: productCount } = await supabase
        .from('products').select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!).eq('is_archived', false);

      const { data: lots } = await supabase
        .from('lots').select('product_id, quantity_on_hand, expiration_date, cost_at_receipt, status, product:products(low_stock_threshold)')
        .eq('tenant_id', tenantId!).eq('status', 'active');

      let totalValue = 0;
      const productStock: Record<string, { total: number; threshold: number }> = {};

      (lots || []).forEach((l) => {
        totalValue += l.quantity_on_hand * l.cost_at_receipt;
        const p = l.product as unknown as { low_stock_threshold: number };
        if (!productStock[l.product_id]) {
          productStock[l.product_id] = { total: 0, threshold: p?.low_stock_threshold || 10 };
        }
        productStock[l.product_id].total += l.quantity_on_hand;
      });

      const { data: allProducts } = await supabase
        .from('products').select('id').eq('tenant_id', tenantId!).eq('is_archived', false);

      let stockOutCount = 0;
      (allProducts || []).forEach((p) => {
        if (!productStock[p.id] || productStock[p.id].total === 0) stockOutCount++;
      });

      const lowStockCount = Object.values(productStock).filter((s) => s.total > 0 && s.total <= s.threshold).length;
      const expiringCount = (lots || []).filter((l) => l.expiration_date && l.quantity_on_hand > 0 && (daysUntilExpiry(l.expiration_date) ?? 999) <= 90).length;

      setKpi({ totalProducts: productCount || 0, totalValue, lowStockCount, stockOutCount, expiringCount });
    }
    load();
  }, [tenantId]);

  // Filter admin group for non-admins
  const groups = MODULE_GROUPS.filter((g) => {
    if (g.title === 'Administration' && role !== 'admin') return false;
    return true;
  });

  const kpiItems = [
    { label: 'Products', value: kpi?.totalProducts ?? '—', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50', alert: false },
    { label: 'Inventory Value', value: kpi ? formatCurrency(kpi.totalValue) : '—', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50', alert: false },
    { label: 'Stock-Outs', value: kpi?.stockOutCount ?? '—', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', alert: !!kpi?.stockOutCount },
    { label: 'Low Stock', value: kpi?.lowStockCount ?? '—', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', alert: !!kpi?.lowStockCount },
    { label: 'Expiring', value: kpi?.expiringCount ?? '—', icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50', alert: !!kpi?.expiringCount },
  ];

  return (
    <div className="space-y-8">
      {/* KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiItems.map((k) => (
          <Card key={k.label} className={`overflow-hidden ${k.alert ? 'ring-1 ring-' + k.color.replace('text-', '') + '/30' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground truncate">{k.label}</p>
                  <p className="text-2xl font-bold mt-1 truncate">{k.value}</p>
                </div>
                <div className={`${k.bg} p-2 rounded-lg shrink-0`}>
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
              <Card
                key={tile.href}
                className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border hover:border-primary/20 overflow-hidden group"
                onClick={() => router.push(tile.href)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2.5">
                  <div className={`p-3 rounded-xl ${tile.color} transition-transform group-hover:scale-110`}>
                    <tile.icon className={`h-5 w-5 ${tile.iconColor}`} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate w-full">{tile.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
