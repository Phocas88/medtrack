'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ScanBarcode,
  MapPin,
  Package,
  Image as ImageIcon,
  Grid3X3,
  Navigation,
  DollarSign,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '@/types/database';

interface ProductLocation {
  product: Product;
  bins: {
    bin_code: string;
    bin_type: string;
    zone: string | null;
    quantity: number;
  }[];
  totalStock: number;
  activeLots: number;
  nearestExpiry: string | null;
  activePromotion: { name: string; sale_price: number } | null;
}

export default function FindItemPage() {
  const { tenantId } = useAuth();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<ProductLocation | null>(null);
  const [notFound, setNotFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    const value = query.trim();
    if (!value || !tenantId) return;

    setSearching(true);
    setResult(null);
    setNotFound(false);

    const supabase = createClient();

    // Search by SKU, name, or UPC
    const { data: products } = await supabase
      .from('staff_products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .or(`sku.ilike.%${value}%,name.ilike.%${value}%`)
      .limit(1);

    if (!products || products.length === 0) {
      setNotFound(true);
      setSearching(false);
      toast.error('Product not found');
      return;
    }

    const product = products[0] as Product;

    // Get bin locations
    const { data: binInv } = await supabase
      .from('bin_inventory')
      .select('quantity, bin:bins(bin_code, bin_type, zone)')
      .eq('tenant_id', tenantId)
      .eq('product_id', product.id)
      .gt('quantity', 0);

    const bins = (binInv || []).map((bi: Record<string, unknown>) => {
      const bin = bi.bin as Record<string, string> | null;
      return {
        bin_code: bin?.bin_code || '?',
        bin_type: bin?.bin_type || 'pick',
        zone: bin?.zone || null,
        quantity: bi.quantity as number,
      };
    }).sort((a, b) => b.quantity - a.quantity);

    // Get lot info
    const { data: lots } = await supabase
      .from('staff_lots')
      .select('quantity_on_hand, expiration_date')
      .eq('tenant_id', tenantId)
      .eq('product_id', product.id)
      .eq('status', 'active')
      .gt('quantity_on_hand', 0);

    const totalStock = (lots || []).reduce((s, l) => s + l.quantity_on_hand, 0);
    const expiringLots = (lots || [])
      .filter((l) => l.expiration_date)
      .sort((a, b) => new Date(a.expiration_date!).getTime() - new Date(b.expiration_date!).getTime());

    // Check active promotions
    const now = new Date().toISOString();
    const { data: promos } = await supabase
      .from('promotions')
      .select('name, sale_price')
      .eq('tenant_id', tenantId)
      .eq('product_id', product.id)
      .eq('status', 'active')
      .lte('start_date', now)
      .gte('end_date', now)
      .limit(1);

    setResult({
      product,
      bins,
      totalStock,
      activeLots: (lots || []).length,
      nearestExpiry: expiringLots[0]?.expiration_date || null,
      activePromotion: promos && promos.length > 0 ? promos[0] : null,
    });
    setSearching(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="bg-slate-50 dark:bg-slate-900 px-3 py-2.5 border-b shrink-0">
        <p className="text-sm font-bold mb-1.5">Find Item</p>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Scan barcode or type SKU / name..."
            className="h-11 text-base font-mono"
            autoFocus
          />
          <Button onClick={handleSearch} disabled={searching} className="h-11 w-11 shrink-0" size="lg">
            <ScanBarcode className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* Result */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {searching && (
          <div className="text-center py-12 text-muted-foreground">Searching...</div>
        )}

        {notFound && !searching && (
          <div className="text-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold">Product not found</p>
            <p className="text-sm text-muted-foreground mt-1">Try a different SKU or name</p>
          </div>
        )}

        {result && (
          <>
            {/* Product card */}
            <Card>
              <CardContent className="p-4">
                <div className="flex gap-4">
                  {/* Product image */}
                  <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                    {result.product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={result.product.image_url}
                        alt={result.product.name}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-bold text-sm leading-tight">{result.product.name}</p>
                    <p className="text-sm text-muted-foreground font-mono">{result.product.sku}</p>
                    {result.product.category && (
                      <Badge variant="outline" className="text-xs">{result.product.category}</Badge>
                    )}
                    {result.activePromotion && (
                      <Badge className="bg-red-500 text-white text-xs">
                        ON SALE — ${result.activePromotion.sale_price.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Location header */}
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-500" />
              <p className="font-bold text-base">Where to find it</p>
            </div>

            {/* Store location (aisle/section) */}
            {(result.product.aisle || result.product.section) && (
              <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Navigation className="h-8 w-8 text-blue-500 shrink-0" />
                    <div>
                      {result.product.aisle && (
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                          Aisle {result.product.aisle}
                        </p>
                      )}
                      {result.product.section && (
                        <p className="text-sm text-blue-600 dark:text-blue-400">
                          Section {result.product.section}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Bin locations */}
            {result.bins.length > 0 ? (
              <div className="space-y-2">
                {result.bins.map((bin, idx) => (
                  <Card key={idx}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Grid3X3 className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-mono font-bold text-base">{bin.bin_code}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px]">{bin.bin_type}</Badge>
                            {bin.zone && <span className="text-xs text-muted-foreground">Zone: {bin.zone}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold">{bin.quantity}</p>
                        <p className="text-[10px] text-muted-foreground uppercase">qty</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-4 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="font-semibold text-sm">Not in any bin</p>
                    <p className="text-xs text-muted-foreground">Product has no active bin inventory</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stock summary */}
            <div className="grid grid-cols-3 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <Layers className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">{result.totalStock}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Total Stock</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <Package className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">{result.activeLots}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Active Lots</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3 text-center">
                  <DollarSign className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                  <p className="text-lg font-bold">${result.product.price.toFixed(2)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">Price</p>
                </CardContent>
              </Card>
            </div>

            {/* Expiry warning */}
            {result.nearestExpiry && (
              <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-3 flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Nearest expiry: {new Date(result.nearestExpiry).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {Math.ceil((new Date(result.nearestExpiry).getTime() - Date.now()) / 86400000)} days remaining
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!result && !notFound && !searching && (
          <div className="text-center py-12">
            <ScanBarcode className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <p className="font-semibold">Scan or search</p>
            <p className="text-sm text-muted-foreground mt-1">
              Scan a barcode or type a SKU to find where an item is located
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
