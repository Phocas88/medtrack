'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Users,
  ShoppingCart,
  DollarSign,
  Mail,
  Search,
  Trash2,
  Plus,
  Download,
  Printer,
  ChevronDown,
  ChevronRight,
  Info,
  Package,
  ClipboardList,
  History,
  UserCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { formatDate, formatCurrency, formatNumber, storageLabel } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type {
  Customer,
  Product,
  SalesOrder,
  SalesOrderLine,
  PriceTier,
  CustomerPrice,
} from '@/types/database';

// ── Derived types ───────────────────────────────────────────────────────────

interface ProductWithStock extends Product {
  available_qty: number;
  customer_price: number | null;
  tier_price: number | null;
  effective_price: number;
  savings: number;
}

interface CartItem {
  product: ProductWithStock;
  quantity: number;
}

interface OrderWithDetails extends SalesOrder {
  customer_name: string;
  lines_count: number;
  total_amount: number;
  tracking_number: string | null;
  lines?: (SalesOrderLine & { product_name?: string; product_sku?: string })[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (status) {
    case 'shipped':
    case 'confirmed':
      return 'default';
    case 'draft':
    case 'picking':
      return 'secondary';
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

function stockBadge(qty: number) {
  if (qty <= 0) return <Badge variant="destructive">Out of Stock</Badge>;
  if (qty <= 10) return <Badge variant="outline" className="border-amber-500 text-amber-700">Low Stock</Badge>;
  return <Badge variant="default" className="bg-green-600">In Stock</Badge>;
}

// ── Page component ──────────────────────────────────────────────────────────

export default function CustomerPortalPage() {
  const { user, tenantId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  // ── Shared state ────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [loading, setLoading] = useState(true);

  // Stats
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [portalEnabled, setPortalEnabled] = useState(0);
  const [ordersThisMonth, setOrdersThisMonth] = useState(0);
  const [revenueThisMonth, setRevenueThisMonth] = useState(0);

  // ── Catalog tab state ───────────────────────────────────────────────────
  const [catalogCustomerId, setCatalogCustomerId] = useState('');
  const [catalogProducts, setCatalogProducts] = useState<ProductWithStock[]>([]);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');
  const [catalogCart, setCatalogCart] = useState<Record<string, number>>({});
  const [catalogLoading, setCatalogLoading] = useState(false);

  // ── Live Inventory tab state ────────────────────────────────────────────
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryCategory, setInventoryCategory] = useState('all');
  const [inventoryStorage, setInventoryStorage] = useState('all');
  const [inventoryProducts, setInventoryProducts] = useState<(Product & { available_qty: number })[]>([]);
  const [showPricing, setShowPricing] = useState(true);
  const [showLotDetails, setShowLotDetails] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // ── Quick Order tab state ───────────────────────────────────────────────
  const [qoCustomerId, setQoCustomerId] = useState('');
  const [qoCart, setQoCart] = useState<CartItem[]>([]);
  const [qoSearch, setQoSearch] = useState('');
  const [qoSearchResults, setQoSearchResults] = useState<ProductWithStock[]>([]);
  const [qoShowResults, setQoShowResults] = useState(false);
  const [qoPlacing, setQoPlacing] = useState(false);
  const [qoConfirmedOrder, setQoConfirmedOrder] = useState<string | null>(null);
  const [qoRecentOrders, setQoRecentOrders] = useState<OrderWithDetails[]>([]);
  const qoSearchRef = useRef<HTMLInputElement>(null);

  // ── Order History tab state ─────────────────────────────────────────────
  const [ohCustomerId, setOhCustomerId] = useState('');
  const [ohOrders, setOhOrders] = useState<OrderWithDetails[]>([]);
  const [ohExpandedId, setOhExpandedId] = useState<string | null>(null);
  const [ohStatusFilter, setOhStatusFilter] = useState('all');
  const [ohDateFrom, setOhDateFrom] = useState('');
  const [ohDateTo, setOhDateTo] = useState('');
  const [ohLoading, setOhLoading] = useState(false);
  const [ohStats, setOhStats] = useState({ totalOrders: 0, totalSpent: 0, avgValue: 0, lastOrder: '' });

  // ── Customer Profiles tab state ─────────────────────────────────────────
  const [cpCustomerId, setCpCustomerId] = useState('');
  const [cpCustomer, setCpCustomer] = useState<Customer | null>(null);
  const [cpPrices, setCpPrices] = useState<(CustomerPrice & { product_name?: string; product_sku?: string })[]>([]);
  const [cpSalesSummary, setCpSalesSummary] = useState({ thisMonth: 0, thisQuarter: 0, thisYear: 0, revenue: 0, topProducts: [] as { name: string; qty: number }[] });
  const [cpNotes, setCpNotes] = useState('');
  const [cpSavingNotes, setCpSavingNotes] = useState(false);
  const [cpPriceTierId, setCpPriceTierId] = useState('');
  const [cpAddPriceOpen, setCpAddPriceOpen] = useState(false);
  const [cpNewPrice, setCpNewPrice] = useState({ product_id: '', custom_price: '', effective_date: new Date().toISOString().split('T')[0], expiration_date: '', notes: '' });
  const [cpLoading, setCpLoading] = useState(false);

  // ── Categories derived ──────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category || 'General'));
    return ['all', ...Array.from(cats).sort()];
  }, [products]);

  // ══════════════════════════════════════════════════════════════════════════
  // Data loading
  // ══════════════════════════════════════════════════════════════════════════

  const loadBaseData = useCallback(async () => {
    if (!tenantId) return;

    const [custRes, prodRes, tierRes] = await Promise.all([
      supabase.from('customers').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('price_tiers').select('*').eq('tenant_id', tenantId).order('name'),
    ]);

    const custs = custRes.data || [];
    const prods = prodRes.data || [];
    const tiers = tierRes.data || [];

    setCustomers(custs);
    setProducts(prods);
    setPriceTiers(tiers);
    setTotalCustomers(custs.length);
    setPortalEnabled(custs.filter((c) => c.email).length);

    // Stats: orders & revenue this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: monthOrders } = await supabase
      .from('sales_orders')
      .select('id')
      .eq('tenant_id', tenantId)
      .gte('created_at', startOfMonth.toISOString());

    setOrdersThisMonth(monthOrders?.length || 0);

    if (monthOrders && monthOrders.length > 0) {
      const orderIds = monthOrders.map((o) => o.id);
      const { data: monthLines } = await supabase
        .from('sales_order_lines')
        .select('unit_price, quantity_ordered')
        .eq('tenant_id', tenantId)
        .in('order_id', orderIds);
      const rev = (monthLines || []).reduce((s, l) => s + l.unit_price * l.quantity_ordered, 0);
      setRevenueThisMonth(rev);
    } else {
      setRevenueThisMonth(0);
    }

    setLoading(false);
  }, [tenantId, supabase]);

  useEffect(() => { loadBaseData(); }, [loadBaseData]);

  // ── Helper: get stock map ─────────────────────────────────────────────
  async function getStockMap(): Promise<Record<string, number>> {
    if (!tenantId) return {};
    const { data: lots } = await supabase
      .from('lots')
      .select('product_id, quantity_on_hand')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .gt('quantity_on_hand', 0);

    const map: Record<string, number> = {};
    (lots || []).forEach((l: { product_id: string; quantity_on_hand: number }) => {
      map[l.product_id] = (map[l.product_id] || 0) + l.quantity_on_hand;
    });
    return map;
  }

  // ── Helper: get customer pricing ──────────────────────────────────────
  async function getCustomerPricing(customerId: string): Promise<{ customPrices: Record<string, number>; tierDiscount: number }> {
    if (!tenantId) return { customPrices: {}, tierDiscount: 0 };

    const { data: cp } = await supabase
      .from('customer_prices')
      .select('product_id, custom_price')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId);

    const customPrices: Record<string, number> = {};
    (cp || []).forEach((r: { product_id: string; custom_price: number }) => {
      customPrices[r.product_id] = r.custom_price;
    });

    let tierDiscount = 0;
    const customer = customers.find((c) => c.id === customerId);
    if (customer?.price_tier_id) {
      const { data: tier } = await supabase
        .from('price_tiers')
        .select('discount_percent')
        .eq('id', customer.price_tier_id)
        .single();
      if (tier) tierDiscount = tier.discount_percent;
    }

    return { customPrices, tierDiscount };
  }

