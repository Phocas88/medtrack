'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function POSPage() {
  const { user, tenantId } = useAuth();
  const [scanInput, setScanInput] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [processing, setProcessing] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<{ items: CartItem[]; total: number; ref: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scanRef.current?.focus();
  }, []);

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

    if (!data || data.length === 0) {
      toast.error('Product not found');
      return;
    }

    const product = data[0] as Product;

    // Check for active promotion
    const now = new Date().toISOString();
    const { data: promos } = await supabase
      .from('promotions')
      .select('sale_price')
      .eq('tenant_id', tenantId)
      .eq('product_id', product.id)
      .eq('status', 'active')
      .lte('start_date', now)
      .gte('end_date', now)
      .limit(1);

    const unitPrice = promos && promos.length > 0 ? promos[0].sale_price : product.price;

    setCart((prev) => {
      const existing = prev.findIndex((i) => i.product.id === product.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 };
        return updated;
      }
      return [...prev, { product, quantity: 1, unitPrice }];
    });

    toast.success(`${product.name} added`);
  }, [tenantId]);

  const handleScan = () => {
    const value = scanInput.trim();
    if (!value) return;
    setScanInput('');
    addToCart(value);
    scanRef.current?.focus();
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) => {
      return prev.map((item) => {
        if (item.product.id === productId) {
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null as unknown as CartItem;
          return { ...item, quantity: newQty };
        }
        return item;
      }).filter(Boolean);
    });
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const subtotal = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const itemCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  const handleCheckout = async () => {
    if (!tenantId || !user || cart.length === 0) return;
    setProcessing(true);
    const supabase = createClient();
    const refNum = `POS-${Date.now().toString(36).toUpperCase()}`;

    // Record stock movements for each item
    for (const item of cart) {
      await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        product_id: item.product.id,
        user_id: user.id,
        quantity: -item.quantity,
        movement_type: 'ship',
        reason: 'POS in-store sale',
        reference_number: refNum,
        metadata: {
          channel: 'in_store',
          unit_price: item.unitPrice,
          line_total: item.unitPrice * item.quantity,
        },
      });
    }

    setProcessing(false);
    setLastReceipt({ items: [...cart], total: subtotal, ref: refNum });
    setCart([]);
    toast.success(`Sale completed: ${refNum}`);
    scanRef.current?.focus();
  };

  const clearReceipt = () => {
    setLastReceipt(null);
    scanRef.current?.focus();
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Left: scan + product list */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <PageHeader title="Point of Sale" description="In-store transactions" />

        {/* Scan input */}
        <div className="flex gap-2">
          <Input
            ref={scanRef}
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
            placeholder="Scan barcode or type SKU..."
            className="h-14 text-lg font-mono"
            autoFocus
          />
          <Button onClick={handleScan} className="h-14 w-14 shrink-0" size="lg">
            <ScanBarcode className="h-6 w-6" />
          </Button>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {cart.length === 0 && !lastReceipt && (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3" />
              <p className="font-semibold">Cart is empty</p>
              <p className="text-sm mt-1">Scan a product to start</p>
            </div>
          )}

          {lastReceipt && (
            <Card className="border-green-300 bg-green-50 dark:bg-green-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Sale Complete</span>
                  <Button variant="ghost" size="sm" onClick={clearReceipt}><X className="h-4 w-4" /></Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm">{lastReceipt.ref}</p>
                <p className="text-lg font-bold mt-1">{formatCurrency(lastReceipt.total)}</p>
                <p className="text-xs text-muted-foreground">{lastReceipt.items.length} items</p>
              </CardContent>
            </Card>
          )}

          {cart.map((item) => (
            <Card key={item.product.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>
                  {item.unitPrice < item.product.price && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs line-through text-muted-foreground">{formatCurrency(item.product.price)}</span>
                      <Badge className="bg-red-500 text-white text-[10px] px-1">SALE</Badge>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => updateQty(item.product.id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center font-bold">{item.quantity}</span>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => updateQty(item.product.id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-right w-20 shrink-0">
                  <p className="font-bold">{formatCurrency(item.unitPrice * item.quantity)}</p>
                  <p className="text-xs text-muted-foreground">@{formatCurrency(item.unitPrice)}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => removeItem(item.product.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Right: totals + checkout */}
      <div className="lg:w-80 shrink-0">
        <Card className="sticky top-20">
          <CardHeader>
            <CardTitle className="text-base">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items</span>
              <span>{itemCount}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <Button
              onClick={handleCheckout}
              disabled={processing || cart.length === 0}
              className="w-full h-14 text-lg"
              size="lg"
            >
              {processing ? 'Processing...' : (
                <><CreditCard className="h-5 w-5 mr-2" /> Complete Sale</>
              )}
            </Button>
            {cart.length > 0 && (
              <Button variant="outline" className="w-full" onClick={() => setCart([])}>
                Clear Cart
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
