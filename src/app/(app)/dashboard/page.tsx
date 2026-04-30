'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExpiryBadge } from '@/components/ui/expiry-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package,
  DollarSign,
  AlertTriangle,
  Clock,
  PackagePlus,
  Truck,
  Search,
  Activity,
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeDate, movementTypeLabel, daysUntilExpiry } from '@/lib/format';
import type { StockMovement } from '@/types/database';

interface DashboardData {
  totalProducts: number;
  totalValue: number;
  lowStockCount: number;
  expiringCount: number;
  recentMovements: StockMovement[];
  expiringLots: { lot_number: string; product_name: string; expiration_date: string; quantity: number; days: number }[];
}

export default function DashboardPage() {
  const { tenantId } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    async function loadDashboard() {
      const supabase = createClient();

      const { count: productCount } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId!)
        .eq('is_archived', false);

      const { data: lots } = await supabase
        .from('lots')
        .select('product_id, quantity_on_hand, expiration_date, lot_number, cost_at_receipt, status, product:products(name, low_stock_threshold)')
        .eq('tenant_id', tenantId!)
        .eq('status', 'active');

      let totalValue = 0;
      const productStock: Record<string, { total: number; threshold: number }> = {};

      (lots || []).forEach((l) => {
        totalValue += l.quantity_on_hand * l.cost_at_receipt;
        const p = l.product as unknown as { name: string; low_stock_threshold: number };
        if (!productStock[l.product_id]) {
          productStock[l.product_id] = { total: 0, threshold: p?.low_stock_threshold || 10 };
        }
        productStock[l.product_id].total += l.quantity_on_hand;
      });

      const lowStockCount = Object.values(productStock).filter((s) => s.total <= s.threshold).length;

      const expiring = (lots || [])
        .filter((l) => l.expiration_date && l.quantity_on_hand > 0)
        .map((l) => {
          const days = daysUntilExpiry(l.expiration_date);
          const p = l.product as unknown as { name: string };
          return {
            lot_number: l.lot_number,
            product_name: p?.name || '',
            expiration_date: l.expiration_date!,
            quantity: l.quantity_on_hand,
            days: days ?? 999,
          };
        })
        .filter((l) => l.days <= 90)
        .sort((a, b) => a.days - b.days)
        .slice(0, 10);

      const { data: movements } = await supabase
        .from('stock_movements')
        .select('*, product:products(name, sku), user:users(full_name)')
        .eq('tenant_id', tenantId!)
        .order('created_at', { ascending: false })
        .limit(10);

      setData({
        totalProducts: productCount || 0,
        totalValue,
        lowStockCount,
        expiringCount: expiring.length,
        recentMovements: (movements as unknown as StockMovement[]) || [],
        expiringLots: expiring,
      });
      setLoading(false);
    }

    loadDashboard();
  }, [tenantId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}><CardContent className="p-6 h-24 animate-pulse bg-muted/50" /></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Products" value={data?.totalProducts || 0} icon={Package} />
        <StatCard title="Inventory Value" value={formatCurrency(data?.totalValue || 0)} icon={DollarSign} />
        <StatCard
          title="Low Stock Items"
          value={data?.lowStockCount || 0}
          icon={AlertTriangle}
          className={data?.lowStockCount ? 'border-amber-500/50' : ''}
        />
        <StatCard
          title="Expiring Soon"
          value={data?.expiringCount || 0}
          icon={Clock}
          description="Within 90 days"
          className={data?.expiringCount ? 'border-red-500/50' : ''}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => router.push('/receive')}>
          <PackagePlus className="h-4 w-4 mr-2" /> Receive Inventory
        </Button>
        <Button variant="outline" onClick={() => router.push('/ship')}>
          <Truck className="h-4 w-4 mr-2" /> Ship Order
        </Button>
        <Button variant="outline" onClick={() => router.push('/recall')}>
          <Search className="h-4 w-4 mr-2" /> Recall Lookup
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> Expiring Soon
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.expiringLots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No lots expiring within 90 days.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Expiry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.expiringLots.map((lot, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{lot.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{lot.lot_number}</TableCell>
                      <TableCell>{lot.quantity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{formatDate(lot.expiration_date)}</span>
                          <ExpiryBadge date={lot.expiration_date} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentMovements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <div className="space-y-3">
                {data?.recentMovements.map((m) => {
                  const product = m.product as unknown as { name: string } | null;
                  return (
                    <div key={m.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {movementTypeLabel(m.movement_type)}
                        </Badge>
                        <span>{product?.name}</span>
                        <span className={m.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeDate(m.created_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