  // ── Helper: build ProductWithStock list for a customer ────────────────
  async function buildCustomerProducts(customerId: string): Promise<ProductWithStock[]> {
    const [stockMap, { customPrices, tierDiscount }] = await Promise.all([
      getStockMap(),
      getCustomerPricing(customerId),
    ]);

    return products.map((p) => {
      const available_qty = stockMap[p.id] || 0;
      const customer_price = customPrices[p.id] ?? null;
      const tier_price = tierDiscount > 0 ? p.price * (1 - tierDiscount / 100) : null;
      const effective_price = customer_price ?? tier_price ?? p.price;
      const savings = p.price - effective_price;
      return { ...p, available_qty, customer_price, tier_price, effective_price, savings };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Customer Catalog tab
  // ══════════════════════════════════════════════════════════════════════════

  async function loadCatalog(customerId: string) {
    if (!customerId) { setCatalogProducts([]); return; }
    setCatalogLoading(true);
    const prods = await buildCustomerProducts(customerId);
    setCatalogProducts(prods);
    setCatalogCart({});
    setCatalogLoading(false);
  }

  const filteredCatalog = useMemo(() => {
    let list = catalogProducts;
    if (catalogSearch) {
      const q = catalogSearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    if (catalogCategory !== 'all') {
      list = list.filter((p) => (p.category || 'General') === catalogCategory);
    }
    return list;
  }, [catalogProducts, catalogSearch, catalogCategory]);

  // ══════════════════════════════════════════════════════════════════════════
  // Live Inventory tab
  // ══════════════════════════════════════════════════════════════════════════

  async function loadInventory() {
    if (!tenantId) return;
    setInventoryLoading(true);
    const stockMap = await getStockMap();
    const withStock = products
      .map((p) => ({ ...p, available_qty: stockMap[p.id] || 0 }))
      .filter((p) => p.available_qty > 0);
    setInventoryProducts(withStock);
    setInventoryLoading(false);
  }

  const filteredInventory = useMemo(() => {
    let list = inventoryProducts;
    if (inventorySearch) {
      const q = inventorySearch.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    if (inventoryCategory !== 'all') {
      list = list.filter((p) => (p.category || 'General') === inventoryCategory);
    }
    if (inventoryStorage !== 'all') {
      list = list.filter((p) => p.storage_requirement === inventoryStorage);
    }
    return list;
  }, [inventoryProducts, inventorySearch, inventoryCategory, inventoryStorage]);

  // ══════════════════════════════════════════════════════════════════════════
  // Quick Order tab
  // ══════════════════════════════════════════════════════════════════════════

  async function loadQoData(customerId: string) {
    if (!customerId || !tenantId) { setQoRecentOrders([]); return; }
    // Recent orders
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('*, customer:customers(name)')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(5);

    const mapped: OrderWithDetails[] = await Promise.all(
      (orders || []).map(async (o: SalesOrder & { customer?: { name: string } }) => {
        const { data: lines } = await supabase
          .from('sales_order_lines')
          .select('*')
          .eq('order_id', o.id);
        const total = (lines || []).reduce((s: number, l: SalesOrderLine) => s + l.unit_price * l.quantity_ordered, 0);
        return {
          ...o,
          customer_name: o.customer?.name || '',
          lines_count: lines?.length || 0,
          total_amount: total,
          tracking_number: null,
        };
      })
    );
    setQoRecentOrders(mapped);
  }

  async function handleQoSearch(query: string) {
    setQoSearch(query);
    if (!query || query.length < 2 || !qoCustomerId) {
      setQoSearchResults([]);
      setQoShowResults(false);
      return;
    }
    const prods = await buildCustomerProducts(qoCustomerId);
    const q = query.toLowerCase();
    const results = prods.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    ).slice(0, 10);
    setQoSearchResults(results);
    setQoShowResults(true);
  }

  function addToQoCart(product: ProductWithStock) {
    const existing = qoCart.find((c) => c.product.id === product.id);
    if (existing) {
      setQoCart(qoCart.map((c) => c.product.id === product.id ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setQoCart([...qoCart, { product, quantity: 1 }]);
    }
    setQoSearch('');
    setQoShowResults(false);
    toast.success(`Added ${product.name} to cart`);
  }

  function updateQoQty(productId: string, qty: number) {
    if (qty <= 0) {
      setQoCart(qoCart.filter((c) => c.product.id !== productId));
    } else {
      setQoCart(qoCart.map((c) => c.product.id === productId ? { ...c, quantity: qty } : c));
    }
  }

  function removeFromQoCart(productId: string) {
    setQoCart(qoCart.filter((c) => c.product.id !== productId));
  }

  const qoSubtotal = useMemo(() => qoCart.reduce((s, c) => s + c.product.effective_price * c.quantity, 0), [qoCart]);
  const qoItemCount = useMemo(() => qoCart.reduce((s, c) => s + c.quantity, 0), [qoCart]);

  async function placeOrder() {
    if (!tenantId || !user || !qoCustomerId || qoCart.length === 0) return;
    setQoPlacing(true);
    setQoConfirmedOrder(null);

    const orderNum = `SO-${Date.now().toString(36).toUpperCase()}`;

    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .insert({
        tenant_id: tenantId,
        order_number: orderNum,
        customer_id: qoCustomerId,
        status: 'confirmed',
        notes: 'Created via Customer Portal — Quick Order',
        created_by: user.id,
      })
      .select()
      .single();

    if (orderErr || !order) {
      toast.error(orderErr?.message || 'Failed to create order');
      setQoPlacing(false);
      return;
    }

    const lineInserts = qoCart.map((c) => ({
      tenant_id: tenantId,
      order_id: order.id,
      product_id: c.product.id,
      quantity_ordered: c.quantity,
      quantity_shipped: 0,
      unit_price: c.product.effective_price,
    }));

    const { error: lineErr } = await supabase.from('sales_order_lines').insert(lineInserts);
    if (lineErr) {
      toast.error(lineErr.message);
      setQoPlacing(false);
      return;
    }

    toast.success(`Order ${orderNum} placed successfully`);
    setQoConfirmedOrder(orderNum);
    setQoCart([]);
    setQoPlacing(false);
    loadQoData(qoCustomerId);
    loadBaseData();
  }

  function printOrder() {
    window.print();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Order History tab
  // ══════════════════════════════════════════════════════════════════════════

  async function loadOrderHistory(customerId: string) {
    if (!customerId || !tenantId) { setOhOrders([]); return; }
    setOhLoading(true);

    let query = supabase
      .from('sales_orders')
      .select('*, customer:customers(name)')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (ohStatusFilter !== 'all') {
      query = query.eq('status', ohStatusFilter);
    }
    if (ohDateFrom) {
      query = query.gte('created_at', ohDateFrom);
    }
    if (ohDateTo) {
      query = query.lte('created_at', ohDateTo + 'T23:59:59');
    }

    const { data: orders } = await query;

    // Get shipments for tracking numbers
    const { data: shipments } = await supabase
      .from('shipments')
      .select('order_id, tracking_number')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId);

    const shipMap: Record<string, string | null> = {};
    (shipments || []).forEach((s: { order_id: string; tracking_number: string | null }) => {
      if (s.tracking_number) shipMap[s.order_id] = s.tracking_number;
    });

    const mapped: OrderWithDetails[] = await Promise.all(
      (orders || []).map(async (o: SalesOrder & { customer?: { name: string } }) => {
        const { data: lines } = await supabase
          .from('sales_order_lines')
          .select('*, product:products(name, sku)')
          .eq('order_id', o.id);
        const total = (lines || []).reduce((s: number, l: SalesOrderLine) => s + l.unit_price * l.quantity_ordered, 0);
        return {
          ...o,
          customer_name: o.customer?.name || '',
          lines_count: lines?.length || 0,
          total_amount: total,
          tracking_number: shipMap[o.id] || null,
          lines: (lines || []).map((l: SalesOrderLine & { product?: { name: string; sku: string } }) => ({
            ...l,
            product_name: l.product?.name || '',
            product_sku: l.product?.sku || '',
          })),
        };
      })
    );

    setOhOrders(mapped);

    // Stats
    const allTotal = mapped.reduce((s, o) => s + o.total_amount, 0);
    setOhStats({
      totalOrders: mapped.length,
      totalSpent: allTotal,
      avgValue: mapped.length > 0 ? allTotal / mapped.length : 0,
      lastOrder: mapped.length > 0 ? mapped[0].created_at : '',
    });

    setOhLoading(false);
  }

  function reorder(order: OrderWithDetails) {
    if (!order.lines || order.lines.length === 0) {
      toast.error('No line items to reorder');
      return;
    }
    // Copy items into Quick Order tab cart
    const newCart: CartItem[] = order.lines.map((l) => {
      const prod = products.find((p) => p.id === l.product_id);
      return {
        product: {
          ...(prod || {} as Product),
          available_qty: 0,
          customer_price: null,
          tier_price: null,
          effective_price: l.unit_price,
          savings: 0,
        } as ProductWithStock,
        quantity: l.quantity_ordered,
      };
    });
    setQoCustomerId(ohCustomerId);
    setQoCart(newCart);
    toast.success('Items copied to Quick Order. Switch to the Quick Order tab to place.');
  }

  function exportOrderHistory() {
    if (ohOrders.length === 0) { toast.error('No orders to export'); return; }
    const data = ohOrders.map((o) => ({
      order_number: o.order_number,
      date: formatDate(o.created_at),
      status: o.status,
      items: o.lines_count,
      total: o.total_amount,
      tracking: o.tracking_number || '',
    }));
    exportToCSV(data, 'order_history', [
      { key: 'order_number', label: 'Order #' },
      { key: 'date', label: 'Date' },
      { key: 'status', label: 'Status' },
      { key: 'items', label: 'Items' },
      { key: 'total', label: 'Total' },
      { key: 'tracking', label: 'Tracking #' },
    ]);
    toast.success('Exported order history');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Customer Profiles tab
  // ══════════════════════════════════════════════════════════════════════════

  async function loadCustomerProfile(customerId: string) {
    if (!customerId || !tenantId) { setCpCustomer(null); return; }
    setCpLoading(true);

    const customer = customers.find((c) => c.id === customerId);
    if (!customer) { setCpLoading(false); return; }
    setCpCustomer(customer);
    setCpNotes(customer.notes || '');
    setCpPriceTierId(customer.price_tier_id || '');

    // Custom prices
    const { data: prices } = await supabase
      .from('customer_prices')
      .select('*, product:products(name, sku)')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .order('effective_date', { ascending: false });

    setCpPrices(
      (prices || []).map((p: CustomerPrice & { product?: { name: string; sku: string } }) => ({
        ...p,
        product_name: p.product?.name || '',
        product_sku: p.product?.sku || '',
      }))
    );

    // Sales summary
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const { data: yearOrders } = await supabase
      .from('sales_orders')
      .select('id, created_at')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .gte('created_at', startOfYear.toISOString());

    const orderIds = (yearOrders || []).map((o: { id: string }) => o.id);
    let yearLines: (SalesOrderLine & { product?: { name: string } })[] = [];
    if (orderIds.length > 0) {
      const { data: lines } = await supabase
        .from('sales_order_lines')
        .select('*, product:products(name)')
        .in('order_id', orderIds);
      yearLines = lines || [];
    }

    const monthOrderIds = new Set((yearOrders || []).filter((o: { id: string; created_at: string }) => new Date(o.created_at) >= startOfMonth).map((o: { id: string }) => o.id));
    const quarterOrderIds = new Set((yearOrders || []).filter((o: { id: string; created_at: string }) => new Date(o.created_at) >= startOfQuarter).map((o: { id: string }) => o.id));

    const monthCount = monthOrderIds.size;
    const quarterCount = quarterOrderIds.size;
    const yearCount = orderIds.length;
    const totalRevenue = yearLines.reduce((s, l) => s + l.unit_price * l.quantity_ordered, 0);

    // Top products
    const prodQty: Record<string, { name: string; qty: number }> = {};
    yearLines.forEach((l) => {
      const name = (l as { product?: { name: string } }).product?.name || 'Unknown';
      if (!prodQty[l.product_id]) prodQty[l.product_id] = { name, qty: 0 };
      prodQty[l.product_id].qty += l.quantity_ordered;
    });
    const topProducts = Object.values(prodQty).sort((a, b) => b.qty - a.qty).slice(0, 5);

    setCpSalesSummary({
      thisMonth: monthCount,
      thisQuarter: quarterCount,
      thisYear: yearCount,
      revenue: totalRevenue,
      topProducts,
    });

    setCpLoading(false);
  }

  async function savePriceTier() {
    if (!tenantId || !cpCustomerId) return;
    const { error } = await supabase
      .from('customers')
      .update({ price_tier_id: cpPriceTierId || null })
      .eq('id', cpCustomerId)
      .eq('tenant_id', tenantId);
    if (error) { toast.error('Failed to update price tier'); return; }
    toast.success('Price tier updated');
    loadBaseData();
  }

  async function saveNotes() {
    if (!tenantId || !cpCustomerId) return;
    setCpSavingNotes(true);
    const { error } = await supabase
      .from('customers')
      .update({ notes: cpNotes })
      .eq('id', cpCustomerId)
      .eq('tenant_id', tenantId);
    setCpSavingNotes(false);
    if (error) { toast.error('Failed to save notes'); return; }
    toast.success('Notes saved');
  }

  async function addPriceOverride() {
    if (!tenantId || !cpCustomerId || !cpNewPrice.product_id || !cpNewPrice.custom_price) {
      toast.error('Product and price are required');
      return;
    }

    const { error } = await supabase.from('customer_prices').insert({
      tenant_id: tenantId,
      customer_id: cpCustomerId,
      product_id: cpNewPrice.product_id,
      custom_price: parseFloat(cpNewPrice.custom_price),
      effective_date: cpNewPrice.effective_date,
      expiration_date: cpNewPrice.expiration_date || null,
      notes: cpNewPrice.notes || null,
    });

    if (error) { toast.error(error.message); return; }
    toast.success('Price override added');
    setCpAddPriceOpen(false);
    setCpNewPrice({ product_id: '', custom_price: '', effective_date: new Date().toISOString().split('T')[0], expiration_date: '', notes: '' });
    loadCustomerProfile(cpCustomerId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers: license expiry
  // ══════════════════════════════════════════════════════════════════════════

  function licenseExpiryBadge(date: string | null) {
    if (!date) return <Badge variant="secondary">N/A</Badge>;
    const days = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    if (days < 0) return <Badge variant="destructive">Expired</Badge>;
    if (days <= 30) return <Badge variant="destructive">Expires in {days}d</Badge>;
    if (days <= 90) return <Badge variant="outline" className="border-amber-500 text-amber-700">Expires in {days}d</Badge>;
    return <Badge variant="default" className="bg-green-600">Valid</Badge>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Customer selector component
  // ══════════════════════════════════════════════════════════════════════════

  function CustomerSelector({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
    return (
      <div className="flex items-center gap-3">
        {label && <Label className="text-sm font-medium whitespace-nowrap">{label}</Label>}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="w-[320px]">
            <SelectValue placeholder="Select a customer..." />
          </SelectTrigger>
          <SelectContent>
            {customers.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Customer Portal" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6 h-24 animate-pulse bg-muted/50" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Portal"
        description="Customer management, self-service catalog, ordering, and profiles"
      />

      {/* ── Stat Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Customers" value={formatNumber(totalCustomers)} icon={Users} />
        <StatCard title="Portal-Enabled" value={formatNumber(portalEnabled)} icon={Mail} description="Customers with email" />
        <StatCard title="Orders This Month" value={formatNumber(ordersThisMonth)} icon={ShoppingCart} />
        <StatCard title="Revenue This Month" value={formatCurrency(revenueThisMonth)} icon={DollarSign} />
      </div>

      {/* ── Tabs ──────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="catalog" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="catalog" className="flex items-center gap-1.5">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Customer Catalog</span>
            <span className="sm:hidden">Catalog</span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" />
            <span className="hidden sm:inline">Live Inventory</span>
            <span className="sm:hidden">Inventory</span>
          </TabsTrigger>
          <TabsTrigger value="quick-order" className="flex items-center gap-1.5">
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Quick Order</span>
            <span className="sm:hidden">Order</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-1.5">
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Order History</span>
            <span className="sm:hidden">History</span>
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center gap-1.5">
            <UserCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Customer Profiles</span>
            <span className="sm:hidden">Profiles</span>
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════════════════════
            Customer Catalog Tab
            ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="catalog" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Catalog</CardTitle>
              <CardDescription>View products and pricing specific to each customer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CustomerSelector
                value={catalogCustomerId}
                onChange={(v) => { setCatalogCustomerId(v); loadCatalog(v); }}
                label="Customer"
              />

              {catalogCustomerId && (
                <>
                  <div className="flex flex-wrap gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search products..."
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={catalogCategory} onValueChange={setCatalogCategory}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {catalogLoading ? (
                    <div className="py-12 text-center text-muted-foreground">Loading catalog...</div>
                  ) : filteredCatalog.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">No products found.</div>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-center">Stock</TableHead>
                            <TableHead className="text-right">Standard Price</TableHead>
                            <TableHead className="text-right">Customer Price</TableHead>
                            <TableHead className="text-right">Savings</TableHead>
                            <TableHead className="text-right">Add to Cart</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCatalog.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                              <TableCell className="text-muted-foreground">{p.category || 'General'}</TableCell>
                              <TableCell className="text-center">{stockBadge(p.available_qty)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{formatCurrency(p.price)}</TableCell>
                              <TableCell className="text-right font-medium">{formatCurrency(p.effective_price)}</TableCell>
                              <TableCell className="text-right">
                                {p.savings > 0 ? (
                                  <span className="text-green-600 font-medium">{formatCurrency(p.savings)}</span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <Input
                                    type="number"
                                    min={1}
                                    value={catalogCart[p.id] || 1}
                                    onChange={(e) => setCatalogCart({ ...catalogCart, [p.id]: parseInt(e.target.value) || 1 })}
                                    className="w-16 h-8 text-sm"
                                    disabled={p.available_qty <= 0}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={p.available_qty <= 0}
                                    onClick={() => {
                                      const qty = catalogCart[p.id] || 1;
                                      const existing = qoCart.find((c) => c.product.id === p.id);
                                      if (existing) {
                                        setQoCart(qoCart.map((c) => c.product.id === p.id ? { ...c, quantity: c.quantity + qty } : c));
                                      } else {
                                        setQoCart([...qoCart, { product: p, quantity: qty }]);
                                      }
                                      setQoCustomerId(catalogCustomerId);
                                      toast.success(`Added ${qty}x ${p.name} to cart`);
                                    }}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            Live Inventory Tab
            ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Live Inventory</CardTitle>
                  <CardDescription>Real-time inventory view for customer-facing display</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadInventory}>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Info banner */}
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                <Info className="h-4 w-4 shrink-0" />
                <span>This is what your customers see — a live view of available inventory.</span>
              </div>

              {/* Filters + toggles */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products..."
                    value={inventorySearch}
                    onChange={(e) => setInventorySearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={inventoryCategory} onValueChange={setInventoryCategory}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={inventoryStorage} onValueChange={setInventoryStorage}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Storage" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Storage</SelectItem>
                    <SelectItem value="room_temp">Room Temp</SelectItem>
                    <SelectItem value="refrigerated">Refrigerated</SelectItem>
                    <SelectItem value="frozen">Frozen</SelectItem>
                  </SelectContent>
                </Select>
                <Separator orientation="vertical" className="h-8" />
                <div className="flex items-center gap-2">
                  <Switch checked={showPricing} onCheckedChange={setShowPricing} id="show-pricing" />
                  <Label htmlFor="show-pricing" className="text-sm cursor-pointer">Pricing</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={showLotDetails} onCheckedChange={setShowLotDetails} id="show-lots" />
                  <Label htmlFor="show-lots" className="text-sm cursor-pointer">Lot Details</Label>
                </div>
              </div>

              {inventoryLoading ? (
                <div className="py-12 text-center text-muted-foreground">Loading inventory...</div>
              ) : inventoryProducts.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <p>No inventory loaded yet.</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={loadInventory}>Load Inventory</Button>
                </div>
              ) : filteredInventory.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">No products match your filters.</div>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Available Qty</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead>UOM</TableHead>
                        {showPricing && <TableHead className="text-right">Price</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredInventory.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                          <TableCell className="text-muted-foreground">{p.category || 'General'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="font-medium">{formatNumber(p.available_qty)}</span>
                              {stockBadge(p.available_qty)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{storageLabel(p.storage_requirement)}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{p.unit_of_measure}</TableCell>
                          {showPricing && (
                            <TableCell className="text-right font-medium">{formatCurrency(p.price)}</TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            Quick Order Tab
            ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="quick-order" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Order</CardTitle>
              <CardDescription>Build and place orders quickly for any customer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CustomerSelector
                value={qoCustomerId}
                onChange={(v) => { setQoCustomerId(v); setQoCart([]); setQoConfirmedOrder(null); loadQoData(v); }}
                label="Customer"
              />

              {qoCustomerId && (
                <>
                  {/* Confirmed order */}
                  {qoConfirmedOrder && (
                    <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-green-800 dark:text-green-200">Order Confirmed</p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            Order <span className="font-mono font-bold">{qoConfirmedOrder}</span> has been placed successfully.
                          </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={printOrder}>
                          <Printer className="h-4 w-4 mr-1.5" />
                          Print Order
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Product search */}
                  <div className="relative">
                    <Label className="text-sm mb-1.5 block">Add Products</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        ref={qoSearchRef}
                        placeholder="Search by product name or SKU..."
                        value={qoSearch}
                        onChange={(e) => handleQoSearch(e.target.value)}
                        onFocus={() => { if (qoSearchResults.length > 0) setQoShowResults(true); }}
                        onBlur={() => setTimeout(() => setQoShowResults(false), 200)}
                        className="pl-9"
                      />
                    </div>
                    {qoShowResults && qoSearchResults.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
                        {qoSearchResults.map((p) => (
                          <button
                            key={p.id}
                            className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between text-sm"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addToQoCart(p)}
                          >
                            <div>
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground ml-2 font-mono text-xs">{p.sku}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{formatCurrency(p.effective_price)}</span>
                              {stockBadge(p.available_qty)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Cart */}
                  {qoCart.length > 0 ? (
                    <>
                      <div className="rounded-md border overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead className="w-[100px]">Qty</TableHead>
                              <TableHead className="text-right">Unit Price</TableHead>
                              <TableHead className="text-right">Line Total</TableHead>
                              <TableHead className="w-[60px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {qoCart.map((item) => (
                              <TableRow key={item.product.id}>
                                <TableCell>
                                  <div>
                                    <span className="font-medium">{item.product.name}</span>
                                    <span className="ml-2 text-xs text-muted-foreground font-mono">{item.product.sku}</span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={1}
                                    value={item.quantity}
                                    onChange={(e) => updateQoQty(item.product.id, parseInt(e.target.value) || 0)}
                                    className="w-20 h-8"
                                  />
                                </TableCell>
                                <TableCell className="text-right">{formatCurrency(item.product.effective_price)}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(item.product.effective_price * item.quantity)}
                                </TableCell>
                                <TableCell>
                                  <Button variant="ghost" size="sm" onClick={() => removeFromQoCart(item.product.id)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Cart summary */}
                      <div className="flex items-center justify-between rounded-md bg-muted/50 p-4">
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{qoItemCount}</span> item{qoItemCount !== 1 ? 's' : ''} in cart
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">Subtotal</p>
                          <p className="text-xl font-bold">{formatCurrency(qoSubtotal)}</p>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button onClick={placeOrder} disabled={qoPlacing} size="lg">
                          {qoPlacing ? 'Placing Order...' : 'Place Order'}
                        </Button>
                      </div>
                    </>
                  ) : !qoConfirmedOrder ? (
                    <div className="py-8 text-center text-muted-foreground">
                      Search for products above to add them to the cart.
                    </div>
                  ) : null}

                  {/* Recent orders */}
                  {qoRecentOrders.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Recent Orders (Last 5)</h3>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Order #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Items</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {qoRecentOrders.map((o) => (
                                <TableRow key={o.id}>
                                  <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                                  <TableCell>{formatDate(o.created_at)}</TableCell>
                                  <TableCell>
                                    <Badge variant={statusBadgeVariant(o.status)}>
                                      {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">{o.lines_count}</TableCell>
                                  <TableCell className="text-right font-medium">{formatCurrency(o.total_amount)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            Order History Tab
            ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>Full order history and analytics per customer</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={exportOrderHistory} disabled={ohOrders.length === 0}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <CustomerSelector
                value={ohCustomerId}
                onChange={(v) => { setOhCustomerId(v); setOhExpandedId(null); loadOrderHistory(v); }}
                label="Customer"
              />

              {ohCustomerId && (
                <>
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={ohStatusFilter} onValueChange={(v) => { setOhStatusFilter(v); }}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="picking">Picking</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm whitespace-nowrap">From</Label>
                      <Input type="date" value={ohDateFrom} onChange={(e) => setOhDateFrom(e.target.value)} className="w-[160px] h-9" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm whitespace-nowrap">To</Label>
                      <Input type="date" value={ohDateTo} onChange={(e) => setOhDateTo(e.target.value)} className="w-[160px] h-9" />
                    </div>
                    <Button variant="outline" size="sm" onClick={() => loadOrderHistory(ohCustomerId)}>
                      <Search className="h-4 w-4 mr-1.5" />
                      Apply
                    </Button>
                  </div>

                  {/* Stats */}
                  {ohStats.totalOrders > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Total Orders</p>
                        <p className="text-lg font-bold">{ohStats.totalOrders}</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Total Spent</p>
                        <p className="text-lg font-bold">{formatCurrency(ohStats.totalSpent)}</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Avg Order Value</p>
                        <p className="text-lg font-bold">{formatCurrency(ohStats.avgValue)}</p>
                      </div>
                      <div className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">Last Order</p>
                        <p className="text-lg font-bold">{ohStats.lastOrder ? formatDate(ohStats.lastOrder) : '-'}</p>
                      </div>
                    </div>
                  )}

                  {/* Orders table */}
                  {ohLoading ? (
                    <div className="py-12 text-center text-muted-foreground">Loading orders...</div>
                  ) : ohOrders.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">No orders found for this customer.</div>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]"></TableHead>
                            <TableHead>Order #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Items</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead>Tracking</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ohOrders.map((o) => (
                            <>
                              <TableRow
                                key={o.id}
                                className="cursor-pointer"
                                onClick={() => setOhExpandedId(ohExpandedId === o.id ? null : o.id)}
                              >
                                <TableCell>
                                  {ohExpandedId === o.id ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </TableCell>
                                <TableCell className="font-mono text-sm">{o.order_number}</TableCell>
                                <TableCell>{formatDate(o.created_at)}</TableCell>
                                <TableCell>
                                  <Badge variant={statusBadgeVariant(o.status)}>
                                    {o.status.charAt(0).toUpperCase() + o.status.slice(1)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{o.lines_count}</TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(o.total_amount)}</TableCell>
                                <TableCell className="font-mono text-xs">
                                  {o.tracking_number || <span className="text-muted-foreground">-</span>}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); reorder(o); }}
                                    title="Reorder"
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                              {ohExpandedId === o.id && o.lines && (
                                <TableRow key={`${o.id}-details`}>
                                  <TableCell colSpan={8} className="bg-muted/30 p-0">
                                    <div className="p-4">
                                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Line Items</p>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead>Product</TableHead>
                                            <TableHead>SKU</TableHead>
                                            <TableHead className="text-right">Qty Ordered</TableHead>
                                            <TableHead className="text-right">Qty Shipped</TableHead>
                                            <TableHead className="text-right">Unit Price</TableHead>
                                            <TableHead className="text-right">Total</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {o.lines.map((l) => (
                                            <TableRow key={l.id}>
                                              <TableCell className="font-medium">{l.product_name}</TableCell>
                                              <TableCell className="font-mono text-xs">{l.product_sku}</TableCell>
                                              <TableCell className="text-right">{l.quantity_ordered}</TableCell>
                                              <TableCell className="text-right">{l.quantity_shipped}</TableCell>
                                              <TableCell className="text-right">{formatCurrency(l.unit_price)}</TableCell>
                                              <TableCell className="text-right font-medium">
                                                {formatCurrency(l.unit_price * l.quantity_ordered)}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════
            Customer Profiles Tab
            ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="profiles" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Customer Profiles</CardTitle>
              <CardDescription>View and manage customer information, pricing, and sales data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CustomerSelector
                value={cpCustomerId}
                onChange={(v) => { setCpCustomerId(v); loadCustomerProfile(v); }}
                label="Customer"
              />

              {cpCustomerId && cpCustomer && !cpLoading && (
                <div className="space-y-6">
                  {/* Profile Card + License */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Contact Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="grid grid-cols-[100px_1fr] gap-y-2">
                          <span className="text-muted-foreground">Name</span>
                          <span className="font-medium">{cpCustomer.name}</span>
                          <span className="text-muted-foreground">Contact</span>
                          <span>{cpCustomer.contact_name || '-'}</span>
                          <span className="text-muted-foreground">Email</span>
                          <span>{cpCustomer.email || '-'}</span>
                          <span className="text-muted-foreground">Phone</span>
                          <span>{cpCustomer.phone || '-'}</span>
                          <span className="text-muted-foreground">Address</span>
                          <span>{cpCustomer.ship_to_address || '-'}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">License Information</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="grid grid-cols-[100px_1fr] gap-y-2">
                          <span className="text-muted-foreground">Type</span>
                          <span>{cpCustomer.license_type || '-'}</span>
                          <span className="text-muted-foreground">Number</span>
                          <span className="font-mono">{cpCustomer.license_number || '-'}</span>
                          <span className="text-muted-foreground">Expiration</span>
                          <span className="flex items-center gap-2">
                            {cpCustomer.license_expiration ? formatDate(cpCustomer.license_expiration) : '-'}
                            {cpCustomer.license_expiration && licenseExpiryBadge(cpCustomer.license_expiration)}
                          </span>
                        </div>
                        {cpCustomer.license_expiration && (
                          (() => {
                            const days = Math.ceil((new Date(cpCustomer.license_expiration).getTime() - Date.now()) / 86400000);
                            if (days <= 30 && days >= 0) {
                              return (
                                <div className="flex items-center gap-2 mt-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  License expires in {days} day{days !== 1 ? 's' : ''}. Renewal recommended.
                                </div>
                              );
                            }
                            return null;
                          })()
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Price Tier */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Pricing</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-end gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-sm">Price Tier</Label>
                          <Select value={cpPriceTierId} onValueChange={setCpPriceTierId}>
                            <SelectTrigger className="w-[280px]">
                              <SelectValue placeholder="No tier assigned" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No tier (standard pricing)</SelectItem>
                              {priceTiers.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name} ({t.discount_percent}% discount)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button variant="outline" size="sm" onClick={savePriceTier}>Save Tier</Button>
                      </div>

                      <Separator />

                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold">Custom Price Overrides</h4>
                        <Button variant="outline" size="sm" onClick={() => setCpAddPriceOpen(true)}>
                          <Plus className="h-4 w-4 mr-1.5" />
                          Add Price Override
                        </Button>
                      </div>

                      {cpPrices.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No custom price overrides for this customer.</p>
                      ) : (
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Product</TableHead>
                                <TableHead>SKU</TableHead>
                                <TableHead className="text-right">Custom Price</TableHead>
                                <TableHead>Effective</TableHead>
                                <TableHead>Expires</TableHead>
                                <TableHead>Notes</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cpPrices.map((p) => (
                                <TableRow key={p.id}>
                                  <TableCell className="font-medium">{p.product_name}</TableCell>
                                  <TableCell className="font-mono text-xs">{p.product_sku}</TableCell>
                                  <TableCell className="text-right font-medium">{formatCurrency(p.custom_price)}</TableCell>
                                  <TableCell>{formatDate(p.effective_date)}</TableCell>
                                  <TableCell>{p.expiration_date ? formatDate(p.expiration_date) : 'No expiry'}</TableCell>
                                  <TableCell className="text-muted-foreground text-xs">{p.notes || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Sales Summary */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Sales Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">This Month</p>
                          <p className="text-lg font-bold">{cpSalesSummary.thisMonth} orders</p>
                        </div>
                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">This Quarter</p>
                          <p className="text-lg font-bold">{cpSalesSummary.thisQuarter} orders</p>
                        </div>
                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">This Year</p>
                          <p className="text-lg font-bold">{cpSalesSummary.thisYear} orders</p>
                        </div>
                        <div className="rounded-md border p-3">
                          <p className="text-xs text-muted-foreground">Year Revenue</p>
                          <p className="text-lg font-bold">{formatCurrency(cpSalesSummary.revenue)}</p>
                        </div>
                      </div>

                      {cpSalesSummary.topProducts.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Top Products (This Year)</p>
                          <div className="space-y-1.5">
                            {cpSalesSummary.topProducts.map((tp, i) => (
                              <div key={i} className="flex items-center justify-between text-sm rounded-md bg-muted/50 px-3 py-1.5">
                                <span>{tp.name}</span>
                                <Badge variant="secondary">{formatNumber(tp.qty)} units</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Notes */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Notes</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        value={cpNotes}
                        onChange={(e) => setCpNotes(e.target.value)}
                        placeholder="Add notes about this customer..."
                        rows={4}
                      />
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={saveNotes} disabled={cpSavingNotes}>
                          {cpSavingNotes ? 'Saving...' : 'Save Notes'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {cpLoading && (
                <div className="py-12 text-center text-muted-foreground">Loading profile...</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add Price Override Dialog ──────────────────────────────────────── */}
      <Dialog open={cpAddPriceOpen} onOpenChange={setCpAddPriceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Price Override</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={cpNewPrice.product_id} onValueChange={(v) => setCpNewPrice({ ...cpNewPrice, product_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.sku} - {p.name} (std: {formatCurrency(p.price)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Custom Price *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cpNewPrice.custom_price}
                onChange={(e) => setCpNewPrice({ ...cpNewPrice, custom_price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Effective Date</Label>
                <Input
                  type="date"
                  value={cpNewPrice.effective_date}
                  onChange={(e) => setCpNewPrice({ ...cpNewPrice, effective_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input
                  type="date"
                  value={cpNewPrice.expiration_date}
                  onChange={(e) => setCpNewPrice({ ...cpNewPrice, expiration_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={cpNewPrice.notes}
                onChange={(e) => setCpNewPrice({ ...cpNewPrice, notes: e.target.value })}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCpAddPriceOpen(false)}>Cancel</Button>
            <Button onClick={addPriceOverride}>Add Override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
