'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ScanBarcode,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  ShoppingCart,
  Receipt,
  X,
  Banknote,
  Percent,
  Search,
  Pause,
  Play,
  Clock,
  User,
  DollarSign,
  ClipboardList,
  Wrench,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { Product } from '@/types/database';

interface CartItem {
  product: Product | null; // null for service/labor lines
  productId: string | null;
  label: string;
  sku: string;
  lineType: 'product' | 'service';
  quantity: number;
  unitPrice: number;
  originalPrice: number;
  discount: number;
}

interface WOResult {
  id: string;
  order_number: string;
  customer_name: string | null;
  asset_info: string | null;
  status: string;
  grand_total: number;
}

type PaymentMethod = 'card' | 'cash' | 'check';

export default function POSRegisterPage() {
  const { user, tenantId } = useAuth();
  const [scanInput, setScanInput] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [cashTendered, setCashTendered] = useState('');
  const [lastReceipt, setLastReceipt] = useState<{ items: CartItem[]; total: number; tax: number; ref: string; payment: PaymentMethod; change: number } | null>(null);
  const [heldTransactions, setHeldTransactions] = useState<{ id: string; items: CartItem[]; time: string }[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [orderDiscount, setOrderDiscount] = useState(0); // percentage
  const [discountDialogOpen, setDiscountDialogOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searchMode, setSearchMode] = useState(false);
  const [transactionCount, setTransactionCount] = useState(0);
  const [woDialogOpen, setWoDialogOpen] = useState(false);
  const [woSearch, setWoSearch] = useState('');
  const [woResults, setWoResults] = useState<WOResult[]>([]);
  const [woLoading, setWoLoading] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const TAX_RATE = 0.0825; // 8.25%

  useEffect(() => { scanRef.current?.focus(); }, []);

  // Load today's transaction count
  useEffect(() => {
    if (!tenantId || !user) return;
    const supabase = createClient();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    supabase.from('stock_movements')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('reason', 'POS in-store sale')
      .gte('created_at', today.toISOString())
      .then(({ count }) => setTransactionCount(count || 0));
  }, [tenantId, user, lastReceipt]);

  const addToCart = useCallback(async (query: string) => {
    if (!tenantId || !query.trim()) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('products').select('*')
      .eq('tenant_id', tenantId).eq('is_archived', false)
      .or(`sku.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(1);

    if (!data || data.length === 0) { toast.error('Item not found'); return; }
    const product = data[0] as Product;

    const now = new Date().toISOString();
    const { data: promos } = await supabase
      .from('promotions').select('sale_price')
      .eq('tenant_id', tenantId).eq('product_id', product.id).eq('status', 'active')
      .lte('start_date', now).gte('end_date', now).limit(1);

    const unitPrice = promos && promos.length > 0 ? promos[0].sale_price : product.price;

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.productId === product.id && i.lineType === 'product');
      if (idx >= 0) {
        const up = [...prev];
        up[idx] = { ...up[idx], quantity: up[idx].quantity + 1 };
        return up;
      }
      return [...prev, {
        product, productId: product.id, label: product.name, sku: product.sku,
        lineType: 'product', quantity: 1, unitPrice, originalPrice: product.price, discount: 0,
      }];
    });
    toast.success(product.name);
  }, [tenantId]);

  const handleScan = () => {
    const v = scanInput.trim();
    if (!v) return;
    setScanInput('');
    if (searchMode) {
      handleSearch(v);
    } else {
      addToCart(v);
    }
    scanRef.current?.focus();
  };

  const handleSearch = async (query: string) => {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('products').select('*')
      .eq('tenant_id', tenantId).eq('is_archived', false)
      .or(`sku.ilike.%${query}%,name.ilike.%${query}%,category.ilike.%${query}%`)
      .limit(10);
    setSearchResults(data || []);
  };

  const updateQty = (idx: number, delta: number) => {
    setCart((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const q = item.quantity + delta;
      return q <= 0 ? null as unknown as CartItem : { ...item, quantity: q };
    }).filter(Boolean));
  };

  // ── Work Order Lookup ──
  const searchWorkOrders = async () => {
    if (!tenantId || !woSearch.trim()) return;
    setWoLoading(true);
    const supabase = createClient();
    const q = woSearch.trim();
    const { data } = await supabase
      .from('work_orders')
      .select('id, order_number, customer_name, asset_info, status, grand_total')
      .eq('tenant_id', tenantId)
      .in('status', ['completed', 'in_progress'])
      .or(`order_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
      .order('created_at', { ascending: false })
      .limit(10);
    setWoResults((data as WOResult[]) || []);
    setWoLoading(false);
  };

  const loadWorkOrderIntoCart = async (woId: string) => {
    if (!tenantId) return;
    const supabase = createClient();

    // Get work order
    const { data: wo } = await supabase.from('work_orders').select('*').eq('id', woId).single();
    if (!wo) { toast.error('Work order not found'); return; }

    // Get lines
    const { data: lines } = await supabase.from('work_order_lines').select('*').eq('work_order_id', woId);

    // Add each line to cart
    const newItems: CartItem[] = (lines || []).map((l: Record<string, unknown>) => ({
      product: null,
      productId: (l.product_id as string) || null,
      label: l.description as string,
      sku: l.line_type === 'service' ? 'LABOR' : (l.product_id as string)?.slice(0, 8) || 'PART',
      lineType: (l.line_type as string) === 'service' ? 'service' as const : 'product' as const,
      quantity: l.quantity as number,
      unitPrice: l.unit_price as number,
      originalPrice: l.unit_price as number,
      discount: 0,
    }));

    setCart(newItems);
    setCustomerName(wo.customer_name || '');
    setWoDialogOpen(false);
    setWoSearch('');
    setWoResults([]);
    toast.success(`Loaded ${wo.order_number} — ${newItems.length} lines`);
  };

  const subtotal = cart.reduce((s, i) => s + (i.unitPrice - i.discount) * i.quantity, 0);
  const discountAmount = subtotal * (orderDiscount / 100);
  const taxableAmount = subtotal - discountAmount;
  const tax = taxableAmount * TAX_RATE;
  const total = taxableAmount + tax;
  const change = paymentMethod === 'cash' && cashTendered ? parseFloat(cashTendered) - total : 0;

  // Hold transaction
  const holdTransaction = () => {
    if (cart.length === 0) return;
    setHeldTransactions((prev) => [...prev, {
      id: crypto.randomUUID(),
      items: [...cart],
      time: new Date().toLocaleTimeString(),
    }]);
    setCart([]);
    setCustomerName('');
    setOrderDiscount(0);
    toast.success('Transaction held');
    scanRef.current?.focus();
  };

  // Recall held transaction
  const recallTransaction = (id: string) => {
    const held = heldTransactions.find((h) => h.id === id);
    if (!held) return;
    setCart(held.items);
    setHeldTransactions((prev) => prev.filter((h) => h.id !== id));
    toast.success('Transaction recalled');
  };

  const handleCheckout = async () => {
    if (!tenantId || !user || cart.length === 0) return;
    if (paymentMethod === 'cash' && (!cashTendered || parseFloat(cashTendered) < total)) {
      toast.error('Insufficient cash tendered');
      return;
    }
    setProcessing(true);
    const supabase = createClient();
    const ref = `POS-${Date.now().toString(36).toUpperCase()}`;

    // Process card payment via Stripe if applicable
    if (paymentMethod === 'card') {
      try {
        const chargeRes = await fetch('/api/pos/charge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: total,
            description: `POS Sale ${ref}`,
            metadata: { reference: ref, customer: customerName || 'Walk-in', items: cart.length },
          }),
        });
        const chargeData = await chargeRes.json();
        if (!chargeRes.ok) {
          toast.error(chargeData.error || 'Card payment failed');
          setProcessing(false);
          return;
        }
        if (chargeData.demo) {
          toast.info('Demo mode — card not actually charged');
        }
      } catch {
        toast.error('Payment processing failed');
        setProcessing(false);
        return;
      }
    }

    // Record stock movements for product lines
    for (const item of cart) {
      if (item.lineType === 'product' && item.productId) {
        await supabase.from('stock_movements').insert({
          tenant_id: tenantId, product_id: item.productId, user_id: user.id,
          quantity: -item.quantity, movement_type: 'ship', reason: 'POS in-store sale',
          reference_number: ref,
          metadata: {
            channel: 'in_store', payment_method: paymentMethod,
            unit_price: item.unitPrice, item_discount: item.discount,
            line_total: (item.unitPrice - item.discount) * item.quantity,
            customer_name: customerName || null,
            order_discount_pct: orderDiscount,
            tax_rate: TAX_RATE,
          },
        });
      }
    }

    setProcessing(false);
    setLastReceipt({ items: [...cart], total, tax, ref, payment: paymentMethod, change: Math.max(change, 0) });
    setCart([]);
    setCustomerName('');
    setOrderDiscount(0);
    setCashTendered('');
    toast.success(`Sale: ${ref}`);
    scanRef.current?.focus();
  };

  const applyDiscount = () => {
    const pct = parseFloat(discountInput);
    if (isNaN(pct) || pct < 0 || pct > 100) { toast.error('Enter 0-100'); return; }
    setOrderDiscount(pct);
    setDiscountDialogOpen(false);
    setDiscountInput('');
    toast.success(`${pct}% discount applied`);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left: scan + items */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Scan bar */}
        <div className="p-3 border-b bg-muted/30 flex gap-2">
          <div className="flex-1 flex gap-2">
            <Input
              ref={scanRef}
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
              placeholder={searchMode ? 'Search products...' : 'Scan item...'}
              className="h-14 text-xl font-mono"
              autoFocus
            />
            <Button onClick={handleScan} className="h-14 w-14 shrink-0" size="lg">
              {searchMode ? <Search className="h-6 w-6" /> : <ScanBarcode className="h-6 w-6" />}
            </Button>
          </div>
          <Button
            variant={searchMode ? 'default' : 'outline'}
            className="h-14 w-14 shrink-0"
            onClick={() => { setSearchMode(!searchMode); setSearchResults([]); }}
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>

        {/* Search results */}
        {searchMode && searchResults.length > 0 && (
          <div className="border-b bg-background p-2 grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
            {searchResults.map((p) => (
              <button
                key={p.id}
                className="text-left p-2 rounded-lg border hover:bg-accent transition-colors"
                onClick={() => { addToCart(p.sku); setSearchResults([]); setSearchMode(false); setScanInput(''); }}
              >
                <p className="text-sm font-medium truncate">{p.name}</p>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="font-mono">{p.sku}</span>
                  <span className="font-bold text-foreground">{formatCurrency(p.price)}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {cart.length === 0 && !lastReceipt && (
            <div className="text-center py-20 text-muted-foreground">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg">Ready to scan</p>
            </div>
          )}

          {lastReceipt && (
            <Card className="border-green-300 bg-green-50 dark:bg-green-950/20 mb-3">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Receipt className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-bold text-lg">{formatCurrency(lastReceipt.total)}</p>
                    <p className="text-xs text-muted-foreground">
                      {lastReceipt.ref} — {lastReceipt.payment.toUpperCase()}
                      {lastReceipt.change > 0 && ` — Change: ${formatCurrency(lastReceipt.change)}`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setLastReceipt(null); scanRef.current?.focus(); }}>
                  Next <X className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Cart line items */}
          {cart.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border bg-card">
              <span className="text-xs text-muted-foreground w-6 text-right shrink-0">{idx + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.label}</p>
                <div className="flex items-center gap-2">
                  {item.lineType === 'service' && <Badge variant="outline" className="text-[9px] px-1 py-0"><Wrench className="h-2 w-2 mr-0.5" />Labor</Badge>}
                  <span className="text-xs text-muted-foreground font-mono">{item.sku}</span>
                  {item.unitPrice < item.originalPrice && (
                    <Badge className="bg-red-500 text-white text-[9px] px-1 py-0">SALE</Badge>
                  )}
                  {item.discount > 0 && (
                    <Badge variant="outline" className="text-[9px] px-1 py-0">-{formatCurrency(item.discount)}</Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => updateQty(idx, -1)}>
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => updateQty(idx, 1)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-sm font-bold w-20 text-right shrink-0">
                {formatCurrency((item.unitPrice - item.discount) * item.quantity)}
              </p>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={() => setCart((p) => p.filter((_, i) => i !== idx))}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* Work order + actions bar */}
        {cart.length === 0 && (
          <div className="border-t p-2 flex gap-2 bg-muted/30">
            <Button variant="outline" size="sm" className="h-9" onClick={() => setWoDialogOpen(true)}>
              <ClipboardList className="h-3.5 w-3.5 mr-1" /> Ring Up Work Order
            </Button>
            {heldTransactions.length > 0 && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => recallTransaction(heldTransactions[heldTransactions.length - 1].id)}>
                <Play className="h-3.5 w-3.5 mr-1" /> Recall ({heldTransactions.length})
              </Button>
            )}
          </div>
        )}
        {cart.length > 0 && (
          <div className="border-t p-2 flex gap-2 bg-muted/30">
            <Button variant="outline" size="sm" className="h-9" onClick={holdTransaction}>
              <Pause className="h-3.5 w-3.5 mr-1" /> Hold
            </Button>
            <Button variant="outline" size="sm" className="h-9" onClick={() => setDiscountDialogOpen(true)}>
              <Percent className="h-3.5 w-3.5 mr-1" /> Discount
            </Button>
            <Button variant="outline" size="sm" className="h-9 text-destructive" onClick={() => { setCart([]); setOrderDiscount(0); setCustomerName(''); }}>
              <X className="h-3.5 w-3.5 mr-1" /> Void
            </Button>
            <div className="flex-1" />
            {heldTransactions.length > 0 && (
              <Button variant="outline" size="sm" className="h-9" onClick={() => recallTransaction(heldTransactions[heldTransactions.length - 1].id)}>
                <Play className="h-3.5 w-3.5 mr-1" /> Recall ({heldTransactions.length})
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Right: totals + payment */}
      <div className="lg:w-80 border-l flex flex-col shrink-0">
        {/* Register info */}
        <div className="p-3 border-b bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date().toLocaleDateString()}</div>
          <div className="flex items-center gap-1"><Receipt className="h-3 w-3" /> {transactionCount} sales today</div>
        </div>

        {/* Customer */}
        <div className="p-3 border-b">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer (optional)"
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Totals */}
        <div className="flex-1 p-4 flex flex-col justify-end space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            {orderDiscount > 0 && (
              <div className="flex justify-between text-green-600"><span>Discount ({orderDiscount}%)</span><span>-{formatCurrency(discountAmount)}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Tax ({(TAX_RATE * 100).toFixed(2)}%)</span><span>{formatCurrency(tax)}</span></div>
          </div>
          <Separator />
          <div className="flex justify-between text-3xl font-bold">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: 'card', icon: CreditCard, label: 'Card' },
              { key: 'cash', icon: Banknote, label: 'Cash' },
              { key: 'check', icon: DollarSign, label: 'Check' },
            ] as const).map(({ key, icon: Icon, label }) => (
              <Button
                key={key}
                variant={paymentMethod === key ? 'default' : 'outline'}
                className="h-12 flex-col gap-0.5"
                onClick={() => setPaymentMethod(key)}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px]">{label}</span>
              </Button>
            ))}
          </div>

          {/* Cash tendered */}
          {paymentMethod === 'cash' && (
            <div className="space-y-2">
              <Label className="text-xs">Cash Tendered</Label>
              <Input
                type="number"
                step="0.01"
                value={cashTendered}
                onChange={(e) => setCashTendered(e.target.value)}
                placeholder="0.00"
                className="h-12 text-xl text-right font-mono"
              />
              {cashTendered && parseFloat(cashTendered) >= total && (
                <div className="text-right text-lg font-bold text-green-600">
                  Change: {formatCurrency(parseFloat(cashTendered) - total)}
                </div>
              )}
              {/* Quick cash buttons */}
              <div className="grid grid-cols-4 gap-1">
                {[1, 5, 10, 20, 50, 100].map((amt) => (
                  <Button key={amt} variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCashTendered(String(amt))}>
                    ${amt}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCashTendered(String(Math.ceil(total)))}>
                  Exact
                </Button>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCashTendered('')}>
                  Clear
                </Button>
              </div>
            </div>
          )}

          {/* Checkout button */}
          <Button
            onClick={handleCheckout}
            disabled={processing || cart.length === 0 || (paymentMethod === 'cash' && (!cashTendered || parseFloat(cashTendered) < total))}
            className="w-full h-16 text-xl font-bold"
            size="lg"
          >
            {processing ? 'Processing...' : (
              <><CreditCard className="h-5 w-5 mr-2" /> Pay {formatCurrency(total)}</>
            )}
          </Button>
        </div>
      </div>

      {/* Discount dialog */}
      <Dialog open={discountDialogOpen} onOpenChange={setDiscountDialogOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle>Apply Discount</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Discount Percentage</Label>
            <div className="flex gap-2">
              <Input
                type="number" min="0" max="100" step="1"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                placeholder="e.g. 10"
                className="h-12 text-lg"
                autoFocus
              />
              <span className="flex items-center text-2xl font-bold text-muted-foreground">%</span>
            </div>
            <div className="flex gap-2">
              {[5, 10, 15, 20, 25].map((p) => (
                <Button key={p} variant="outline" size="sm" onClick={() => setDiscountInput(String(p))}>{p}%</Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountDialogOpen(false)}>Cancel</Button>
            <Button onClick={applyDiscount}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Work Order lookup dialog */}
      <Dialog open={woDialogOpen} onOpenChange={setWoDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ring Up Work Order</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">
              <Input
                value={woSearch}
                onChange={(e) => setWoSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchWorkOrders(); }}
                placeholder="Search by WO# or customer name..."
                autoFocus
              />
              <Button onClick={searchWorkOrders} disabled={woLoading}>
                {woLoading ? '...' : 'Search'}
              </Button>
            </div>
            {woResults.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {woResults.map((wo) => (
                  <div
                    key={wo.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => loadWorkOrderIntoCart(wo.id)}
                  >
                    <div>
                      <p className="font-mono font-medium text-sm">{wo.order_number}</p>
                      <p className="text-xs text-muted-foreground">{wo.customer_name || 'No customer'}</p>
                      {wo.asset_info && <p className="text-xs text-muted-foreground">{wo.asset_info}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(wo.grand_total)}</p>
                      <Badge variant="outline" className="text-[10px]">{wo.status}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {woResults.length === 0 && woSearch && !woLoading && (
              <p className="text-sm text-muted-foreground text-center py-4">No work orders found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
