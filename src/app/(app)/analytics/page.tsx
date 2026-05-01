'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DollarSign,
  Package,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Truck,
  Download,
  Archive,
} from 'lucide-react';
import { formatCurrency, formatNumber, formatDate } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import type { Product, Supplier } from '@/types/database';

interface CategoryValue {
  category: string;
  value: number;
  itemCount: number;
}

interface LowStockItem {
  product: Product;
  currentStock: number;
  threshold: number;
}

interface TopMover {
  product: Product;
  totalMoved: number;
}

interface DeadStockItem {
  product: Product;
  currentStock: number;
  lastMovement: string | null;
}

interface SupplierPerf {
  supplier: Supplier;
  poCount: number;
  onTimeCount: number;
  onTimePct: number;
}

interface MarginItem {
  product: Product;
  margin: number;
  marginPct: number;
}

export default function AnalyticsPage() {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(true);

  // Stats
  const [totalValue, setTotalValue] = useState(0);
  const [totalSKUs, setTotalSKUs] = useState(0);
  const [avgTurnover, setAvgTurnover] = useState(0);
  const [deadStockCount, setDeadStockCount] = useState(0);

  // Sections
  const [categoryValues, setCategoryValues] = useState<CategoryValue[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [topMovers, setTopMovers] = useState<TopMover[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockItem[]>([]);
  const [supplierPerf, setSupplierPerf] = useState<SupplierPerf[]>([]);
  const [marginItems, setMarginItems] = useState<MarginItem[]>([]);

  const loadAnalytics = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    // Fetch all needed data in parallel
    const [prodRes, lotRes, movRes, poRes, suppRes] = await Promise.all([
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false),
      supabase.from('lots').select('*').eq('tenant_id', tenantId).eq('status', 'active'),
      supabase.from('stock_movements').select('*').eq('tenant_id', tenantId),
      supabase.from('purchase_orders').select('*').eq('tenant_id', tenantId),
      supabase.from('suppliers').select('*').eq('tenant_id', tenantId).eq('is_archived', false),
    ]);

    const products = prodRes.data || [];
    const lots = lotRes.data || [];
    const movements = movRes.data || [];
    const pos = poRes.data || [];
    const suppliers = suppRes.data || [];

    const productMap = new Map(products.map((p) => [p.id, p]));
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

    // ── Stock by product ──
    const stockByProduct = new Map<string, number>();
    lots.forEach((l) => {
      stockByProduct.set(l.product_id, (stockByProduct.get(l.product_id) || 0) + l.quantity_on_hand);
    });

    // ── Total inventory value ──
    let invValue = 0;
    lots.forEach((l) => {
      invValue += l.quantity_on_hand * l.cost_at_receipt;
    });
    setTotalValue(invValue);
    setTotalSKUs(products.length);

    // ── Inventory value by category ──
    const catMap = new Map<string, { value: number; count: number }>();
    lots.forEach((l) => {
      const prod = productMap.get(l.product_id);
      const cat = prod?.category || 'Uncategorized';
      const existing = catMap.get(cat) || { value: 0, count: 0 };
      existing.value += l.quantity_on_hand * l.cost_at_receipt;
      existing.count++;
      catMap.set(cat, existing);
    });
    const catValues: CategoryValue[] = Array.from(catMap.entries())
      .map(([category, { value, count }]) => ({ category, value, itemCount: count }))
      .sort((a, b) => b.value - a.value);
    setCategoryValues(catValues);

    // ── Low stock alerts ──
    const lowStock: LowStockItem[] = [];
    products.forEach((p) => {
      const stock = stockByProduct.get(p.id) || 0;
      if (stock <= p.low_stock_threshold) {
        lowStock.push({ product: p, currentStock: stock, threshold: p.low_stock_threshold });
      }
    });
    lowStock.sort((a, b) => a.currentStock - b.currentStock);
    setLowStockItems(lowStock);

    // ── Top 10 by movement volume (shipped) ──
    const shipVolume = new Map<string, number>();
    movements
      .filter((m) => m.movement_type === 'ship')
      .forEach((m) => {
        shipVolume.set(m.product_id, (shipVolume.get(m.product_id) || 0) + Math.abs(m.quantity));
      });
    const movers: TopMover[] = Array.from(shipVolume.entries())
      .map(([pid, total]) => ({ product: productMap.get(pid)!, totalMoved: total }))
      .filter((m) => m.product)
      .sort((a, b) => b.totalMoved - a.totalMoved)
      .slice(0, 10);
    setTopMovers(movers);

    // ── Dead stock (no outbound in 90 days) ──
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentOutbound = new Map<string, string>();
    movements
      .filter((m) => m.movement_type === 'ship')
      .forEach((m) => {
        const existing = recentOutbound.get(m.product_id);
        if (!existing || m.created_at > existing) {
          recentOutbound.set(m.product_id, m.created_at);
        }
      });

    const dead: DeadStockItem[] = [];
    products.forEach((p) => {
      const stock = stockByProduct.get(p.id) || 0;
      if (stock <= 0) return;
      const lastMove = recentOutbound.get(p.id);
      if (!lastMove || new Date(lastMove) < ninetyDaysAgo) {
        dead.push({ product: p, currentStock: stock, lastMovement: lastMove || null });
      }
    });
    dead.sort((a, b) => b.currentStock - a.currentStock);
    setDeadStock(dead);
    setDeadStockCount(dead.length);

    // ── Average turnover ──
    // Turnover = total shipped / average inventory (simplified)
    const avgInv = invValue > 0 ? invValue : 1;
    const totalCostShipped = movements
      .filter((m) => m.movement_type === 'ship')
      .reduce((sum, m) => {
        const prod = productMap.get(m.product_id);
        return sum + Math.abs(m.quantity) * (prod?.cost || 0);
      }, 0);
    setAvgTurnover(avgInv > 0 ? parseFloat((totalCostShipped / avgInv).toFixed(1)) : 0);

    // ── Supplier performance ──
    const perfMap = new Map<string, { total: number; onTime: number }>();
    pos
      .filter((po) => po.status === 'received')
      .forEach((po) => {
        const existing = perfMap.get(po.supplier_id) || { total: 0, onTime: 0 };
        existing.total++;
        if (po.expected_date && po.updated_at) {
          const expected = new Date(po.expected_date);
          const actual = new Date(po.updated_at);
          if (actual <= expected) existing.onTime++;
        } else {
          // If no expected date, count as on-time
          existing.onTime++;
        }
        perfMap.set(po.supplier_id, existing);
      });

    const perfItems: SupplierPerf[] = Array.from(perfMap.entries())
      .map(([sid, { total, onTime }]) => ({
        supplier: supplierMap.get(sid)!,
        poCount: total,
        onTimeCount: onTime,
        onTimePct: total > 0 ? Math.round((onTime / total) * 100) : 0,
      }))
      .filter((p) => p.supplier)
      .sort((a, b) => b.poCount - a.poCount);
    setSupplierPerf(perfItems);

    // ── Margin analysis ──
    const margins: MarginItem[] = products
      .filter((p) => p.price > 0)
      .map((p) => {
        const margin = p.price - p.cost;
        const marginPct = (margin / p.price) * 100;
        return { product: p, margin, marginPct };
      })
      .sort((a, b) => b.marginPct - a.marginPct)
      .slice(0, 15);
    setMarginItems(margins);

    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Analytics" />
        <div className="text-muted-foreground">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Analytics"
        description="Inventory insights, performance metrics, and business intelligence"
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Inventory Value"
          value={formatCurrency(totalValue)}
          icon={DollarSign}
        />
        <StatCard
          title="Total SKUs"
          value={formatNumber(totalSKUs)}
          icon={Package}
        />
        <StatCard
          title="Inventory Turnover"
          value={`${avgTurnover}x`}
          icon={TrendingUp}
          description="Cost of shipped / avg inventory"
        />
        <StatCard
          title="Dead Stock"
          value={deadStockCount}
          icon={Archive}
          description="No movement in 90 days"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Value by Category */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Value by Category
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                exportToCSV(
                  categoryValues.map((c) => ({
                    Category: c.category,
                    Value: c.value,
                    Items: c.itemCount,
                  })),
                  'value_by_category'
                )
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {categoryValues.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inventory data.</p>
            ) : (
              <div className="space-y-3">
                {categoryValues.map((cat) => {
                  const pct = totalValue > 0 ? (cat.value / totalValue) * 100 : 0;
                  return (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{cat.category}</span>
                        <span className="text-muted-foreground">
                          {formatCurrency(cat.value)} ({pct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Low Stock Alerts ({lowStockItems.length})
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                exportToCSV(
                  lowStockItems.map((i) => ({
                    Product: i.product.name,
                    SKU: i.product.sku,
                    'Current Stock': i.currentStock,
                    Threshold: i.threshold,
                  })),
                  'low_stock_alerts'
                )
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products adequately stocked.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.slice(0, 10).map((item) => (
                    <TableRow key={item.product.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{item.product.name}</div>
                          <div className="text-xs text-muted-foreground">{item.product.sku}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={item.currentStock === 0 ? 'text-destructive font-bold' : 'text-amber-600 font-medium'}>
                          {formatNumber(item.currentStock)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatNumber(item.threshold)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {lowStockItems.length > 10 && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{lowStockItems.length - 10} more items
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top 10 Products by Movement */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Top 10 by Shipment Volume
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                exportToCSV(
                  topMovers.map((m) => ({
                    Product: m.product.name,
                    SKU: m.product.sku,
                    'Total Shipped': m.totalMoved,
                  })),
                  'top_movers'
                )
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {topMovers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No shipment data yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Shipped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topMovers.map((mover, idx) => (
                    <TableRow key={mover.product.id}>
                      <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{mover.product.name}</div>
                          <div className="text-xs text-muted-foreground">{mover.product.sku}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatNumber(mover.totalMoved)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Dead Stock */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-gray-500" />
              Dead Stock ({deadStock.length})
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                exportToCSV(
                  deadStock.map((d) => ({
                    Product: d.product.name,
                    SKU: d.product.sku,
                    'On Hand': d.currentStock,
                    'Last Movement': d.lastMovement || 'Never',
                  })),
                  'dead_stock'
                )
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {deadStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">No dead stock detected.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Last Shipped</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadStock.slice(0, 10).map((item) => (
                    <TableRow key={item.product.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{item.product.name}</div>
                          <div className="text-xs text-muted-foreground">{item.product.sku}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(item.currentStock)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {item.lastMovement ? formatDate(item.lastMovement) : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {deadStock.length > 10 && (
              <p className="mt-2 text-xs text-muted-foreground">
                +{deadStock.length - 10} more items
              </p>
            )}
          </CardContent>
        </Card>

        {/* Supplier Performance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-blue-500" />
              Supplier Performance
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                exportToCSV(
                  supplierPerf.map((s) => ({
                    Supplier: s.supplier.name,
                    'Total POs': s.poCount,
                    'On-Time': s.onTimeCount,
                    'On-Time %': `${s.onTimePct}%`,
                  })),
                  'supplier_performance'
                )
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {supplierPerf.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed POs to analyze.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">POs</TableHead>
                    <TableHead className="text-right">On-Time %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierPerf.map((sp) => (
                    <TableRow key={sp.supplier.id}>
                      <TableCell className="font-medium text-sm">{sp.supplier.name}</TableCell>
                      <TableCell className="text-right">{sp.poCount}</TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            sp.onTimePct >= 90
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : sp.onTimePct >= 70
                              ? 'bg-amber-100 text-amber-800 border-amber-200'
                              : 'bg-red-100 text-red-800 border-red-200'
                          }
                        >
                          {sp.onTimePct}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Margin Analysis */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              Margin Analysis (Top 15)
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                exportToCSV(
                  marginItems.map((m) => ({
                    Product: m.product.name,
                    SKU: m.product.sku,
                    Cost: m.product.cost,
                    Price: m.product.price,
                    Margin: m.margin,
                    'Margin %': `${m.marginPct.toFixed(1)}%`,
                  })),
                  'margin_analysis'
                )
              }
            >
              <Download className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {marginItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pricing data available.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marginItems.map((item) => (
                    <TableRow key={item.product.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm">{item.product.name}</div>
                          <div className="text-xs text-muted-foreground">{item.product.sku}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(item.product.cost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.product.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            item.marginPct >= 50
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : item.marginPct >= 20
                              ? 'bg-blue-100 text-blue-800 border-blue-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                          }
                        >
                          {item.marginPct.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
