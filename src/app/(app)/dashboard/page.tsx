'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
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

  return (
    <div className="space-y-6">
      {/* KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-50"><Package className="h-4 w-4 text-blue-600" /></div>
          <div><p className="text-xl font-bold">{kpi?.totalProducts ?? '—'}</p><p className="text-[10px] text-muted-foreground uppercase">Products</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-50"><DollarSign className="h-4 w-4 text-green-600" /></div>
          <div><p className="text-xl font-bold">{kpi ? formatCurrency(kpi.totalValue) : '—'}</p><p className="text-[10px] text-muted-foreground uppercase">Inv. Value</p></div>
        </CardContent></Card>
        <Card className={kpi?.stockOutCount ? 'border-red-300' : ''}><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-50"><XCircle className="h-4 w-4 text-red-600" /></div>
          <div><p className="text-xl font-bold">{kpi?.stockOutCount ?? '—'}</p><p className="text-[10px] text-muted-foreground uppercase">Stock-Outs</p></div>
        </CardContent></Card>
        <Card className={kpi?.lowStockCount ? 'border-amber-300' : ''}><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-50"><AlertTriangle className="h-4 w-4 text-amber-600" /></div>
          <div><p className="text-xl font-bold">{kpi?.lowStockCount ?? '—'}</p><p className="text-[10px] text-muted-foreground uppercase">Low Stock</p></div>
        </CardContent></Card>
        <Card className={kpi?.expiringCount ? 'border-orange-300' : ''}><CardContent className="p-3 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-orange-50"><Clock className="h-4 w-4 text-orange-600" /></div>
          <div><p className="text-xl font-bold">{kpi?.expiringCount ?? '—'}</p><p className="text-[10px] text-muted-foreground uppercase">Expiring</p></div>
        </CardContent></Card>
      </div>

      {/* Module Groups */}
      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{group.title}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {group.tiles.map((tile) => (
              <Card
                key={tile.href}
                className={`cursor-pointer transition-all hover:shadow-md ${tile.color} border-transparent`}
                onClick={() => router.push(tile.href)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="p-3 rounded-xl bg-white/70 shadow-sm">
                    <tile.icon className={`h-6 w-6 ${tile.iconColor}`} />
                  </div>
                  <span className="text-sm font-medium text-slate-700">{tile.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
