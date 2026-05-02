'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { usePortal } from './portal-context';
import { formatDate, formatCurrency, formatNumber } from '@/lib/format';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart, Search, Plus, Minus, Trash2, Package, CheckCircle2,
  ChevronDown, ChevronUp, RefreshCw, Loader2, ShoppingBag, ClipboardList, User,
} from 'lucide-react';

// ────────────────────────── Types ──────────────────────────

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  description: string | null;
  unit_price: number;
  stock: number;
  customer_price: number | null;
  tier_discount: number | null;
}

interface CartItem {
  product: Product;
  quantity: number;
}

interface OrderLine {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Shipment {
  id: string;
  tracking_number: string | null;
  status: string;
  shipped_date: string | null;
}

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  total_amount: number;
  lines: OrderLine[];
  shipments: Shipment[];
}

// ────────────────────────── Main Page ──────────────────────────

export default function PortalPage() {
  const { customer, tenantId } = usePortal();
  const [activeTab, setActiveTab] = useState('shop');

  // ── Cart state (shared across tabs so Reorder can populate it) ──
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = useCallback((product: Product, qty: number) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + qty }
            : i
        );
      }
      return [...prev, { product, quantity: qty }];
    });
    toast.success(`Added ${qty} x ${product.name} to cart`);
  }, []);

  const switchToShop = useCallback(() => setActiveTab('shop'), []);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="mb-6">
        <TabsTrigger value="shop" className="gap-2">
          <ShoppingBag className="h-4 w-4" /> Shop
        </TabsTrigger>
        <TabsTrigger value="orders" className="gap-2">
          <ClipboardList className="h-4 w-4" /> My Orders
        </TabsTrigger>
        <TabsTrigger value="account" className="gap-2">
          <User className="h-4 w-4" /> My Account
        </TabsTrigger>
      </TabsList>

      <TabsContent value="shop">
        <ShopTab
          customer={customer}
          tenantId={tenantId}
          cart={cart}
          setCart={setCart}
          addToCart={addToCart}
        />
      </TabsContent>

      <TabsContent value="orders">
        <OrdersTab
          customer={customer}
          tenantId={tenantId}
          addToCart={addToCart}
          switchToShop={switchToShop}
        />
      </TabsContent>

      <TabsContent value="account">
        <AccountTab customer={customer} tenantId={tenantId} />
      </TabsContent>
    </Tabs>
  );
}

// ═══════════════════════════════════════════════════════════════
//  SHOP TAB
// ═══════════════════════════════════════════════════════════════

