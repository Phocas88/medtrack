'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
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
  Download,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatNumber } from '@/lib/format';
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

interface BinRow {
  id: string;
  bin_code: string;
  bin_type: string;
  location_id: string;
  is_active: boolean;
  zone_id: string | null;
}

interface AssignmentRow {
  id: string;
  product_id: string;
  bin_id: string;
  is_active: boolean;
}

interface MovementRow {
  product_id: string;
  quantity: number;
  created_at: string;
}

interface SlottingRow {
  productId: string;
  productName: string;
  sku: string;
  currentBinId: string | null;
  currentBinCode: string;
  zone: string;
  picks30d: number;
  distanceScore: number;
  assignmentId: string | null;
  isBadSlotting: boolean;
}

interface Recommendation {
  productId: string;
  productName: string;
  sku: string;
  currentBinId: string | null;
  currentBinCode: string;
  suggestedBinId: string;
  suggestedBinCode: string;
  abcClass: 'A' | 'B' | 'C';
  reason: string;
  estimatedSavings: string;
  assignmentId: string | null;
}

interface VelocityRow {
  productId: string;
  productName: string;
  sku: string;
  picks30d: number;
  picks90d: number;
  trend: 'up' | 'down' | 'flat';
  currentBinCode: string;
  optimalZone: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function distanceScore(binCode: string): number {
  // Extract numeric portion from bin code; lower = closer to shipping
  const nums = binCode.replace(/[^0-9]/g, '');
  return nums ? parseInt(nums, 10) : 999;
}

function classifyABC(products: { id: string; picks: number }[]): Record<string, 'A' | 'B' | 'C'> {
  const sorted = [...products].sort((a, b) => b.picks - a.picks);
  const total = sorted.reduce((s, p) => s + p.picks, 0);
  const result: Record<string, 'A' | 'B' | 'C'> = {};
  let cumulative = 0;

  sorted.forEach((p) => {
    cumulative += p.picks;
    const pct = total > 0 ? cumulative / total : 1;
    if (pct <= 0.8) result[p.id] = 'A';
    else if (pct <= 0.95) result[p.id] = 'B';
    else result[p.id] = 'C';
  });

  // Ensure products with 0 picks are C
  sorted.forEach((p) => {
    if (!result[p.id]) result[p.id] = 'C';
  });

  return result;
}

function abcBadge(cls: 'A' | 'B' | 'C') {
  if (cls === 'A') return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">A</Badge>;
  if (cls === 'B') return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">B</Badge>;
  return <Badge variant="secondary">C</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SlottingPage() {
  const { tenantId } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [bins, setBins] = useState<BinRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [movements30, setMovements30] = useState<MovementRow[]>([]);
  const [movements90, setMovements90] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const now = new Date();
      const d30 = new Date(now);
      d30.setDate(d30.getDate() - 30);
      const d90 = new Date(now);
      d90.setDate(d90.getDate() - 90);

      const [prodRes, binRes, assignRes, mov30Res, mov90Res] = await Promise.all([
        supabase.from('products').select('id, name, sku, cost').eq('tenant_id', tenantId).eq('is_archived', false),
        supabase.from('bins').select('id, bin_code, bin_type, location_id, is_active, zone_id').eq('tenant_id', tenantId).eq('is_active', true),
        supabase.from('product_bin_assignments').select('id, product_id, bin_id, is_active').eq('tenant_id', tenantId).eq('is_active', true),
        supabase.from('stock_movements').select('product_id, quantity, created_at').eq('tenant_id', tenantId).eq('movement_type', 'ship').gte('created_at', d30.toISOString()),
        supabase.from('stock_movements').select('product_id, quantity, created_at').eq('tenant_id', tenantId).eq('movement_type', 'ship').gte('created_at', d90.toISOString()),
      ]);

      if (prodRes.error) throw prodRes.error;
      if (binRes.error) throw binRes.error;
      if (assignRes.error) throw assignRes.error;
      if (mov30Res.error) throw mov30Res.error;
      if (mov90Res.error) throw mov90Res.error;

      setProducts(prodRes.data || []);
      setBins(binRes.data || []);
      setAssignments(assignRes.data || []);
      setMovements30(mov30Res.data || []);
      setMovements90(mov90Res.data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load slotting data');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Derived maps ──
  const productMap = useMemo(() => {
    const m: Record<string, ProductRow> = {};
    products.forEach((p) => { m[p.id] = p; });
    return m;
  }, [products]);

  const binMap = useMemo(() => {
    const m: Record<string, BinRow> = {};
    bins.forEach((b) => { m[b.id] = b; });
    return m;
  }, [bins]);

  // Picks per product in last 30 days
  const picks30 = useMemo(() => {
    const m: Record<string, number> = {};
    movements30.forEach((mv) => {
      m[mv.product_id] = (m[mv.product_id] || 0) + Math.abs(mv.quantity);
    });
    return m;
  }, [movements30]);

  const picks90 = useMemo(() => {
    const m: Record<string, number> = {};
    movements90.forEach((mv) => {
      m[mv.product_id] = (m[mv.product_id] || 0) + Math.abs(mv.quantity);
    });
    return m;
  }, [movements90]);

  // Assignment map: product_id -> assignment
  const assignmentMap = useMemo(() => {
    const m: Record<string, AssignmentRow> = {};
    assignments.forEach((a) => { m[a.product_id] = a; });
    return m;
  }, [assignments]);

  // ABC classification based on 30-day picks
  const abcMap = useMemo(() => {
    const items = products.map((p) => ({ id: p.id, picks: picks30[p.id] || 0 }));
    return classifyABC(items);
  }, [products, picks30]);

  // Sort bins by distance score
  const sortedBins = useMemo(() => [...bins].sort((a, b) => distanceScore(a.bin_code) - distanceScore(b.bin_code)), [bins]);

  // ── Current Slotting data ──
  const slottingRows = useMemo(() => {
    const rows: SlottingRow[] = assignments
      .map((a) => {
        const product = productMap[a.product_id];
        const bin = binMap[a.bin_id];
        if (!product || !bin) return null;
        const pickCount = picks30[a.product_id] || 0;
        const ds = distanceScore(bin.bin_code);
        const cls = abcMap[a.product_id] || 'C';
        // Bad slotting: A item in far bin (distance score > median)
        const isBadSlotting = cls === 'A' && ds > 50;
        return {
          productId: a.product_id,
          productName: product.name,
          sku: product.sku,
          currentBinId: a.bin_id,
          currentBinCode: bin.bin_code,
          zone: bin.bin_type,
          picks30d: pickCount,
          distanceScore: ds,
          assignmentId: a.id,
          isBadSlotting,
        };
      })
      .filter((r) => r !== null) as SlottingRow[];
    return rows.sort((a, b) => b.picks30d - a.picks30d);
  }, [assignments, productMap, binMap, picks30, abcMap]);

  // ── Recommendations ──
  const recommendations = useMemo((): Recommendation[] => {
    // Sort products by pick velocity
    const sorted = [...products]
      .map((p) => ({ ...p, picks: picks30[p.id] || 0, cls: abcMap[p.id] || 'C' as const }))
      .sort((a, b) => b.picks - a.picks);

    const recs: Recommendation[] = [];

    // Assign A items to closest available bins, C items to furthest
    const usedBins = new Set(assignments.map((a) => a.bin_id));
    const closestBins = sortedBins.filter((b) => !usedBins.has(b.id));
    const furthestBins = [...closestBins].reverse();

    let closeIdx = 0;
    let farIdx = 0;

    sorted.forEach((p) => {
      const currentAssignment = assignmentMap[p.id];
      const currentBin = currentAssignment ? binMap[currentAssignment.bin_id] : null;
      const currentDs = currentBin ? distanceScore(currentBin.bin_code) : 999;

      if (p.cls === 'A' && currentDs > 30 && closeIdx < closestBins.length) {
        const suggested = closestBins[closeIdx];
        const newDs = distanceScore(suggested.bin_code);
        if (newDs < currentDs) {
          recs.push({
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            currentBinId: currentAssignment?.bin_id || null,
            currentBinCode: currentBin?.bin_code || 'Unassigned',
            suggestedBinId: suggested.id,
            suggestedBinCode: suggested.bin_code,
            abcClass: 'A',
            reason: 'High-velocity item should be closer to shipping dock',
            estimatedSavings: `${Math.round((currentDs - newDs) * 0.5)}% fewer steps`,
            assignmentId: currentAssignment?.id || null,
          });
          closeIdx++;
        }
      } else if (p.cls === 'C' && currentDs < 20 && farIdx < furthestBins.length) {
        const suggested = furthestBins[farIdx];
        const newDs = distanceScore(suggested.bin_code);
        if (newDs > currentDs) {
          recs.push({
            productId: p.id,
            productName: p.name,
            sku: p.sku,
            currentBinId: currentAssignment?.bin_id || null,
            currentBinCode: currentBin?.bin_code || 'Unassigned',
            suggestedBinId: suggested.id,
            suggestedBinCode: suggested.bin_code,
            abcClass: 'C',
            reason: 'Low-velocity item can be moved further from shipping',
            estimatedSavings: 'Frees prime bin space for fast movers',
            assignmentId: currentAssignment?.id || null,
          });
          farIdx++;
        }
      }
    });

    return recs;
  }, [products, picks30, abcMap, assignments, assignmentMap, binMap, sortedBins]);

  // ── Velocity Analysis ──
  const velocityRows = useMemo((): VelocityRow[] => {
    return products
      .map((p) => {
        const p30 = picks30[p.id] || 0;
        const p90 = picks90[p.id] || 0;
        const p60to90 = p90 - p30; // approximate 30-60 day window from rest of 90
        const avgOlder = p60to90 / 2;
        let trend: 'up' | 'down' | 'flat' = 'flat';
        if (p30 > avgOlder * 1.2) trend = 'up';
        else if (p30 < avgOlder * 0.8) trend = 'down';

        const assignment = assignmentMap[p.id];
        const bin = assignment ? binMap[assignment.bin_id] : null;
        const cls = abcMap[p.id] || 'C';
        const optimalZone = cls === 'A' ? 'Forward Pick' : cls === 'B' ? 'Standard' : 'Bulk Storage';

        return {
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          picks30d: p30,
          picks90d: p90,
          trend,
          currentBinCode: bin?.bin_code || 'Unassigned',
          optimalZone,
        };
      })
      .sort((a, b) => b.picks30d - a.picks30d);
  }, [products, picks30, picks90, assignmentMap, binMap, abcMap]);

  // ── Apply recommendation ──
  const applyRecommendation = async (rec: Recommendation) => {
    if (!tenantId) return;
    setApplyingId(rec.productId);
    try {
      const supabase = createClient();
      if (rec.assignmentId) {
        const { error } = await supabase
          .from('product_bin_assignments')
          .update({ bin_id: rec.suggestedBinId, updated_at: new Date().toISOString() })
          .eq('id', rec.assignmentId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('product_bin_assignments')
          .insert({
            tenant_id: tenantId,
            product_id: rec.productId,
            bin_id: rec.suggestedBinId,
            bin_role: 'primary',
            min_quantity: 0,
            max_quantity: 0,
            reorder_point: 0,
            unit_of_measure: 'each',
            is_active: true,
          });
        if (error) throw error;
      }
      toast.success(`Moved ${rec.productName} to ${rec.suggestedBinCode}`);
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error('Failed to apply recommendation');
    } finally {
      setApplyingId(null);
    }
  };

  const applyAllAItems = async () => {
    const aRecs = recommendations.filter((r) => r.abcClass === 'A');
    if (aRecs.length === 0) { toast.info('No A-item recommendations to apply'); return; }
    setApplyingAll(true);
    try {
      for (const rec of aRecs) {
        await applyRecommendation(rec);
      }
      toast.success(`Applied ${aRecs.length} A-item moves`);
    } finally {
      setApplyingAll(false);
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
        title="Slotting Optimization"
        description="Optimize bin assignments for efficient warehouse picking"
      />

      <Tabs defaultValue="current" className="space-y-6">
        <TabsList>
          <TabsTrigger value="current">Current Slotting</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="velocity">Velocity Analysis</TabsTrigger>
        </TabsList>

        {/* ── Current Slotting Tab ── */}
        <TabsContent value="current" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Product-Bin Assignments</CardTitle>
              <CardDescription>Current slotting with pick frequency. Highlighted rows indicate fast-moving products in distant bins.</CardDescription>
            </CardHeader>
            <CardContent>
              {slottingRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No product-bin assignments found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Current Bin</TableHead>
                      <TableHead>Zone</TableHead>
                      <TableHead className="text-right">Picks (30d)</TableHead>
                      <TableHead className="text-right">Distance Score</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slottingRows.map((r) => (
                      <TableRow key={r.productId} className={r.isBadSlotting ? 'bg-red-50 dark:bg-red-950/30' : ''}>
                        <TableCell className="font-medium">{r.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{r.sku}</TableCell>
                        <TableCell><Badge variant="outline">{r.currentBinCode}</Badge></TableCell>
                        <TableCell>{r.zone}</TableCell>
                        <TableCell className="text-right">{formatNumber(r.picks30d)}</TableCell>
                        <TableCell className="text-right">{r.distanceScore}</TableCell>
                        <TableCell>
                          {r.isBadSlotting ? (
                            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Misslotted
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">OK</Badge>
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

        {/* ── Recommendations Tab ── */}
        <TabsContent value="recommendations" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Slotting Recommendations</CardTitle>
                  <CardDescription>Move fast movers closer and slow movers further from shipping</CardDescription>
                </div>
                <Button
                  onClick={applyAllAItems}
                  disabled={applyingAll || recommendations.filter((r) => r.abcClass === 'A').length === 0}
                >
                  {applyingAll && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Apply All A-Item Moves
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No recommendations. Current slotting looks optimal!</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Current Bin</TableHead>
                      <TableHead>Suggested Bin</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Est. Savings</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recommendations.map((rec) => (
                      <TableRow key={rec.productId}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{rec.productName}</p>
                            <p className="text-xs text-muted-foreground">{rec.sku}</p>
                          </div>
                        </TableCell>
                        <TableCell>{abcBadge(rec.abcClass)}</TableCell>
                        <TableCell><Badge variant="outline">{rec.currentBinCode}</Badge></TableCell>
                        <TableCell><Badge variant="outline" className="border-green-500 text-green-700">{rec.suggestedBinCode}</Badge></TableCell>
                        <TableCell className="max-w-[200px] text-sm">{rec.reason}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{rec.estimatedSavings}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => applyRecommendation(rec)}
                            disabled={applyingId === rec.productId}
                          >
                            {applyingId === rec.productId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4 mr-1" />
                                Apply
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Velocity Analysis Tab ── */}
        <TabsContent value="velocity" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Velocity Analysis</CardTitle>
                  <CardDescription>Products ranked by movement velocity</CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    exportToCSV(
                      velocityRows.map((v) => ({
                        product: v.productName,
                        sku: v.sku,
                        picks_30d: v.picks30d,
                        picks_90d: v.picks90d,
                        trend: v.trend,
                        current_bin: v.currentBinCode,
                        optimal_zone: v.optimalZone,
                      })),
                      'velocity_analysis'
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {velocityRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No product data available.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Picks (30d)</TableHead>
                      <TableHead className="text-right">Picks (90d)</TableHead>
                      <TableHead>Trend</TableHead>
                      <TableHead>Current Bin</TableHead>
                      <TableHead>Optimal Zone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {velocityRows.map((v) => (
                      <TableRow key={v.productId}>
                        <TableCell className="font-medium">{v.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{v.sku}</TableCell>
                        <TableCell className="text-right">{formatNumber(v.picks30d)}</TableCell>
                        <TableCell className="text-right">{formatNumber(v.picks90d)}</TableCell>
                        <TableCell>
                          {v.trend === 'up' && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><TrendingUp className="h-3 w-3 mr-1" />Up</Badge>}
                          {v.trend === 'down' && <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><TrendingDown className="h-3 w-3 mr-1" />Down</Badge>}
                          {v.trend === 'flat' && <Badge variant="secondary"><Minus className="h-3 w-3 mr-1" />Flat</Badge>}
                        </TableCell>
                        <TableCell><Badge variant="outline">{v.currentBinCode}</Badge></TableCell>
                        <TableCell>{v.optimalZone}</TableCell>
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
