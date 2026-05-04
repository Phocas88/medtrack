'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { Product } from '@/types/database';

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

export default function POSRegisterPage() {
  const { user, tenantId } = useAuth();
  const [scanInput, setScanInput] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ items: CartItem[]; total: number; ref: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scanRef.current?.focus(); }, []);

  const addToCart = useCallback(async (query: string) => {
    if (!tenantId || !query.trim()) return;
    const supabase = createClient();

    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .or(`sku.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(1);

    if (!data || data.length === 0) { toast.error('Product not found'); return; }
    const product = data[0] as Product;

    const now = new Date().toISOString();
    const { data: promos } = await supabase
      .from('promotions').select('sale_price')
      .eq('tenant_id', tenantId).eq('product_id', product.id).eq('status', 'active')
      .lte('start_date', now).gte('end_date', now).limit(1);

    const unitPrice = promos && promos.length > 0 ? promos[0].sale_price : product.price;

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + 1 };
        return updated;
      }
      return [...prev, { product, quantity: 1, unitPrice }];
    });
    toast.success(`${product.name} added`);
  }, [tenantId]);

  const handleScan = () => {
    const v = scanInput.trim();
    if (!v) return;
    setScanInput('');
    addToCart(v);
    scanRef.current?.focus();
  };

  const updateQty = (pid: string, delta: number) => {
    setCart((prev) => prev.map((i) => {
      if (i.product.id !== pid) return i;
      const q = i.quantity + delta;
      return q <= 0 ? null as unknown as CartItem : { ...i, quantity: q };
    }).filter(Boolean));
  };

  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleCheckout = async () => {
    if (!tenantId || !user || cart.length === 0) return;
    setProcessing(true);
    const supabase = createClient();
    const ref = `POS-${Date.now().toString(36).toUpperCase()}`;

    for (const item of cart) {
      await supabase.from('stock_movements').insert({
        tenant_id: tenantId, product_id: item.product.id, user_id: user.id,
        quantity: -item.quantity, movement_type: 'ship', reason: 'POS in-store sale',
        reference_number: ref,
        metadata: { channel: 'in_store', unit_price: item.unitPrice, line_total: item.unitPrice * item.quantity },
      });
    }

    setProcessing(false);
    setLastReceipt({ items: [...cart], total: subtotal, ref });
    setCart([]);
    toast.success(`Sale completed: ${ref}`);
    scanRef.current?.focus();
  };

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Left: scan + items */}
      <div className="flex-1 flex flex-col p-4 gap-3 min-w-0">
        {/* Scan bar */}
        <div className="flex gap-2">
          <Input
            ref={scanRef}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
            placeholder="Scan item or type SKU..."
            className="h-16 text-xl font-mono"
            autoFocus
          />
          <Button onClick={handleScan} className="h-16 w-16 shrink-0" size="lg">
            <ScanBarcode className="h-7 w-7" />
          </Button>
        </div>

        {/* Cart */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {cart.length === 0 && !lastReceipt && (
            <div className="text-center py-20 text-muted-foreground">
              <ShoppingCart className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg font-semibold">Ready to scan</p>
              <p className="text-sm mt-1">Scan a barcode or type a SKU to begin</p>
            </div>
          )}

          {lastReceipt && (
            <Card className="border-green-300 bg-green-50 dark:bg-green-950/20">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Receipt className="h-6 w-6 text-green-600" />
                  <div>
                    <p className="font-bold text-lg">{formatCurrency(lastReceipt.total)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{lastReceipt.ref} — {lastReceipt.items.length} items</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setLastReceipt(null); scanRef.current?.focus(); }}>
                  <X className="h-4 w-4" /> Next
                </Button>
              </CardContent>
            </Card>
          )}

          {cart.map((item) => (
            <div key={item.product.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{item.product.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>
                {item.unitPrice < item.product.price && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-xs line-through text-muted-foreground">{formatCurrency(item.product.price)}</span>
                    <Badge className="bg-red-500 text-white text-[10px] px-1">SALE</Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => updateQty(item.product.id, -1)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-10 text-center text-lg font-bold">{item.quantity}</span>
                <Button variant="outline" size="sm" className="h-10 w-10 p-0" onClick={() => updateQty(item.product.id, 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-right w-24 shrink-0">
                <p className="text-lg font-bold">{formatCurrency(item.unitPrice * item.quantity)}</p>
                <p className="text-xs text-muted-foreground">@{formatCurrency(item.unitPrice)}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-10 w-10 p-0 text-destructive shrink-0" onClick={() => setCart((p) => p.filter((i) => i.product.id !== item.product.id))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Right: totals panel */}
      <div className="lg:w-80 border-l bg-muted/30 p-4 flex flex-col shrink-0">
        <div className="flex-1 flex flex-col justify-end space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Items</span>
              <span>{itemCount}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-3xl font-bold">
              <span>Total</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
          </div>

          <Button
            onClick={handleCheckout}
            disabled={processing || cart.length === 0}
            className="w-full h-20 text-xl font-bold"
            size="lg"
          >
            {processing ? 'Processing...' : (
              <><CreditCard className="h-6 w-6 mr-3" /> Complete Sale</>
            )}
          </Button>

          {cart.length > 0 && (
            <Button variant="outline" className="w-full h-12" onClick={() => setCart([])}>
              Void Transaction
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
