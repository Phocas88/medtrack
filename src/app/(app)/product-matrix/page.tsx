'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Download,
  Package,
  Layers,
  TrendingUp,
  DollarSign,
  Warehouse,
  Grid3X3,
} from 'lucide-react';
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  formatNumber,
  movementTypeLabel,
  storageLabel,
  expiryStatus,
} from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type {
  Product,
  MovementType,
} from '@/types/database';

// ── Types for joined query results ──

interface TimelineEvent {
  id: string;
  date: string;
  event_type: string;
  quantity: number;
  reference: string;
  lot_number: string;
  location: string;
  user_name: string;
  notes: string;
  source: 'movement' | 'po' | 'sales';
}

interface ReceivingRow {
  id: string;
  po_number: string;
  supplier_name: string;
  date: string;
  qty_ordered: number;
  qty_received: number;
  outstanding: number;
  unit_cost: number;
  status: string;
}

interface SalesRow {
  id: string;
  order_number: string;
  customer_name: string;
  date: string;
  qty_ordered: number;
  qty_shipped: number;
  outstanding: number;
  unit_price: number;
  status: string;
}

interface MovementRow {
  id: string;
  date: string;
  type: MovementType;
  quantity: number;
  lot_number: string;
  reference: string;
  user_name: string;
  notes: string;
}

interface BinLocationRow {
  id: string;
  bin_code: string;
  bin_type: string;
  location_name: string;
  zone_name: string;
  quantity: number;
  last_updated: string;
  is_assignment: boolean;
  min_quantity?: number;
  max_quantity?: number;
  reorder_point?: number;
}

interface LotRow {
  id: string;
  lot_number: string;
  status: string;
  quantity_on_hand: number;
  expiration_date: string | null;
  received_date: string;
  supplier_name: string;
  location: string;
  cost_at_receipt: number;
}

// ── Badge colors ──

const movementBadgeVariant: Record<string, string> = {
  receive: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ship: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  adjust: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  return: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  expire: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  recall: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
  po_created: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
  po_received: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  order_placed: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  order_shipped: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const lotStatusVariant: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  recalled: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300',
  depleted: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

function expiryBadgeColor(expDate: string | null): string {
  const status = expiryStatus(expDate);
  switch (status) {
    case 'ok': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
    case 'warning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
    case 'danger': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    case 'expired': return 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300';
    default: return 'bg-gray-100 text-gray-600';
  }
}

// ── Period helpers ──

function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
function startOfQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1).toISOString();
}
function startOfYear(): string {
  const d = new Date();
  return new Date(d.getFullYear(), 0, 1).toISOString();
}

