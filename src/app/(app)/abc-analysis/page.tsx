'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
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
  BarChart3,
  Download,
  ClipboardCheck,
  Loader2,
  Package,
  DollarSign,
  Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatNumber } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  cost: number;
}

interface MovementRow {
  product_id: string;
  quantity: number;
}

interface StockRow {
  product_id: string;
  quantity_on_hand: number;
}

interface ClassifiedProduct {
  productId: string;
  name: string;
  sku: string;
  annualQty: number;
  unitCost: number;
  annualValue: number;
  cumulativePct: number;
  abcClass: 'A' | 'B' | 'C';
  currentStock: number;
  daysOfSupply: number;
}

interface ClassSummary {
  cls: 'A' | 'B' | 'C';
  itemCount: number;
  pctItems: number;
  totalValue: number;
  pctValue: number;
}

interface ActionItem {
  productId: string;
  name: string;
  sku: string;
  abcClass: 'A' | 'B' | 'C';
  recommendation: string;
  currentStock: number;
  daysOfSupply: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function abcBadge(cls: 'A' | 'B' | 'C') {
  if (cls === 'A') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">A</Badge>;
  if (cls === 'B') return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">B</Badge>;
  return <Badge variant="secondary">C</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ABCAnalysisPage() {
  const { user, tenantId } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [stockData, setStockData] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const [prodRes, movRes, stockRes] = await Promise.all([
        supabase.from('products').select('id, name, sku, cost').eq('tenant_id', tenantId).eq('is_archived', false),
        supabase.from('stock_movements').select('product_id, quantity').eq('tenant_id', tenantId).eq('movement_type', 'ship').gte('created_at', oneYearAgo.toISOString()),
        supabase.from('lots').select('product_id, quantity_on_hand').eq('tenant_id', tenantId).eq('status', 'active'),
      ]);

      if (prodRes.error) throw prodRes.error;
      if (movRes.error) throw movRes.error;
      if (stockRes.error) throw stockRes.error;

      setProducts(prodRes.data || []);
      setMovements(movRes.data || []);
      setStockData(stockRes.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load analysis data');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Stock by product ──
  const stockByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    stockData.forEach((s) => {
      m[s.product_id] = (m[s.product_id] || 0) + s.quantity_on_hand;
    });
    return m;
  }, [stockData]);

  // ── Annual shipped qty by product ──
  const annualQtyByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    movements.forEach((mv) => {
      m[mv.product_id] = (m[mv.product_id] || 0) + Math.abs(mv.quantity);
    });
    return m;
  }, [movements]);

  // ── Classification ──
  const classified = useMemo((): ClassifiedProduct[] => {
    const items = products.map((p) => {
      const annualQty = annualQtyByProduct[p.id] || 0;
      const annualValue = annualQty * p.cost;
      const currentStock = stockByProduct[p.id] || 0;
      const dailyUsage = annualQty / 365;
      const daysOfSupply = dailyUsage > 0 ? Math.round(currentStock / dailyUsage) : currentStock > 0 ? 999 : 0;
      return {
        productId: p.id,
        name: p.name,
        sku: p.sku,
        annualQty,
        unitCost: p.cost,
        annualValue,
        cumulativePct: 0,
        abcClass: 'C' as 'A' | 'B' | 'C',
        currentStock,
        daysOfSupply,
      };
    }).sort((a, b) => b.annualValue - a.annualValue);

    const totalValue = items.reduce((s, i) => s + i.annualValue, 0);
    let cumulative = 0;

    items.forEach((item) => {
      cumulative += item.annualValue;
      item.cumulativePct = totalValue > 0 ? (cumulative / totalValue) * 100 : 100;
      if (item.cumulativePct <= 80) item.abcClass = 'A';
      else if (item.cumulativePct <= 95) item.abcClass = 'B';
      else item.abcClass = 'C';
    });

    return items;
  }, [products, annualQtyByProduct, stockByProduct]);

  // ── Summary stats ──
  const totalInventoryValue = useMemo(() => classified.reduce((s, c) => s + c.annualValue, 0), [classified]);

  const classSummary = useMemo((): ClassSummary[] => {
    const classes: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
    const totalItems = classified.length;
    return classes.map((cls) => {
      const items = classified.filter((c) => c.abcClass === cls);
      const value = items.reduce((s, c) => s + c.annualValue, 0);
      return {
        cls,
        itemCount: items.length,
        pctItems: totalItems > 0 ? (items.length / totalItems) * 100 : 0,
        totalValue: value,
        pctValue: totalInventoryValue > 0 ? (value / totalInventoryValue) * 100 : 0,
      };
    });
  }, [classified, totalInventoryValue]);

  const aCount = classSummary.find((s) => s.cls === 'A')?.itemCount || 0;
  const bCount = classSummary.find((s) => s.cls === 'B')?.itemCount || 0;
  const cCount = classSummary.find((s) => s.cls === 'C')?.itemCount || 0;

  // ── Action Items ──
  const actionItems = useMemo((): ActionItem[] => {
    return classified.map((c) => {
      let recommendation = '';
      if (c.abcClass === 'A') {
        if (c.daysOfSupply < 14) recommendation = 'Critical: Low stock on high-value item. Reorder immediately. Consider multiple suppliers.';
        else if (c.daysOfSupply < 30) recommendation = 'Schedule frequent cycle counts. Set up low-stock alerts. Review reorder points.';
        else recommendation = 'Maintain tight inventory control. Frequent cycle counts recommended. Ensure multiple supplier options.';
      } else if (c.abcClass === 'B') {
        if (c.daysOfSupply < 7) recommendation = 'Low stock. Review and adjust reorder points.';
        else recommendation = 'Quarterly review recommended. Standard reorder points adequate.';
      } else {
        if (c.daysOfSupply > 180) recommendation = 'Excess stock. Consider reducing inventory levels or discontinuing.';
        else if (c.annualQty === 0) recommendation = 'No movement in 12 months. Evaluate for discontinuation.';
        else recommendation = 'Reduce stock levels. Minimal monitoring needed.';
      }
      return {
        productId: c.productId,
        name: c.name,
        sku: c.sku,
        abcClass: c.abcClass,
        recommendation,
        currentStock: c.currentStock,
        daysOfSupply: c.daysOfSupply,
      };
    });
  }, [classified]);

  // ── Generate cycle count for A items ──
  const generateCycleCount = async () => {
    if (!tenantId || !user) return;
    const aItems = classified.filter((c) => c.abcClass === 'A');
    if (aItems.length === 0) { toast.info('No A-class items to count'); return; }

    setGenerating(true);
    try {
      const supabase = createClient();
      const countNumber = `CC-ABC-${new Date().toISOString().split('T')[0].replace(/-/g, '')}`;

      const { data: cc, error: ccErr } = await supabase
        .from('cycle_counts')
        .insert({
          tenant_id: tenantId,
          count_number: countNumber,
          status: 'planned',
          count_type: 'abc_a_class',
          is_blind: false,
          planned_date: new Date().toISOString().split('T')[0],
          created_by: user.id,
          notes: 'Auto-generated cycle count for ABC A-class products',
        })
        .select('id')
        .single();

      if (ccErr) throw ccErr;

      const lines = aItems.map((item) => ({
        tenant_id: tenantId,
        count_id: cc.id,
        product_id: item.productId,
        system_quantity: item.currentStock,
        location: null,
        notes: `A-class item: ${formatCurrency(item.annualValue)} annual value`,
      }));

      const { error: lineErr } = await supabase.from('cycle_count_lines').insert(lines);
      if (lineErr) throw lineErr;

      toast.success(`Created cycle count ${countNumber} with ${aItems.length} A-class products`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate cycle count');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="ABC Analysis"
        description="Classify inventory by annual usage value for optimal management"
      />

      <Tabs defaultValue="classification" className="space-y-6">
        <TabsList>
          <TabsTrigger value="classification">Classification</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="actions">Action Items</TabsTrigger>
        </TabsList>

        {/* ── Classification Tab ── */}
        <TabsContent value="classification" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>ABC Classification</CardTitle>
                  <CardDescription>
                    Products classified by annual usage value. Total inventory value: {formatCurrency(totalInventoryValue)}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    exportToCSV(
                      classified.map((c) => ({
                        product: c.name,
                        sku: c.sku,
                        annual_qty: c.annualQty,
                        unit_cost: c.unitCost,
                        annual_value: c.annualValue,
                        cumulative_pct: c.cumulativePct.toFixed(1),
                        class: c.abcClass,
                      })),
                      'abc_classification'
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {classified.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No product data available.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Annual Qty</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Annual Value</TableHead>
                      <TableHead className="text-right">Cumulative %</TableHead>
                      <TableHead>Class</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classified.map((c) => (
                      <TableRow key={c.productId}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-muted-foreground">{c.sku}</TableCell>
                        <TableCell className="text-right">{formatNumber(c.annualQty)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(c.unitCost)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(c.annualValue)}</TableCell>
                        <TableCell className="text-right">{c.cumulativePct.toFixed(1)}%</TableCell>
                        <TableCell>{abcBadge(c.abcClass)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Summary Tab ── */}
        <TabsContent value="summary" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard title="A Items" value={aCount} icon={Package} description="Top 80% of value" />
            <StatCard title="B Items" value={bCount} icon={Layers} description="Next 15% of value" />
            <StatCard title="C Items" value={cCount} icon={BarChart3} description="Bottom 5% of value" />
            <StatCard title="Total Inventory Value" value={formatCurrency(totalInventoryValue)} icon={DollarSign} description="Annual usage value" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Class Breakdown</CardTitle>
              <CardDescription>The classic 80/20 Pareto analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Class</TableHead>
                    <TableHead className="text-right">Item Count</TableHead>
                    <TableHead className="text-right">% of Items</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">% of Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classSummary.map((s) => (
                    <TableRow key={s.cls}>
                      <TableCell>{abcBadge(s.cls)}</TableCell>
                      <TableCell className="text-right font-medium">{s.itemCount}</TableCell>
                      <TableCell className="text-right">{s.pctItems.toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(s.totalValue)}</TableCell>
                      <TableCell className="text-right">{s.pctValue.toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right">{classified.length}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                    <TableCell className="text-right">{formatCurrency(totalInventoryValue)}</TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Action Items Tab ── */}
        <TabsContent value="actions" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Action Items</CardTitle>
                  <CardDescription>Recommended actions based on ABC classification</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      exportToCSV(
                        actionItems.map((a) => ({
                          product: a.name,
                          sku: a.sku,
                          class: a.abcClass,
                          recommendation: a.recommendation,
                          current_stock: a.currentStock,
                          days_of_supply: a.daysOfSupply,
                        })),
                        'abc_action_items'
                      )
                    }
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button onClick={generateCycleCount} disabled={generating}>
                    {generating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                    )}
                    Generate Cycle Count for A Items
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {actionItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No action items.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Recommendation</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                      <TableHead className="text-right">Days of Supply</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actionItems.map((a) => (
                      <TableRow key={a.productId}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell className="text-muted-foreground">{a.sku}</TableCell>
                        <TableCell>{abcBadge(a.abcClass)}</TableCell>
                        <TableCell className="max-w-[300px] text-sm">{a.recommendation}</TableCell>
                        <TableCell className="text-right">{formatNumber(a.currentStock)}</TableCell>
                        <TableCell className="text-right">
                          {a.daysOfSupply >= 999 ? (
                            <Badge variant="secondary">No usage</Badge>
                          ) : a.daysOfSupply < 14 && a.abcClass === 'A' ? (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">{a.daysOfSupply}d</Badge>
                          ) : (
                            `${a.daysOfSupply}d`
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
