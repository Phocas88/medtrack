'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ShieldAlert,
  RotateCcw,
  Download,
  Plus,
  ClipboardCheck,
  FileText,
  Package,
} from 'lucide-react';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';

// ── Types ──

interface ControlledProduct {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  notes: string | null;
  dea_schedule: string;
  current_stock: number;
  last_reconciliation_date: string | null;
}

interface ControlledTransaction {
  id: string;
  created_at: string;
  product_name: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  lot_number: string;
  reference_number: string | null;
  reason: string | null;
  recorded_by: string;
}

interface Reconciliation {
  id: string;
  product_id: string;
  product_name: string;
  expected_quantity: number;
  counted_quantity: number;
  variance: number;
  reason_code: string;
  notes: string | null;
  reconciled_by: string;
  reconciled_at: string;
  status: string;
}

interface ARCOSRow {
  product_name: string;
  product_sku: string;
  dea_schedule: string;
  beginning_inventory: number;
  received: number;
  dispensed: number;
  adjustments: number;
  ending_inventory: number;
}

// ── Helpers ──

function parseSchedule(product: { category: string | null; notes: string | null }): string | null {
  const text = `${product.category || ''} ${product.notes || ''}`.toLowerCase();
  if (text.includes('schedule ii') || text.includes('schedule 2') || text.includes('c-ii') || text.includes('cii')) return 'II';
  if (text.includes('schedule iii') || text.includes('schedule 3') || text.includes('c-iii') || text.includes('ciii')) return 'III';
  if (text.includes('schedule iv') || text.includes('schedule 4') || text.includes('c-iv') || text.includes('civ')) return 'IV';
  if (text.includes('schedule v') || text.includes('schedule 5') || text.includes('c-v') || text.includes('cv')) return 'V';
  if (text.includes('controlled') || text.includes('schedule')) return 'II';
  return null;
}

function scheduleBadge(schedule: string) {
  const colors: Record<string, string> = {
    II: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    III: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    IV: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    V: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  };
  return (
    <Badge className={colors[schedule] || ''} variant="outline">
      Schedule {schedule}
    </Badge>
  );
}

// ── Main Component ──