function ShopTab({
  customer,
  tenantId,
  cart,
  setCart,
  addToCart,
}: {
  customer: { id: string; price_tier_id: string | null };
  tenantId: string;
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  addToCart: (p: Product, qty: number) => void;
}) {
  const supabase = createClient();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [qtyInputs, setQtyInputs] = useState<Record<string, number>>({});
  const [placingOrder, setPlacingOrder] = useState(false);

  // Fetch products with stock + pricing
  useEffect(() => {
    async function fetchProducts() {
      // Products for this tenant
      const { data: prods } = await supabase
        .from('products')
        .select('id, name, sku, category, description, unit_price')
        .eq('tenant_id', tenantId)
        .order('name');

      if (!prods) { setLoading(false); return; }

      // Active lot stock
      const { data: lots } = await supabase
        .from('lots')
        .select('product_id, quantity_on_hand')
        .eq('tenant_id', tenantId)
        .eq('status', 'active');

      const stockMap: Record<string, number> = {};
      (lots || []).forEach((l: { product_id: string; quantity_on_hand: number }) => {
        stockMap[l.product_id] = (stockMap[l.product_id] || 0) + l.quantity_on_hand;
      });

      // Customer-specific prices
      const { data: customerPrices } = await supabase
        .from('customer_prices')
        .select('product_id, price')
        .eq('customer_id', customer.id);

      const cpMap: Record<string, number> = {};
      (customerPrices || []).forEach((cp: { product_id: string; price: number }) => {
        cpMap[cp.product_id] = cp.price;
      });

      // Price tier discount
      let tierDiscount: number | null = null;
      if (customer.price_tier_id) {
        const { data: tier } = await supabase
          .from('price_tiers')
          .select('discount_percent')
          .eq('id', customer.price_tier_id)
          .maybeSingle();
        if (tier) tierDiscount = tier.discount_percent;
      }

      const enriched: Product[] = prods.map((p) => ({
        ...p,
        stock: stockMap[p.id] || 0,
        customer_price: cpMap[p.id] ?? null,
        tier_discount: tierDiscount,
      }));

      setProducts(enriched);
      setLoading(false);
    }

    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, customer.id]);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (p.stock <= 0) return false;
      if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, search, categoryFilter]);

  function effectivePrice(p: Product): number {
    if (p.customer_price !== null) return p.customer_price;
    if (p.tier_discount !== null) return p.unit_price * (1 - p.tier_discount / 100);
    return p.unit_price;
  }

  function stockIndicator(stock: number) {
    if (stock <= 0) return <Badge variant="destructive">Out of Stock</Badge>;
    if (stock <= 10) return <Badge className="bg-amber-500 text-white border-transparent">Low Stock</Badge>;
    return <Badge className="bg-emerald-600 text-white border-transparent">In Stock</Badge>;
  }

  const cartTotal = cart.reduce((sum, item) => sum + effectivePrice(item.product) * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function updateCartQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.product.id !== productId));
    } else {
      setCart((prev) =>
        prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
      );
    }
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  async function placeOrder() {
    if (cart.length === 0) return;
    setPlacingOrder(true);

    try {
      // Create sales order
      const orderNumber = `PO-${Date.now().toString(36).toUpperCase()}`;
      const { data: order, error: orderError } = await supabase
        .from('sales_orders')
        .insert({
          tenant_id: tenantId,
          customer_id: customer.id,
          order_number: orderNumber,
          status: 'pending',
          total_amount: cartTotal,
        })
        .select('id, order_number')
        .single();

      if (orderError) throw orderError;

      // Create order lines
      const lines = cart.map((item) => ({
        tenant_id: tenantId,
        sales_order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: effectivePrice(item.product),
        total_price: effectivePrice(item.product) * item.quantity,
      }));

      const { error: linesError } = await supabase
        .from('sales_order_lines')
        .insert(lines);

      if (linesError) throw linesError;

      setCart([]);
      toast.success(`Order ${order.order_number} placed successfully!`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to place order';
      toast.error(message);
    } finally {
      setPlacingOrder(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Product grid */}
      <div className="space-y-4">
        {/* Search + filter */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search products..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Products */}
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Package className="mx-auto mb-3 h-10 w-10" />
            <p>No products found.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => {
              const price = effectivePrice(p);
              const qty = qtyInputs[p.id] || 1;
              return (
                <Card key={p.id} className="flex flex-col justify-between">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base leading-tight">{p.name}</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground font-mono">{p.sku}</p>
                      </div>
                      {p.category && <Badge variant="secondary" className="shrink-0">{p.category}</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xl font-bold">{formatCurrency(price)}</span>
                      {stockIndicator(p.stock)}
                    </div>
                    {p.customer_price !== null && (
                      <p className="text-xs text-emerald-600 font-medium">Your special price</p>
                    )}
                    {p.customer_price === null && p.tier_discount !== null && (
                      <p className="text-xs text-emerald-600 font-medium">{p.tier_discount}% tier discount applied</p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center rounded-md border">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-r-none"
                          onClick={() => setQtyInputs((prev) => ({ ...prev, [p.id]: Math.max(1, (prev[p.id] || 1) - 1) }))}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          className="h-8 w-14 rounded-none border-x text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          type="number"
                          min={1}
                          max={p.stock}
                          value={qty}
                          onChange={(e) =>
                            setQtyInputs((prev) => ({
                              ...prev,
                              [p.id]: Math.max(1, Math.min(p.stock, parseInt(e.target.value) || 1)),
                            }))
                          }
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-l-none"
                          onClick={() => setQtyInputs((prev) => ({ ...prev, [p.id]: Math.min(p.stock, (prev[p.id] || 1) + 1) }))}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button
                        className="flex-1"
                        size="sm"
                        onClick={() => {
                          addToCart(p, qty);
                          setQtyInputs((prev) => ({ ...prev, [p.id]: 1 }));
                        }}
                      >
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart sidebar */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="h-5 w-5" />
              Cart
              {cartCount > 0 && (
                <Badge variant="secondary" className="ml-auto">{cartCount} item{cartCount !== 1 ? 's' : ''}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cart.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Your cart is empty
              </p>
            ) : (
              <>
                <div className="max-h-80 space-y-3 overflow-y-auto">
                  {cart.map((item) => {
                    const price = effectivePrice(item.product);
                    return (
                      <div key={item.product.id} className="flex items-center gap-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight truncate">{item.product.name}</p>
                          <p className="text-muted-foreground">
                            {item.quantity} x {formatCurrency(price)}
                          </p>
                        </div>
                        <p className="font-medium shrink-0">{formatCurrency(price * item.quantity)}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateCartQty(item.product.id, item.quantity - 1)}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => updateCartQty(item.product.id, item.quantity + 1)}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeFromCart(item.product.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Separator />

                <div className="flex items-center justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>

                <Button
                  className="w-full"
                  onClick={placeOrder}
                  disabled={placingOrder}
                >
                  {placingOrder ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Place Order
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MY ORDERS TAB
// ═══════════════════════════════════════════════════════════════

function OrdersTab({
  customer,
  tenantId,
  addToCart,
  switchToShop,
}: {
  customer: { id: string; price_tier_id: string | null };
  tenantId: string;
  addToCart: (p: Product, qty: number) => void;
  switchToShop: () => void;
}) {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    async function fetchOrders() {
      const { data: rawOrders } = await supabase
        .from('sales_orders')
        .select('id, order_number, created_at, status, total_amount')
        .eq('customer_id', customer.id)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!rawOrders || rawOrders.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const orderIds = rawOrders.map((o) => o.id);

      // Fetch lines with product info
      const { data: lines } = await supabase
        .from('sales_order_lines')
        .select('id, sales_order_id, product_id, quantity, unit_price, total_price, products(name, sku)')
        .in('sales_order_id', orderIds);

      // Fetch shipments
      const { data: shipments } = await supabase
        .from('shipments')
        .select('id, sales_order_id, tracking_number, status, shipped_date')
        .in('sales_order_id', orderIds);

      const linesMap: Record<string, OrderLine[]> = {};
      (lines || []).forEach((l: Record<string, unknown>) => {
        const soId = l.sales_order_id as string;
        if (!linesMap[soId]) linesMap[soId] = [];
        const prod = l.products as { name: string; sku: string } | null;
        linesMap[soId].push({
          id: l.id as string,
          product_id: l.product_id as string,
          product_name: prod?.name || 'Unknown',
          product_sku: prod?.sku || '',
          quantity: l.quantity as number,
          unit_price: l.unit_price as number,
          total_price: l.total_price as number,
        });
      });

      const shipmentsMap: Record<string, Shipment[]> = {};
      (shipments || []).forEach((s: Record<string, unknown>) => {
        const soId = s.sales_order_id as string;
        if (!shipmentsMap[soId]) shipmentsMap[soId] = [];
        shipmentsMap[soId].push({
          id: s.id as string,
          tracking_number: s.tracking_number as string | null,
          status: s.status as string,
          shipped_date: s.shipped_date as string | null,
        });
      });

      const enriched: Order[] = rawOrders.map((o) => ({
        ...o,
        lines: linesMap[o.id] || [],
        shipments: shipmentsMap[o.id] || [],
      }));

      setOrders(enriched);
      setLoading(false);
    }

    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, tenantId]);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return orders;
    return orders.filter((o) => o.status === statusFilter);
  }, [orders, statusFilter]);

  const statuses = useMemo(() => {
    return Array.from(new Set(orders.map((o) => o.status)));
  }, [orders]);

  function statusBadge(status: string) {
    const variants: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800 border-amber-200',
      confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
      processing: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      shipped: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
    };
    return (
      <Badge variant="outline" className={variants[status] || ''}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  }

  async function handleReorder(order: Order) {
    // Fetch current products to get up-to-date stock/pricing
    const productIds = order.lines.map((l) => l.product_id);
    const { data: prods } = await supabase
      .from('products')
      .select('id, name, sku, category, description, unit_price')
      .in('id', productIds);

    if (!prods) {
      toast.error('Failed to load product details');
      return;
    }

    for (const line of order.lines) {
      const prod = prods.find((p) => p.id === line.product_id);
      if (prod) {
        addToCart(
          { ...prod, stock: 999, customer_price: null, tier_discount: null },
          line.quantity
        );
      }
    }

    switchToShop();
    toast.success('Items added to cart from previous order');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Order History</h2>
        {statuses.length > 1 && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <ClipboardList className="mx-auto mb-3 h-10 w-10" />
          <p>No orders found.</p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((order) => {
                const isExpanded = expandedOrder === order.id;
                return (
                  <OrderTableRow
                    key={order.id}
                    order={order}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedOrder(isExpanded ? null : order.id)}
                    onReorder={() => handleReorder(order)}
                    statusBadge={statusBadge}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function OrderTableRow({
  order,
  isExpanded,
  onToggle,
  onReorder,
  statusBadge,
}: {
  order: Order;
  isExpanded: boolean;
  onToggle: () => void;
  onReorder: () => void;
  statusBadge: (s: string) => React.ReactNode;
}) {
  const itemCount = order.lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {order.order_number}
          </div>
        </TableCell>
        <TableCell>{formatDate(order.created_at)}</TableCell>
        <TableCell>{statusBadge(order.status)}</TableCell>
        <TableCell className="text-right">{formatNumber(itemCount)}</TableCell>
        <TableCell className="text-right font-medium">{formatCurrency(order.total_amount)}</TableCell>
        <TableCell className="text-right">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onReorder();
            }}
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Reorder
          </Button>
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-muted/30 p-4">
            <div className="space-y-4">
              {/* Line items */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">Items</h4>
                <div className="space-y-1">
                  {order.lines.map((line) => (
                    <div key={line.id} className="flex items-center justify-between text-sm">
                      <span>
                        {line.product_name}{' '}
                        <span className="text-muted-foreground">({line.product_sku})</span>
                      </span>
                      <span>
                        {line.quantity} x {formatCurrency(line.unit_price)} ={' '}
                        <span className="font-medium">{formatCurrency(line.total_price)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Shipments */}
              {order.shipments.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Shipments</h4>
                  <div className="space-y-1">
                    {order.shipments.map((s) => (
                      <div key={s.id} className="flex items-center gap-4 text-sm">
                        <Badge variant="outline">{s.status}</Badge>
                        {s.tracking_number && (
                          <span className="font-mono text-muted-foreground">
                            Tracking: {s.tracking_number}
                          </span>
                        )}
                        {s.shipped_date && (
                          <span className="text-muted-foreground">
                            Shipped {formatDate(s.shipped_date)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MY ACCOUNT TAB
// ═══════════════════════════════════════════════════════════════

function AccountTab({
  customer,
  tenantId,
}: {
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    address: string | null;
    notes: string | null;
  };
  tenantId: string;
}) {
  const supabase = createClient();
  const [stats, setStats] = useState<{
    totalOrders: number;
    totalSpent: number;
    avgOrder: number;
    lastOrder: string | null;
  } | null>(null);

  useEffect(() => {
    async function fetchStats() {
      const { data: orders } = await supabase
        .from('sales_orders')
        .select('id, total_amount, created_at')
        .eq('customer_id', customer.id)
        .eq('tenant_id', tenantId);

      if (!orders || orders.length === 0) {
        setStats({ totalOrders: 0, totalSpent: 0, avgOrder: 0, lastOrder: null });
        return;
      }

      const totalSpent = orders.reduce((s, o) => s + (o.total_amount || 0), 0);
      const sorted = [...orders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setStats({
        totalOrders: orders.length,
        totalSpent,
        avgOrder: totalSpent / orders.length,
        lastOrder: sorted[0].created_at,
      });
    }

    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, tenantId]);

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Contact info */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Your account details on file with your supplier.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="mt-1">{customer.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="mt-1">{customer.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Phone</p>
              <p className="mt-1">{customer.phone || '---'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Address</p>
              <p className="mt-1">{customer.address || '---'}</p>
            </div>
          </div>
          <Separator />
          <Button
            variant="outline"
            onClick={() =>
              toast.info('Contact your supplier to update your account details.')
            }
          >
            Request Changes
          </Button>
        </CardContent>
      </Card>

      {/* Order stats */}
      <Card>
        <CardHeader>
          <CardTitle>Order Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          {!stats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{formatNumber(stats.totalOrders)}</p>
                <p className="text-sm text-muted-foreground">Total Orders</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{formatCurrency(stats.totalSpent)}</p>
                <p className="text-sm text-muted-foreground">Total Spent</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{formatCurrency(stats.avgOrder)}</p>
                <p className="text-sm text-muted-foreground">Avg. Order</p>
              </div>
              <div className="rounded-lg border p-4 text-center">
                <p className="text-2xl font-bold">{stats.lastOrder ? formatDate(stats.lastOrder) : '---'}</p>
                <p className="text-sm text-muted-foreground">Last Order</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