export default function ProductMatrixPage() {
  const { tenantId } = useAuth();
  const supabase = createClient();

  // Product selector
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);

  // Product summary
  const [totalStock, setTotalStock] = useState(0);
  const [activeLots, setActiveLots] = useState(0);
  const [binCount, setBinCount] = useState(0);

  // Tab data
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [receiving, setReceiving] = useState<ReceivingRow[]>([]);
  const [sales, setSales] = useState<SalesRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [binLocations, setBinLocations] = useState<BinLocationRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);

  // Filters
  const [timelineDateFrom, setTimelineDateFrom] = useState('');
  const [timelineDateTo, setTimelineDateTo] = useState('');
  const [timelineTypeFilter, setTimelineTypeFilter] = useState('all');
  const [movementTypeFilter, setMovementTypeFilter] = useState('all');

  // Load products list
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .order('name');
      setProducts((data as Product[]) || []);
    })();
  }, [tenantId]);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products;
    const s = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        p.sku.toLowerCase().includes(s) ||
        (p.manufacturer && p.manufacturer.toLowerCase().includes(s))
    );
  }, [products, productSearch]);

  // Load all data when product is selected
  useEffect(() => {
    if (!selectedProductId || !tenantId) return;
    const product = products.find((p) => p.id === selectedProductId) || null;
    setSelectedProduct(product);
    setLoading(true);
    Promise.all([
      loadSummary(),
      loadTimeline(),
      loadReceiving(),
      loadSales(),
      loadMovements(),
      loadBinLocations(),
      loadLots(),
    ]).finally(() => setLoading(false));
  }, [selectedProductId, tenantId]);

  // Reload timeline on filter change
  useEffect(() => {
    if (selectedProductId && tenantId) loadTimeline();
  }, [timelineDateFrom, timelineDateTo, timelineTypeFilter]);

  // Reload movements on filter change
  useEffect(() => {
    if (selectedProductId && tenantId) loadMovements();
  }, [movementTypeFilter]);

  // ── Data loaders ──

  async function loadSummary() {
    const { data: lotData } = await supabase
      .from('lots')
      .select('quantity_on_hand, status')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId);

    const total = (lotData || []).reduce((sum, l) => sum + (l.quantity_on_hand || 0), 0);
    const active = (lotData || []).filter((l) => l.status === 'active').length;
    setTotalStock(total);
    setActiveLots(active);

    const { count } = await supabase
      .from('bin_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId)
      .gt('quantity', 0);
    setBinCount(count || 0);
  }

  async function loadTimeline() {
    const events: TimelineEvent[] = [];

    // Stock movements
    let movQuery = supabase
      .from('stock_movements')
      .select('*, lot:lots(lot_number, location), user:users(full_name)')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (timelineDateFrom) movQuery = movQuery.gte('created_at', timelineDateFrom);
    if (timelineDateTo) movQuery = movQuery.lte('created_at', timelineDateTo + 'T23:59:59');
    if (timelineTypeFilter !== 'all' && ['receive', 'ship', 'adjust', 'return', 'expire', 'recall'].includes(timelineTypeFilter)) {
      movQuery = movQuery.eq('movement_type', timelineTypeFilter);
    }

    const { data: movData } = await movQuery;
    (movData || []).forEach((m: Record<string, unknown>) => {
      const lot = m.lot as Record<string, unknown> | null;
      const user = m.user as Record<string, unknown> | null;
      events.push({
        id: `mov-${m.id}`,
        date: m.created_at as string,
        event_type: m.movement_type as string,
        quantity: m.quantity as number,
        reference: (m.reference_number as string) || '',
        lot_number: lot?.lot_number as string || '',
        location: lot?.location as string || '',
        user_name: user?.full_name as string || '',
        notes: (m.reason as string) || '',
        source: 'movement',
      });
    });

    // PO lines
    if (timelineTypeFilter === 'all' || timelineTypeFilter === 'po_created' || timelineTypeFilter === 'po_received') {
      const poQuery = supabase
        .from('po_lines')
        .select('*, po:purchase_orders(po_number, order_date, status, supplier:suppliers(name))')
        .eq('tenant_id', tenantId)
        .eq('product_id', selectedProductId);

      const { data: poData } = await poQuery;
      (poData || []).forEach((pl: Record<string, unknown>) => {
        const po = pl.po as Record<string, unknown> | null;
        const supplier = po?.supplier as Record<string, unknown> | null;
        const orderDate = po?.order_date as string || pl.created_at as string;

        if (timelineDateFrom && orderDate < timelineDateFrom) return;
        if (timelineDateTo && orderDate > timelineDateTo + 'T23:59:59') return;

        events.push({
          id: `po-${pl.id}`,
          date: orderDate,
          event_type: (pl.quantity_received as number) > 0 ? 'po_received' : 'po_created',
          quantity: (pl.quantity_received as number) > 0 ? (pl.quantity_received as number) : (pl.quantity_ordered as number),
          reference: (po?.po_number as string) || '',
          lot_number: '',
          location: '',
          user_name: supplier?.name as string || '',
          notes: `Ordered: ${pl.quantity_ordered}, Received: ${pl.quantity_received}`,
          source: 'po',
        });
      });
    }

    // Sales order lines
    if (timelineTypeFilter === 'all' || timelineTypeFilter === 'order_placed' || timelineTypeFilter === 'order_shipped') {
      const { data: soData } = await supabase
        .from('sales_order_lines')
        .select('*, order:sales_orders(order_number, created_at, status, customer:customers(name))')
        .eq('tenant_id', tenantId)
        .eq('product_id', selectedProductId);

      (soData || []).forEach((sl: Record<string, unknown>) => {
        const order = sl.order as Record<string, unknown> | null;
        const customer = order?.customer as Record<string, unknown> | null;
        const orderDate = order?.created_at as string || sl.created_at as string;

        if (timelineDateFrom && orderDate < timelineDateFrom) return;
        if (timelineDateTo && orderDate > timelineDateTo + 'T23:59:59') return;

        events.push({
          id: `so-${sl.id}`,
          date: orderDate,
          event_type: (sl.quantity_shipped as number) > 0 ? 'order_shipped' : 'order_placed',
          quantity: (sl.quantity_shipped as number) > 0 ? -(sl.quantity_shipped as number) : -(sl.quantity_ordered as number),
          reference: (order?.order_number as string) || '',
          lot_number: '',
          location: '',
          user_name: customer?.name as string || '',
          notes: `Ordered: ${sl.quantity_ordered}, Shipped: ${sl.quantity_shipped}`,
          source: 'sales',
        });
      });
    }

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setTimeline(events);
  }

  async function loadReceiving() {
    const { data } = await supabase
      .from('po_lines')
      .select('*, po:purchase_orders(po_number, order_date, status, supplier:suppliers(name))')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId);

    setReceiving(
      (data || []).map((pl: Record<string, unknown>) => {
        const po = pl.po as Record<string, unknown> | null;
        const supplier = po?.supplier as Record<string, unknown> | null;
        return {
          id: pl.id as string,
          po_number: (po?.po_number as string) || '',
          supplier_name: (supplier?.name as string) || '',
          date: (po?.order_date as string) || '',
          qty_ordered: pl.quantity_ordered as number,
          qty_received: pl.quantity_received as number,
          outstanding: (pl.quantity_ordered as number) - (pl.quantity_received as number),
          unit_cost: pl.unit_cost as number,
          status: (po?.status as string) || '',
        };
      })
    );
  }

  async function loadSales() {
    const { data } = await supabase
      .from('sales_order_lines')
      .select('*, order:sales_orders(order_number, created_at, status, customer:customers(name))')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId);

    setSales(
      (data || []).map((sl: Record<string, unknown>) => {
        const order = sl.order as Record<string, unknown> | null;
        const customer = order?.customer as Record<string, unknown> | null;
        return {
          id: sl.id as string,
          order_number: (order?.order_number as string) || '',
          customer_name: (customer?.name as string) || '',
          date: (order?.created_at as string) || '',
          qty_ordered: sl.quantity_ordered as number,
          qty_shipped: sl.quantity_shipped as number,
          outstanding: (sl.quantity_ordered as number) - (sl.quantity_shipped as number),
          unit_price: sl.unit_price as number,
          status: (order?.status as string) || '',
        };
      })
    );
  }

  async function loadMovements() {
    let query = supabase
      .from('stock_movements')
      .select('*, lot:lots(lot_number), user:users(full_name)')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (movementTypeFilter !== 'all') query = query.eq('movement_type', movementTypeFilter);

    const { data } = await query;
    setMovements(
      (data || []).map((m: Record<string, unknown>) => {
        const lot = m.lot as Record<string, unknown> | null;
        const user = m.user as Record<string, unknown> | null;
        return {
          id: m.id as string,
          date: m.created_at as string,
          type: m.movement_type as MovementType,
          quantity: m.quantity as number,
          lot_number: (lot?.lot_number as string) || '',
          reference: (m.reference_number as string) || '',
          user_name: (user?.full_name as string) || '',
          notes: (m.reason as string) || '',
        };
      })
    );
  }

  async function loadBinLocations() {
    const rows: BinLocationRow[] = [];

    // Bin inventory
    const { data: biData } = await supabase
      .from('bin_inventory')
      .select('*, bin:bins(bin_code, bin_type, location:locations(name), zone:zones(name))')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId)
      .gt('quantity', 0);

    (biData || []).forEach((bi: Record<string, unknown>) => {
      const bin = bi.bin as Record<string, unknown> | null;
      const loc = bin?.location as Record<string, unknown> | null;
      const zone = bin?.zone as Record<string, unknown> | null;
      rows.push({
        id: bi.id as string,
        bin_code: (bin?.bin_code as string) || '',
        bin_type: (bin?.bin_type as string) || '',
        location_name: (loc?.name as string) || '',
        zone_name: (zone?.name as string) || '',
        quantity: bi.quantity as number,
        last_updated: bi.updated_at as string,
        is_assignment: false,
      });
    });

    // Product bin assignments
    const { data: pbaData } = await supabase
      .from('product_bin_assignments')
      .select('*, bin:bins(bin_code, bin_type, location:locations(name), zone:zones(name))')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId)
      .eq('is_active', true);

    (pbaData || []).forEach((pba: Record<string, unknown>) => {
      const bin = pba.bin as Record<string, unknown> | null;
      const loc = bin?.location as Record<string, unknown> | null;
      const zone = bin?.zone as Record<string, unknown> | null;
      const existing = rows.find((r) => r.bin_code === (bin?.bin_code as string));
      if (existing) {
        existing.is_assignment = true;
        existing.min_quantity = pba.min_quantity as number;
        existing.max_quantity = pba.max_quantity as number;
        existing.reorder_point = pba.reorder_point as number;
      } else {
        rows.push({
          id: pba.id as string,
          bin_code: (bin?.bin_code as string) || '',
          bin_type: (bin?.bin_type as string) || '',
          location_name: (loc?.name as string) || '',
          zone_name: (zone?.name as string) || '',
          quantity: 0,
          last_updated: pba.updated_at as string,
          is_assignment: true,
          min_quantity: pba.min_quantity as number,
          max_quantity: pba.max_quantity as number,
          reorder_point: pba.reorder_point as number,
        });
      }
    });

    setBinLocations(rows);
  }

  async function loadLots() {
    const { data } = await supabase
      .from('lots')
      .select('*, supplier:suppliers(name)')
      .eq('tenant_id', tenantId)
      .eq('product_id', selectedProductId)
      .order('received_date', { ascending: false });

    setLots(
      (data || []).map((l: Record<string, unknown>) => {
        const supplier = l.supplier as Record<string, unknown> | null;
        return {
          id: l.id as string,
          lot_number: l.lot_number as string,
          status: l.status as string,
          quantity_on_hand: l.quantity_on_hand as number,
          expiration_date: l.expiration_date as string | null,
          received_date: l.received_date as string,
          supplier_name: (supplier?.name as string) || '',
          location: (l.location as string) || '',
          cost_at_receipt: l.cost_at_receipt as number,
        };
      })
    );
  }

  // ── Running balance for timeline ──

  const timelineWithBalance = useMemo(() => {
    // Reverse to go chronologically, compute running total, then reverse back
    const sorted = [...timeline].reverse();
    let balance = 0;
    const withBal = sorted.map((e) => {
      balance += e.quantity;
      return { ...e, balance };
    });
    return withBal.reverse();
  }, [timeline]);

  // ── Period summaries ──

  const receivingSummary = useMemo(() => {
    const som = startOfMonth();
    const soq = startOfQuarter();
    const soy = startOfYear();
    return {
      month: receiving.filter((r) => r.date >= som).reduce((s, r) => s + r.qty_received, 0),
      quarter: receiving.filter((r) => r.date >= soq).reduce((s, r) => s + r.qty_received, 0),
      year: receiving.filter((r) => r.date >= soy).reduce((s, r) => s + r.qty_received, 0),
    };
  }, [receiving]);

  const salesSummary = useMemo(() => {
    const som = startOfMonth();
    const soq = startOfQuarter();
    const soy = startOfYear();
    return {
      month: sales.filter((s) => s.date >= som).reduce((acc, s) => acc + s.qty_shipped, 0),
      quarter: sales.filter((s) => s.date >= soq).reduce((acc, s) => acc + s.qty_shipped, 0),
      year: sales.filter((s) => s.date >= soy).reduce((acc, s) => acc + s.qty_shipped, 0),
    };
  }, [sales]);

  // ── Margin ──
  const margin = selectedProduct && selectedProduct.price > 0
    ? ((selectedProduct.price - selectedProduct.cost) / selectedProduct.price * 100).toFixed(1)
    : '0.0';

  // ── Export handlers ──

  function exportTimeline() {
    exportToCSV(
      timelineWithBalance.map((e) => ({
        date: formatDateTime(e.date),
        event_type: e.event_type,
        quantity: e.quantity,
        balance: e.balance,
        reference: e.reference,
        lot_number: e.lot_number,
        location: e.location,
        user: e.user_name,
        notes: e.notes,
      })),
      `product_matrix_timeline`
    );
    toast.success('Timeline exported');
  }

  function exportReceiving() {
    exportToCSV(
      receiving.map((r) => ({
        po_number: r.po_number,
        supplier: r.supplier_name,
        date: formatDate(r.date),
        qty_ordered: r.qty_ordered,
        qty_received: r.qty_received,
        outstanding: r.outstanding,
        unit_cost: r.unit_cost,
        status: r.status,
      })),
      `product_matrix_receiving`
    );
    toast.success('Receiving data exported');
  }

  function exportSales() {
    exportToCSV(
      sales.map((s) => ({
        order_number: s.order_number,
        customer: s.customer_name,
        date: formatDate(s.date),
        qty_ordered: s.qty_ordered,
        qty_shipped: s.qty_shipped,
        outstanding: s.outstanding,
        unit_price: s.unit_price,
        status: s.status,
      })),
      `product_matrix_sales`
    );
    toast.success('Sales data exported');
  }

  function exportMovements() {
    exportToCSV(
      movements.map((m) => ({
        date: formatDateTime(m.date),
        type: movementTypeLabel(m.type),
        quantity: m.quantity,
        lot: m.lot_number,
        reference: m.reference,
        user: m.user_name,
        notes: m.notes,
      })),
      `product_matrix_movements`
    );
    toast.success('Movements exported');
  }

  function exportLots() {
    exportToCSV(
      lots.map((l) => ({
        lot_number: l.lot_number,
        status: l.status,
        quantity_on_hand: l.quantity_on_hand,
        expiration_date: l.expiration_date ? formatDate(l.expiration_date) : '',
        received_date: formatDate(l.received_date),
        supplier: l.supplier_name,
        location: l.location,
        cost_at_receipt: l.cost_at_receipt,
      })),
      `product_matrix_lots`
    );
    toast.success('Lot data exported');
  }

  // ── Event type label ──

  function eventTypeLabel(type: string): string {
    switch (type) {
      case 'receive': return 'Received';
      case 'ship': return 'Shipped';
      case 'adjust': return 'Adjusted';
      case 'return': return 'Returned';
      case 'expire': return 'Expired';
      case 'recall': return 'Recalled';
      case 'po_created': return 'PO Created';
      case 'po_received': return 'PO Received';
      case 'order_placed': return 'Order Placed';
      case 'order_shipped': return 'Order Shipped';
      default: return type;
    }
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Product Matrix"
        description="Comprehensive movement history and activity view for a single product"
      />

      {/* Product Selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 w-full">
              <Label htmlFor="product-search" className="mb-1.5 block text-sm font-medium">
                Select Product
              </Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a product..." />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      placeholder="Search products..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="mb-2"
                    />
                  </div>
                  {filteredProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku} - {p.name}
                    </SelectItem>
                  ))}
                  {filteredProducts.length === 0 && (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      No products found
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading / No selection state */}
      {!selectedProduct && !loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="text-center text-muted-foreground">
              <Package className="mx-auto h-12 w-12 mb-3 opacity-40" />
              <p className="text-lg font-medium">Select a product to view its matrix</p>
              <p className="text-sm mt-1">Choose from the dropdown above to see all activity</p>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="text-center text-muted-foreground">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mb-3" />
              <p>Loading product data...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedProduct && !loading && (
        <>
          {/* Product Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                {selectedProduct.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">SKU</p>
                  <p className="font-semibold">{selectedProduct.sku}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-semibold">{selectedProduct.category || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Manufacturer</p>
                  <p className="font-semibold">{selectedProduct.manufacturer || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Storage</p>
                  <p className="font-semibold">{storageLabel(selectedProduct.storage_requirement)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lot Tracked</p>
                  <Badge variant={selectedProduct.is_lot_tracked ? 'default' : 'secondary'}>
                    {selectedProduct.is_lot_tracked ? 'Yes' : 'No'}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Serial Tracked</p>
                  <Badge variant={selectedProduct.is_serial_tracked ? 'default' : 'secondary'}>
                    {selectedProduct.is_serial_tracked ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </div>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <StatCard title="Current Stock" value={formatNumber(totalStock)} icon={Package} />
                <StatCard title="Cost" value={formatCurrency(selectedProduct.cost)} icon={DollarSign} />
                <StatCard title="Price" value={formatCurrency(selectedProduct.price)} icon={DollarSign} />
                <StatCard title="Margin" value={`${margin}%`} icon={TrendingUp} />
                <StatCard title="Active Lots" value={formatNumber(activeLots)} icon={Layers} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mt-4">
                <StatCard title="Bins In Use" value={formatNumber(binCount)} icon={Grid3X3} />
                <StatCard title="Low Stock Threshold" value={formatNumber(selectedProduct.low_stock_threshold)} icon={Warehouse} />
              </div>
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="timeline" className="w-full">
            <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="receiving">Receiving</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="movements">Movements</TabsTrigger>
              <TabsTrigger value="bins">Bin Locations</TabsTrigger>
              <TabsTrigger value="lots">Lot Detail</TabsTrigger>
            </TabsList>

            {/* ── Timeline Tab ── */}
            <TabsContent value="timeline" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle>Activity Timeline</CardTitle>
                    <Button variant="outline" size="sm" onClick={exportTimeline}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-3">
                    <div>
                      <Label className="text-xs">From</Label>
                      <Input
                        type="date"
                        value={timelineDateFrom}
                        onChange={(e) => setTimelineDateFrom(e.target.value)}
                        className="w-40 h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">To</Label>
                      <Input
                        type="date"
                        value={timelineDateTo}
                        onChange={(e) => setTimelineDateTo(e.target.value)}
                        className="w-40 h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={timelineTypeFilter} onValueChange={setTimelineTypeFilter}>
                        <SelectTrigger className="w-40 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="receive">Receive</SelectItem>
                          <SelectItem value="ship">Ship</SelectItem>
                          <SelectItem value="adjust">Adjust</SelectItem>
                          <SelectItem value="return">Return</SelectItem>
                          <SelectItem value="expire">Expire</SelectItem>
                          <SelectItem value="recall">Recall</SelectItem>
                          <SelectItem value="po_created">PO Created</SelectItem>
                          <SelectItem value="po_received">PO Received</SelectItem>
                          <SelectItem value="order_placed">Order Placed</SelectItem>
                          <SelectItem value="order_shipped">Order Shipped</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Event</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>User / Source</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {timelineWithBalance.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                              No activity found
                            </TableCell>
                          </TableRow>
                        ) : (
                          timelineWithBalance.map((e) => (
                            <TableRow key={e.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatDateTime(e.date)}
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${movementBadgeVariant[e.event_type] || 'bg-gray-100 text-gray-800'}`}>
                                  {eventTypeLabel(e.event_type)}
                                </span>
                              </TableCell>
                              <TableCell className={`text-right font-mono ${e.quantity > 0 ? 'text-green-600' : e.quantity < 0 ? 'text-red-600' : ''}`}>
                                {e.quantity > 0 ? '+' : ''}{formatNumber(e.quantity)}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatNumber(e.balance)}
                              </TableCell>
                              <TableCell className="text-sm">{e.reference}</TableCell>
                              <TableCell className="text-sm">{e.lot_number}</TableCell>
                              <TableCell className="text-sm">{e.location}</TableCell>
                              <TableCell className="text-sm">{e.user_name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                                {e.notes}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Receiving Tab ── */}
            <TabsContent value="receiving" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle>Purchase Order History</CardTitle>
                    <Button variant="outline" size="sm" onClick={exportReceiving}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">This Month</p>
                      <p className="text-xl font-bold">{formatNumber(receivingSummary.month)}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">This Quarter</p>
                      <p className="text-xl font-bold">{formatNumber(receivingSummary.quarter)}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">This Year</p>
                      <p className="text-xl font-bold">{formatNumber(receivingSummary.year)}</p>
                    </div>
                  </div>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>PO Number</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Ordered</TableHead>
                          <TableHead className="text-right">Received</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead className="text-right">Unit Cost</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receiving.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No purchase orders found
                            </TableCell>
                          </TableRow>
                        ) : (
                          receiving.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.po_number}</TableCell>
                              <TableCell>{r.supplier_name}</TableCell>
                              <TableCell>{formatDate(r.date)}</TableCell>
                              <TableCell className="text-right">{formatNumber(r.qty_ordered)}</TableCell>
                              <TableCell className="text-right">{formatNumber(r.qty_received)}</TableCell>
                              <TableCell className="text-right">
                                {r.outstanding > 0 ? (
                                  <span className="text-amber-600 font-medium">{formatNumber(r.outstanding)}</span>
                                ) : (
                                  formatNumber(r.outstanding)
                                )}
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(r.unit_cost)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{r.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Sales Tab ── */}
            <TabsContent value="sales" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle>Sales Order History</CardTitle>
                    <Button variant="outline" size="sm" onClick={exportSales}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Sold This Month</p>
                      <p className="text-xl font-bold">{formatNumber(salesSummary.month)}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Sold This Quarter</p>
                      <p className="text-xl font-bold">{formatNumber(salesSummary.quarter)}</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-xs text-muted-foreground">Sold This Year</p>
                      <p className="text-xl font-bold">{formatNumber(salesSummary.year)}</p>
                    </div>
                  </div>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Order Number</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Ordered</TableHead>
                          <TableHead className="text-right">Shipped</TableHead>
                          <TableHead className="text-right">Outstanding</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sales.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No sales orders found
                            </TableCell>
                          </TableRow>
                        ) : (
                          sales.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell className="font-medium">{s.order_number}</TableCell>
                              <TableCell>{s.customer_name}</TableCell>
                              <TableCell>{formatDate(s.date)}</TableCell>
                              <TableCell className="text-right">{formatNumber(s.qty_ordered)}</TableCell>
                              <TableCell className="text-right">{formatNumber(s.qty_shipped)}</TableCell>
                              <TableCell className="text-right">
                                {s.outstanding > 0 ? (
                                  <span className="text-amber-600 font-medium">{formatNumber(s.outstanding)}</span>
                                ) : (
                                  formatNumber(s.outstanding)
                                )}
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(s.unit_price)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{s.status}</Badge>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Movements Tab ── */}
            <TabsContent value="movements" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle>Stock Movements</CardTitle>
                    <Button variant="outline" size="sm" onClick={exportMovements}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                  <div className="mt-3">
                    <Label className="text-xs">Movement Type</Label>
                    <Select value={movementTypeFilter} onValueChange={setMovementTypeFilter}>
                      <SelectTrigger className="w-40 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="receive">Receive</SelectItem>
                        <SelectItem value="ship">Ship</SelectItem>
                        <SelectItem value="adjust">Adjust</SelectItem>
                        <SelectItem value="return">Return</SelectItem>
                        <SelectItem value="expire">Expire</SelectItem>
                        <SelectItem value="recall">Recall</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              No movements found
                            </TableCell>
                          </TableRow>
                        ) : (
                          movements.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatDateTime(m.date)}
                              </TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${movementBadgeVariant[m.type] || 'bg-gray-100 text-gray-800'}`}>
                                  {movementTypeLabel(m.type)}
                                </span>
                              </TableCell>
                              <TableCell className={`text-right font-mono ${m.quantity > 0 ? 'text-green-600' : m.quantity < 0 ? 'text-red-600' : ''}`}>
                                {m.quantity > 0 ? '+' : ''}{formatNumber(m.quantity)}
                              </TableCell>
                              <TableCell className="text-sm">{m.lot_number}</TableCell>
                              <TableCell className="text-sm">{m.reference}</TableCell>
                              <TableCell className="text-sm">{m.user_name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                                {m.notes}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Bin Locations Tab ── */}
            <TabsContent value="bins" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Bin Locations</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border p-3 mb-4 inline-block">
                    <p className="text-xs text-muted-foreground">Total Across All Bins</p>
                    <p className="text-xl font-bold">
                      {formatNumber(binLocations.reduce((s, b) => s + b.quantity, 0))}
                    </p>
                  </div>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Bin Code</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Zone</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead>Min / Max / Reorder</TableHead>
                          <TableHead>Last Updated</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {binLocations.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              No bin locations found
                            </TableCell>
                          </TableRow>
                        ) : (
                          binLocations.map((b) => (
                            <TableRow key={b.id}>
                              <TableCell className="font-medium font-mono">{b.bin_code}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{b.bin_type}</Badge>
                              </TableCell>
                              <TableCell>{b.location_name}</TableCell>
                              <TableCell>{b.zone_name}</TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(b.quantity)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {b.is_assignment
                                  ? `${b.min_quantity} / ${b.max_quantity} / ${b.reorder_point}`
                                  : '—'}
                              </TableCell>
                              <TableCell className="text-sm">{formatDate(b.last_updated)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Lot Detail Tab ── */}
            <TabsContent value="lots" className="mt-4">
              <Card>
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle>Lot Detail</CardTitle>
                    <Button variant="outline" size="sm" onClick={exportLots}>
                      <Download className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Lot Number</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Qty On Hand</TableHead>
                          <TableHead>Expiration</TableHead>
                          <TableHead>Received</TableHead>
                          <TableHead>Supplier</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="text-right">Cost at Receipt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {lots.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              No lots found
                            </TableCell>
                          </TableRow>
                        ) : (
                          lots.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="font-medium font-mono">{l.lot_number}</TableCell>
                              <TableCell>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${lotStatusVariant[l.status] || 'bg-gray-100 text-gray-800'}`}>
                                  {l.status.charAt(0).toUpperCase() + l.status.slice(1)}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-mono">{formatNumber(l.quantity_on_hand)}</TableCell>
                              <TableCell>
                                {l.expiration_date ? (
                                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${expiryBadgeColor(l.expiration_date)}`}>
                                    {formatDate(l.expiration_date)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>{formatDate(l.received_date)}</TableCell>
                              <TableCell>{l.supplier_name}</TableCell>
                              <TableCell>{l.location || '—'}</TableCell>
                              <TableCell className="text-right">{formatCurrency(l.cost_at_receipt)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