export default function ControlledSubstancesPage() {
  const { user, tenantId } = useAuth();
  const supabase = createClient();

  // Inventory state
  const [products, setProducts] = useState<ControlledProduct[]>([]);
  const [loading, setLoading] = useState(true);

  // Transaction state
  const [transactions, setTransactions] = useState<ControlledTransaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // Reconciliation state
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [reconDialogOpen, setReconDialogOpen] = useState(false);
  const [reconProduct, setReconProduct] = useState('');
  const [reconCounted, setReconCounted] = useState('');
  const [reconReason, setReconReason] = useState('');
  const [reconNotes, setReconNotes] = useState('');
  const [reconSaving, setReconSaving] = useState(false);

  // ARCOS state
  const [arcosData, setArcosData] = useState<ARCOSRow[]>([]);
  const [arcosStart, setArcosStart] = useState('');
  const [arcosEnd, setArcosEnd] = useState('');
  const [arcosLoading, setArcosLoading] = useState(false);

  // ── Load controlled products ──
  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);

    const { data: allProducts } = await supabase
      .from('products')
      .select('id, name, sku, category, notes')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false);

    const controlled = (allProducts || [])
      .map((p) => ({ ...p, dea_schedule: parseSchedule(p) }))
      .filter((p) => p.dea_schedule !== null) as (typeof allProducts extends (infer U)[] | null ? U & { dea_schedule: string } : never)[];

    // Get stock for each product
    const productIds = controlled.map((p) => p.id);
    const stockMap: Record<string, number> = {};

    if (productIds.length > 0) {
      const { data: lots } = await supabase
        .from('lots')
        .select('product_id, quantity_on_hand')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .in('product_id', productIds);

      (lots || []).forEach((l) => {
        stockMap[l.product_id] = (stockMap[l.product_id] || 0) + l.quantity_on_hand;
      });
    }

    const mapped: ControlledProduct[] = controlled.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      category: p.category,
      notes: p.notes,
      dea_schedule: p.dea_schedule!,
      current_stock: stockMap[p.id] || 0,
      last_reconciliation_date: null,
    }));

    setProducts(mapped);
    setLoading(false);
  }, [tenantId]);

  // ── Load transactions ──
  const loadTransactions = useCallback(async () => {
    if (!tenantId || products.length === 0) return;
    setTxLoading(true);
    const productIds = products.map((p) => p.id);

    const { data: movements } = await supabase
      .from('stock_movements')
      .select('*, product:products(name), lot:lots(lot_number), user:users(full_name)')
      .eq('tenant_id', tenantId)
      .in('product_id', productIds)
      .order('created_at', { ascending: false })
      .limit(500);

    const mapped: ControlledTransaction[] = (movements || []).map((m) => {
      const product = m.product as unknown as { name: string } | null;
      const lot = m.lot as unknown as { lot_number: string } | null;
      const mUser = m.user as unknown as { full_name: string } | null;
      return {
        id: m.id,
        created_at: m.created_at,
        product_name: product?.name || '',
        product_id: m.product_id,
        movement_type: m.movement_type,
        quantity: m.quantity,
        lot_number: lot?.lot_number || '—',
        reference_number: m.reference_number,
        reason: m.reason,
        recorded_by: mUser?.full_name || '—',
      };
    });

    setTransactions(mapped);
    setTxLoading(false);
  }, [tenantId, products]);

  // ── Load reconciliations from localStorage (simulated) ──
  const loadReconciliations = useCallback(() => {
    if (!tenantId) return;
    const stored = localStorage.getItem(`stokora_recon_${tenantId}`);
    if (stored) {
      try {
        setReconciliations(JSON.parse(stored));
      } catch {
        setReconciliations([]);
      }
    }
  }, [tenantId]);

  function saveReconciliations(recons: Reconciliation[]) {
    if (!tenantId) return;
    localStorage.setItem(`stokora_recon_${tenantId}`, JSON.stringify(recons));
    setReconciliations(recons);
  }

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (products.length > 0) {
      loadTransactions();
      loadReconciliations();
    }
  }, [products, loadTransactions, loadReconciliations]);

  // ── Reconciliation submit ──
  async function handleReconSubmit() {
    if (!reconProduct || !reconCounted || !reconReason || !user || !tenantId) {
      toast.error('Please fill all required fields');
      return;
    }
    setReconSaving(true);

    const product = products.find((p) => p.id === reconProduct);
    if (!product) {
      toast.error('Product not found');
      setReconSaving(false);
      return;
    }

    const counted = parseInt(reconCounted, 10);
    const expected = product.current_stock;
    const variance = counted - expected;

    const newRecon: Reconciliation = {
      id: crypto.randomUUID(),
      product_id: product.id,
      product_name: product.name,
      expected_quantity: expected,
      counted_quantity: counted,
      variance,
      reason_code: reconReason,
      notes: reconNotes || null,
      reconciled_by: user.full_name || user.email,
      reconciled_at: new Date().toISOString(),
      status: variance === 0 ? 'balanced' : 'variance_recorded',
    };

    // If there's a variance, create an adjustment movement
    if (variance !== 0) {
      await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        product_id: product.id,
        user_id: user.id,
        quantity: variance,
        movement_type: 'adjust',
        reason: `Controlled substance reconciliation: ${reconReason}${reconNotes ? ' - ' + reconNotes : ''}`,
        reference_number: `RECON-${newRecon.id.slice(0, 8).toUpperCase()}`,
      });
    }

    const updated = [newRecon, ...reconciliations];
    saveReconciliations(updated);

    toast.success(
      variance === 0
        ? 'Reconciliation complete - no variance'
        : `Variance of ${variance > 0 ? '+' : ''}${variance} recorded`
    );

    setReconDialogOpen(false);
    setReconProduct('');
    setReconCounted('');
    setReconReason('');
    setReconNotes('');
    setReconSaving(false);
    loadProducts();
  }

  // ── ARCOS report generation ──
  async function generateARCOS() {
    if (!arcosStart || !arcosEnd || !tenantId || products.length === 0) {
      toast.error('Select a date range');
      return;
    }
    setArcosLoading(true);

    const productIds = products.map((p) => p.id);

    // Get movements in range
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('product_id, movement_type, quantity, created_at')
      .eq('tenant_id', tenantId)
      .in('product_id', productIds)
      .gte('created_at', arcosStart)
      .lte('created_at', arcosEnd + 'T23:59:59Z');

    // Get movements before range for beginning inventory
    const { data: priorMovements } = await supabase
      .from('stock_movements')
      .select('product_id, quantity')
      .eq('tenant_id', tenantId)
      .in('product_id', productIds)
      .lt('created_at', arcosStart);

    const priorStock: Record<string, number> = {};
    (priorMovements || []).forEach((m) => {
      priorStock[m.product_id] = (priorStock[m.product_id] || 0) + m.quantity;
    });

    const received: Record<string, number> = {};
    const dispensed: Record<string, number> = {};
    const adjustments: Record<string, number> = {};

    (movements || []).forEach((m) => {
      if (m.movement_type === 'receive') {
        received[m.product_id] = (received[m.product_id] || 0) + m.quantity;
      } else if (m.movement_type === 'ship') {
        dispensed[m.product_id] = (dispensed[m.product_id] || 0) + Math.abs(m.quantity);
      } else {
        adjustments[m.product_id] = (adjustments[m.product_id] || 0) + m.quantity;
      }
    });

    const rows: ARCOSRow[] = products.map((p) => {
      const beginning = priorStock[p.id] || 0;
      const recv = received[p.id] || 0;
      const disp = dispensed[p.id] || 0;
      const adj = adjustments[p.id] || 0;
      return {
        product_name: p.name,
        product_sku: p.sku,
        dea_schedule: p.dea_schedule,
        beginning_inventory: beginning,
        received: recv,
        dispensed: disp,
        adjustments: adj,
        ending_inventory: beginning + recv - disp + adj,
      };
    });

    setArcosData(rows);
    setArcosLoading(false);
  }

  function exportARCOS() {
    if (arcosData.length === 0) return;
    exportToCSV(
      arcosData.map((r) => ({
        product: r.product_name,
        ndc_sku: r.product_sku,
        dea_schedule: r.dea_schedule,
        beginning_inventory: r.beginning_inventory,
        quantity_received: r.received,
        quantity_dispensed: r.dispensed,
        adjustments: r.adjustments,
        ending_inventory: r.ending_inventory,
        report_start: arcosStart,
        report_end: arcosEnd,
      })),
      'arcos_report'
    );
    toast.success('ARCOS report exported');
  }

  // ── Column definitions ──

  const inventoryColumns: Column<ControlledProduct>[] = [
    { key: 'name', label: 'Product', sortable: true },
    { key: 'sku', label: 'SKU', sortable: true, render: (row) => <span className="font-mono text-xs">{row.sku}</span> },
    {
      key: 'dea_schedule',
      label: 'DEA Schedule',
      sortable: true,
      render: (row) => scheduleBadge(row.dea_schedule),
    },
    { key: 'current_stock', label: 'Current Stock', sortable: true, render: (row) => formatNumber(row.current_stock) },
    {
      key: 'last_reconciliation_date',
      label: 'Last Reconciliation',
      sortable: true,
      render: (row) => {
        const recon = reconciliations.find((r) => r.product_id === row.id);
        return recon ? formatDate(recon.reconciled_at) : <span className="text-muted-foreground">Never</span>;
      },
    },
  ];

  const transactionColumns: Column<ControlledTransaction>[] = [
    { key: 'created_at', label: 'Date', sortable: true, render: (row) => formatDateTime(row.created_at) },
    { key: 'product_name', label: 'Product', sortable: true },
    {
      key: 'movement_type',
      label: 'Type',
      sortable: true,
      render: (row) => (
        <Badge variant={row.movement_type === 'receive' ? 'default' : row.movement_type === 'ship' ? 'secondary' : 'outline'}>
          {row.movement_type.charAt(0).toUpperCase() + row.movement_type.slice(1)}
        </Badge>
      ),
    },
    {
      key: 'quantity',
      label: 'Quantity',
      sortable: true,
      render: (row) => (
        <span className={row.quantity > 0 ? 'text-green-600' : 'text-red-600'}>
          {row.quantity > 0 ? '+' : ''}{row.quantity}
        </span>
      ),
    },
    { key: 'lot_number', label: 'Lot #', render: (row) => <span className="font-mono text-xs">{row.lot_number}</span> },
    { key: 'reference_number', label: 'Reference', render: (row) => row.reference_number || '—' },
    { key: 'recorded_by', label: 'Recorded By' },
  ];

  const reconColumns: Column<Reconciliation>[] = [
    { key: 'reconciled_at', label: 'Date', sortable: true, render: (row) => formatDateTime(row.reconciled_at) },
    { key: 'product_name', label: 'Product', sortable: true },
    { key: 'expected_quantity', label: 'Expected', sortable: true },
    { key: 'counted_quantity', label: 'Counted', sortable: true },
    {
      key: 'variance',
      label: 'Variance',
      sortable: true,
      render: (row) => (
        <span className={row.variance === 0 ? 'text-green-600' : 'text-red-600 font-medium'}>
          {row.variance > 0 ? '+' : ''}{row.variance}
        </span>
      ),
    },
    {
      key: 'reason_code',
      label: 'Reason',
      render: (row) => (
        <Badge variant="outline">
          {row.reason_code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'balanced' ? 'default' : 'secondary'}>
          {row.status === 'balanced' ? 'Balanced' : 'Variance Recorded'}
        </Badge>
      ),
    },
    { key: 'reconciled_by', label: 'Reconciled By' },
  ];

  const selectedReconProduct = products.find((p) => p.id === reconProduct);

  const scheduleIICount = products.filter((p) => p.dea_schedule === 'II').length;
  const totalControlled = products.reduce((sum, p) => sum + p.current_stock, 0);
  const varianceCount = reconciliations.filter((r) => r.variance !== 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Controlled Substances"
        description="DEA-regulated substance tracking, reconciliation, and ARCOS reporting"
        actions={
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {products.length} controlled product{products.length !== 1 ? 's' : ''}
            </span>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Controlled Products" value={products.length} icon={Package} description="DEA-scheduled items" />
        <StatCard title="Schedule II Items" value={scheduleIICount} icon={ShieldAlert} description="Highest regulation" />
        <StatCard title="Total Stock" value={formatNumber(totalControlled)} icon={ClipboardCheck} description="All controlled units" />
        <StatCard title="Unresolved Variances" value={varianceCount} icon={FileText} description="From reconciliations" />
      </div>

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="arcos">ARCOS Report</TabsTrigger>
        </TabsList>

        {/* ── Inventory Tab ── */}
        <TabsContent value="inventory" className="space-y-4">
          <DataTable
            data={products}
            columns={inventoryColumns}
            searchKey="name"
            searchPlaceholder="Search controlled products..."
            emptyMessage={loading ? 'Loading controlled products...' : 'No controlled substances found. Tag products with a schedule category.'}
          />
        </TabsContent>

        {/* ── Transactions Tab ── */}
        <TabsContent value="transactions" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              All stock movements for DEA-scheduled products
            </p>
            <Button variant="ghost" size="sm" onClick={loadTransactions}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          <DataTable
            data={transactions}
            columns={transactionColumns}
            searchKey="product_name"
            searchPlaceholder="Search transactions..."
            emptyMessage={txLoading ? 'Loading transactions...' : 'No transactions found.'}
          />
        </TabsContent>

        {/* ── Reconciliation Tab ── */}
        <TabsContent value="reconciliation" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Perform and track controlled substance reconciliations
            </p>
            <Button onClick={() => setReconDialogOpen(true)} disabled={products.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              New Reconciliation
            </Button>
          </div>

          <DataTable
            data={reconciliations}
            columns={reconColumns}
            searchKey="product_name"
            searchPlaceholder="Search reconciliations..."
            emptyMessage="No reconciliations recorded yet."
          />
        </TabsContent>

        {/* ── ARCOS Report Tab ── */}
        <TabsContent value="arcos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate ARCOS Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={arcosStart}
                    onChange={(e) => setArcosStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={arcosEnd}
                    onChange={(e) => setArcosEnd(e.target.value)}
                  />
                </div>
                <Button onClick={generateARCOS} disabled={arcosLoading || !arcosStart || !arcosEnd}>
                  {arcosLoading ? 'Generating...' : 'Generate Report'}
                </Button>
                {arcosData.length > 0 && (
                  <Button variant="outline" onClick={exportARCOS}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {arcosData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  ARCOS Summary: {arcosStart} to {arcosEnd}
                  <Badge variant="outline">{arcosData.length} products</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead className="text-right">Beginning</TableHead>
                      <TableHead className="text-right">Received</TableHead>
                      <TableHead className="text-right">Dispensed</TableHead>
                      <TableHead className="text-right">Adjustments</TableHead>
                      <TableHead className="text-right">Ending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {arcosData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.product_name}</TableCell>
                        <TableCell className="font-mono text-xs">{row.product_sku}</TableCell>
                        <TableCell>{scheduleBadge(row.dea_schedule)}</TableCell>
                        <TableCell className="text-right">{formatNumber(row.beginning_inventory)}</TableCell>
                        <TableCell className="text-right text-green-600">+{formatNumber(row.received)}</TableCell>
                        <TableCell className="text-right text-red-600">-{formatNumber(row.dispensed)}</TableCell>
                        <TableCell className="text-right">{row.adjustments >= 0 ? '+' : ''}{formatNumber(row.adjustments)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatNumber(row.ending_inventory)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Reconciliation Dialog ── */}
      <Dialog open={reconDialogOpen} onOpenChange={setReconDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Reconciliation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={reconProduct} onValueChange={setReconProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Select controlled product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (Schedule {p.dea_schedule})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedReconProduct && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Expected (system) quantity:</span>
                    <span className="font-semibold">{formatNumber(selectedReconProduct.current_stock)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>Counted Quantity *</Label>
              <Input
                type="number"
                min="0"
                value={reconCounted}
                onChange={(e) => setReconCounted(e.target.value)}
                placeholder="Enter physical count"
              />
            </div>

            {selectedReconProduct && reconCounted && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Variance:</span>
                    <span className={`font-semibold ${parseInt(reconCounted) - selectedReconProduct.current_stock === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(() => {
                        const v = parseInt(reconCounted) - selectedReconProduct.current_stock;
                        return v === 0 ? 'None' : `${v > 0 ? '+' : ''}${v}`;
                      })()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-2">
              <Label>Reason Code *</Label>
              <Select value={reconReason} onValueChange={setReconReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakage">Breakage</SelectItem>
                  <SelectItem value="theft">Theft</SelectItem>
                  <SelectItem value="wastage">Wastage</SelectItem>
                  <SelectItem value="spillage">Spillage</SelectItem>
                  <SelectItem value="documentation_error">Documentation Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={reconNotes}
                onChange={(e) => setReconNotes(e.target.value)}
                placeholder="Additional details..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReconDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleReconSubmit} disabled={reconSaving}>
              {reconSaving ? 'Saving...' : 'Record Reconciliation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
