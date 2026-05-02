'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Box,
  Plus,
  Pencil,
  Trash2,
  Link,
  Package,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type {
  Bin,
  BinType,
  BinInventory,
  ProductBinAssignment,
  Location,
  Zone,
  Product,
} from '@/types/database';

// ── Extended types for joined queries ──

type BinWithJoins = Omit<Bin, 'location' | 'zone'> & {
  location?: { name: string };
  zone?: { name: string } | null;
};

type AssignmentWithJoins = Omit<ProductBinAssignment, 'product' | 'bin'> & {
  product?: { name: string; sku: string };
  bin?: { bin_code: string; bin_type: BinType };
};

type InventoryWithJoins = Omit<BinInventory, 'bin' | 'product' | 'lot'> & {
  bin?: { bin_code: string };
  product?: { name: string; sku: string };
  lot?: { lot_number: string } | null;
};

interface ReplenishmentItem {
  assignmentId: string;
  productId: string;
  productName: string;
  productSku: string;
  primaryBinCode: string;
  primaryBinId: string;
  currentQty: number;
  reorderPoint: number;
  maxQty: number;
  replenishQty: number;
  secondaryBinCode: string | null;
  secondaryBinId: string | null;
}

// ── Constants ──

const BIN_TYPES: BinType[] = ['primary', 'secondary', 'bulk', 'staging', 'returns'];

const binTypeColor: Record<BinType, string> = {
  primary: 'default',
  secondary: 'secondary',
  bulk: 'outline',
  staging: 'default',
  returns: 'destructive',
};

export default function BinsPage() {
  const { tenantId } = useAuth();
  const supabase = createClient();

  // ── Data state ──
  const [bins, setBins] = useState<BinWithJoins[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithJoins[]>([]);
  const [inventory, setInventory] = useState<InventoryWithJoins[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  // ── Bin dialog state ──
  const [binDialogOpen, setBinDialogOpen] = useState(false);
  const [editBin, setEditBin] = useState<BinWithJoins | null>(null);
  const [binForm, setBinForm] = useState({
    location_id: '',
    zone_id: '',
    bin_code: '',
    bin_type: 'primary' as BinType,
    description: '',
    is_active: true,
  });

  // ── Assignment dialog state ──
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    product_id: '',
    bin_id: '',
    bin_role: 'primary',
    min_quantity: '0',
    max_quantity: '100',
    reorder_point: '10',
    unit_of_measure: 'EA',
  });

  // ── Inventory filter state ──
  const [invFilterBin, setInvFilterBin] = useState('all');
  const [invFilterProduct, setInvFilterProduct] = useState('all');

  const [saving, setSaving] = useState(false);

  // ── Zones filtered by selected location ──
  const filteredZones = useMemo(
    () => zones.filter((z) => z.location_id === binForm.location_id),
    [zones, binForm.location_id]
  );

  // ── Data loading ──

  const loadData = useCallback(async () => {
    if (!tenantId) return;

    const [binRes, assignRes, invRes, locRes, zoneRes, prodRes, taskRes] =
      await Promise.all([
        supabase
          .from('bins')
          .select('*, location:locations(name), zone:zones(name)')
          .eq('tenant_id', tenantId)
          .order('bin_code'),
        supabase
          .from('product_bin_assignments')
          .select('*, product:products(name, sku), bin:bins(bin_code, bin_type)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('bin_inventory')
          .select('*, bin:bins(bin_code), product:products(name, sku), lot:lots(lot_number)')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false }),
        supabase
          .from('locations')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('zones')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('name'),
        supabase
          .from('products')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('is_archived', false)
          .order('name'),
        supabase
          .from('scan_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('task_type', 'replenish')
          .in('status', ['pending', 'assigned', 'in_progress']),
      ]);

    setBins(binRes.data || []);
    setAssignments(assignRes.data || []);
    setInventory(invRes.data || []);
    setLocations(locRes.data || []);
    setZones(zoneRes.data || []);
    setProducts(prodRes.data || []);
    setPendingTaskCount(taskRes.count || 0);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Replenishment calculation ──

  const replenishmentItems = useMemo<ReplenishmentItem[]>(() => {
    // Build a map of current bin inventory quantities keyed by bin_id + product_id
    const invMap = new Map<string, number>();
    for (const inv of inventory) {
      const key = `${inv.bin_id}::${inv.product_id}`;
      invMap.set(key, (invMap.get(key) || 0) + inv.quantity);
    }

    const items: ReplenishmentItem[] = [];
    // Only look at primary assignments
    const primaryAssignments = assignments.filter((a) => a.bin_role === 'primary' && a.is_active);

    for (const pa of primaryAssignments) {
      const key = `${pa.bin_id}::${pa.product_id}`;
      const currentQty = invMap.get(key) || 0;

      if (currentQty < pa.reorder_point) {
        // Find secondary bin for same product
        const secondary = assignments.find(
          (a) =>
            a.product_id === pa.product_id &&
            a.bin_role === 'secondary' &&
            a.bin_id !== pa.bin_id &&
            a.is_active
        );

        items.push({
          assignmentId: pa.id,
          productId: pa.product_id,
          productName: pa.product?.name || 'Unknown',
          productSku: pa.product?.sku || '',
          primaryBinCode: pa.bin?.bin_code || 'Unknown',
          primaryBinId: pa.bin_id,
          currentQty,
          reorderPoint: pa.reorder_point,
          maxQty: pa.max_quantity,
          replenishQty: pa.max_quantity - currentQty,
          secondaryBinCode: secondary?.bin?.bin_code || null,
          secondaryBinId: secondary?.bin_id || null,
        });
      }
    }
    return items;
  }, [assignments, inventory]);

  // ── Bins at capacity ──
  const binsAtCapacity = useMemo(() => {
    const invByBin = new Map<string, number>();
    for (const inv of inventory) {
      invByBin.set(inv.bin_id, (invByBin.get(inv.bin_id) || 0) + inv.quantity);
    }
    let count = 0;
    for (const a of assignments.filter((a) => a.is_active)) {
      const qty = invByBin.get(a.bin_id) || 0;
      if (qty >= a.max_quantity && a.max_quantity > 0) {
        count++;
      }
    }
    return count;
  }, [assignments, inventory]);

  // ── Filtered inventory ──
  const filteredInventory = useMemo(() => {
    let result = inventory;
    if (invFilterBin !== 'all') {
      result = result.filter((i) => i.bin_id === invFilterBin);
    }
    if (invFilterProduct !== 'all') {
      result = result.filter((i) => i.product_id === invFilterProduct);
    }
    return result;
  }, [inventory, invFilterBin, invFilterProduct]);

  // ── Bin CRUD ──

  function openBinDialog(bin?: BinWithJoins) {
    if (bin) {
      setEditBin(bin);
      setBinForm({
        location_id: bin.location_id,
        zone_id: bin.zone_id || '',
        bin_code: bin.bin_code,
        bin_type: bin.bin_type,
        description: bin.description || '',
        is_active: bin.is_active,
      });
    } else {
      setEditBin(null);
      setBinForm({
        location_id: '',
        zone_id: '',
        bin_code: '',
        bin_type: 'primary',
        description: '',
        is_active: true,
      });
    }
    setBinDialogOpen(true);
  }

  async function saveBin() {
    if (!tenantId) return;
    if (!binForm.bin_code.trim() || !binForm.location_id) {
      toast.error('Bin code and location are required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        location_id: binForm.location_id,
        zone_id: binForm.zone_id || null,
        bin_code: binForm.bin_code.trim(),
        bin_type: binForm.bin_type,
        description: binForm.description.trim() || null,
        is_active: binForm.is_active,
      };

      if (editBin) {
        const { error } = await supabase
          .from('bins')
          .update(payload)
          .eq('id', editBin.id);
        if (error) throw error;
        toast.success('Bin updated');
      } else {
        const { error } = await supabase.from('bins').insert(payload);
        if (error) throw error;
        toast.success('Bin created');
      }
      setBinDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save bin');
    } finally {
      setSaving(false);
    }
  }

  async function deleteBin(bin: BinWithJoins) {
    if (!confirm(`Delete bin ${bin.bin_code}?`)) return;
    const { error } = await supabase.from('bins').delete().eq('id', bin.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Bin deleted');
      loadData();
    }
  }

  // ── Assignment CRUD ──

  function openAssignDialog() {
    setAssignForm({
      product_id: '',
      bin_id: '',
      bin_role: 'primary',
      min_quantity: '0',
      max_quantity: '100',
      reorder_point: '10',
      unit_of_measure: 'EA',
    });
    setAssignDialogOpen(true);
  }

  async function saveAssignment() {
    if (!tenantId) return;
    if (!assignForm.product_id || !assignForm.bin_id) {
      toast.error('Product and bin are required');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('product_bin_assignments').insert({
        tenant_id: tenantId,
        product_id: assignForm.product_id,
        bin_id: assignForm.bin_id,
        bin_role: assignForm.bin_role,
        min_quantity: Number(assignForm.min_quantity) || 0,
        max_quantity: Number(assignForm.max_quantity) || 100,
        reorder_point: Number(assignForm.reorder_point) || 10,
        unit_of_measure: assignForm.unit_of_measure || 'EA',
        is_active: true,
      });
      if (error) throw error;
      toast.success('Product assigned to bin');
      setAssignDialogOpen(false);
      loadData();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to save assignment'
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteAssignment(id: string) {
    if (!confirm('Remove this assignment?')) return;
    const { error } = await supabase
      .from('product_bin_assignments')
      .delete()
      .eq('id', id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Assignment removed');
      loadData();
    }
  }

  // ── Replenishment task generation ──

  async function generateReplenishmentTasks() {
    if (!tenantId || replenishmentItems.length === 0) return;
    setSaving(true);
    try {
      const tasks = replenishmentItems.map((item) => ({
        tenant_id: tenantId,
        task_type: 'replenish' as const,
        status: 'pending' as const,
        priority: 5,
        title: `Replenish ${item.productName} in ${item.primaryBinCode}`,
        instructions: `Move ${item.replenishQty} ${item.productSku} from ${item.secondaryBinCode || 'bulk'} to ${item.primaryBinCode}`,
        product_id: item.productId,
        target_bin_id: item.primaryBinId,
        source_bin_id: item.secondaryBinId,
        requested_quantity: item.replenishQty,
      }));

      const { error } = await supabase.from('scan_tasks').insert(tasks);
      if (error) throw error;
      toast.success(`${tasks.length} replenishment task(s) created`);
      loadData();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create tasks'
      );
    } finally {
      setSaving(false);
    }
  }

  // ── Bin table columns ──

  const binColumns: Column<BinWithJoins>[] = [
    { key: 'bin_code', label: 'Bin Code', sortable: true },
    {
      key: 'bin_type',
      label: 'Type',
      sortable: true,
      render: (row) => (
        <Badge variant={binTypeColor[row.bin_type] as 'default' | 'secondary' | 'outline' | 'destructive'}>
          {row.bin_type}
        </Badge>
      ),
    },
    {
      key: 'location',
      label: 'Location',
      sortable: false,
      render: (row) => row.location?.name || '—',
    },
    {
      key: 'zone',
      label: 'Zone',
      sortable: false,
      render: (row) => row.zone?.name || '—',
    },
    { key: 'description', label: 'Description' },
    {
      key: 'is_active',
      label: 'Status',
      render: (row) => (
        <Badge variant={row.is_active ? 'default' : 'secondary'}>
          {row.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'w-[100px]',
      render: (row) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              openBinDialog(row);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              deleteBin(row);
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  // ── Assignment table columns ──

  const assignColumns: Column<AssignmentWithJoins>[] = [
    {
      key: 'product',
      label: 'Product',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.product?.name || '—'}</div>
          <div className="text-xs text-muted-foreground">{row.product?.sku}</div>
        </div>
      ),
    },
    {
      key: 'bin',
      label: 'Bin',
      render: (row) => row.bin?.bin_code || '—',
    },
    {
      key: 'bin_role',
      label: 'Role',
      render: (row) => (
        <Badge variant={row.bin_role === 'primary' ? 'default' : 'secondary'}>
          {row.bin_role}
        </Badge>
      ),
    },
    { key: 'min_quantity', label: 'Min Qty', render: (row) => formatNumber(row.min_quantity) },
    { key: 'max_quantity', label: 'Max Qty', render: (row) => formatNumber(row.max_quantity) },
    { key: 'reorder_point', label: 'Reorder Pt', render: (row) => formatNumber(row.reorder_point) },
    { key: 'unit_of_measure', label: 'UOM' },
    {
      key: 'actions',
      label: '',
      className: 'w-[60px]',
      render: (row) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            deleteAssignment(row.id);
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ];

  // ── Render ──

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
        title="Bin Management"
        description="Manage bins, product assignments, inventory, and replenishment"
        actions={
          <Button variant="outline" onClick={() => exportToCSV(bins.map((b) => ({
            bin_code: b.bin_code,
            bin_type: b.bin_type,
            location: b.location?.name || '',
            zone: b.zone?.name || '',
            description: b.description || '',
            is_active: b.is_active,
          })), 'bins')}>
            Export CSV
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Bins" value={formatNumber(bins.length)} icon={Box} />
        <StatCard
          title="Active Assignments"
          value={formatNumber(assignments.filter((a) => a.is_active).length)}
          icon={Link}
        />
        <StatCard
          title="Items Below Reorder"
          value={formatNumber(replenishmentItems.length)}
          icon={AlertTriangle}
          description={replenishmentItems.length > 0 ? 'Needs replenishment' : undefined}
        />
        <StatCard
          title="Bins at Capacity"
          value={formatNumber(binsAtCapacity)}
          icon={Package}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="bins" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bins">Bins</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="replenishment">
            Replenishment
            {replenishmentItems.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 min-w-5 px-1">
                {replenishmentItems.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Bins Tab ── */}
        <TabsContent value="bins">
          <Card>
            <CardHeader>
              <CardTitle>All Bins</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={bins}
                columns={binColumns}
                searchKey="bin_code"
                searchPlaceholder="Search by bin code..."
                actions={
                  <Button onClick={() => openBinDialog()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Bin
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Assignments Tab ── */}
        <TabsContent value="assignments">
          <Card>
            <CardHeader>
              <CardTitle>Product-to-Bin Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={assignments}
                columns={assignColumns}
                searchKey="product"
                searchPlaceholder="Search by product..."
                actions={
                  <Button onClick={openAssignDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Assign Product to Bin
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Inventory Tab ── */}
        <TabsContent value="inventory">
          <Card>
            <CardHeader>
              <CardTitle>Bin Inventory</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-[220px]">
                  <Label className="text-xs text-muted-foreground">Filter by Bin</Label>
                  <Select value={invFilterBin} onValueChange={setInvFilterBin}>
                    <SelectTrigger>
                      <SelectValue placeholder="All bins" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All bins</SelectItem>
                      {bins.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.bin_code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[220px]">
                  <Label className="text-xs text-muted-foreground">Filter by Product</Label>
                  <Select value={invFilterProduct} onValueChange={setInvFilterProduct}>
                    <SelectTrigger>
                      <SelectValue placeholder="All products" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All products</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bin Code</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Lot Number</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                          No inventory found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInventory.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">
                            {inv.bin?.bin_code || '—'}
                          </TableCell>
                          <TableCell>
                            <div>
                              <div>{inv.product?.name || '—'}</div>
                              <div className="text-xs text-muted-foreground">
                                {inv.product?.sku}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{inv.lot?.lot_number || '—'}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatNumber(inv.quantity)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Replenishment Tab ── */}
        <TabsContent value="replenishment">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Replenishment Needed</CardTitle>
                {pendingTaskCount > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {pendingTaskCount} pending replenishment task(s) already created
                  </p>
                )}
              </div>
              <Button
                onClick={generateReplenishmentTasks}
                disabled={saving || replenishmentItems.length === 0}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${saving ? 'animate-spin' : ''}`} />
                Generate Replenishment Tasks
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Primary Bin</TableHead>
                      <TableHead className="text-right">Current Qty</TableHead>
                      <TableHead className="text-right">Reorder Point</TableHead>
                      <TableHead className="text-right">Max Qty</TableHead>
                      <TableHead className="text-right">Replenish Qty</TableHead>
                      <TableHead>Source Bin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {replenishmentItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          All bins are above reorder points.
                        </TableCell>
                      </TableRow>
                    ) : (
                      replenishmentItems.map((item) => (
                        <TableRow key={item.assignmentId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{item.productName}</div>
                              <div className="text-xs text-muted-foreground">
                                {item.productSku}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{item.primaryBinCode}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-destructive font-medium">
                              {formatNumber(item.currentQty)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(item.reorderPoint)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatNumber(item.maxQty)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatNumber(item.replenishQty)}
                          </TableCell>
                          <TableCell>
                            {item.secondaryBinCode || (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Add/Edit Bin Dialog ── */}
      <Dialog open={binDialogOpen} onOpenChange={setBinDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editBin ? 'Edit Bin' : 'Add Bin'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Location *</Label>
              <Select
                value={binForm.location_id}
                onValueChange={(v) =>
                  setBinForm({ ...binForm, location_id: v, zone_id: '' })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Zone</Label>
              <Select
                value={binForm.zone_id}
                onValueChange={(v) => setBinForm({ ...binForm, zone_id: v })}
                disabled={!binForm.location_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={binForm.location_id ? 'Select zone' : 'Select location first'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredZones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Bin Code *</Label>
              <Input
                value={binForm.bin_code}
                onChange={(e) =>
                  setBinForm({ ...binForm, bin_code: e.target.value })
                }
                placeholder="e.g. A-01-01"
              />
            </div>

            <div className="space-y-2">
              <Label>Bin Type</Label>
              <Select
                value={binForm.bin_type}
                onValueChange={(v) =>
                  setBinForm({ ...binForm, bin_type: v as BinType })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BIN_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={binForm.description}
                onChange={(e) =>
                  setBinForm({ ...binForm, description: e.target.value })
                }
                placeholder="Optional description"
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                checked={binForm.is_active}
                onCheckedChange={(checked) =>
                  setBinForm({ ...binForm, is_active: checked })
                }
              />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBinDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveBin} disabled={saving}>
              {saving ? 'Saving...' : editBin ? 'Update Bin' : 'Create Bin'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Product to Bin Dialog ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Product to Bin</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select
                value={assignForm.product_id}
                onValueChange={(v) =>
                  setAssignForm({ ...assignForm, product_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Bin *</Label>
              <Select
                value={assignForm.bin_id}
                onValueChange={(v) =>
                  setAssignForm({ ...assignForm, bin_id: v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select bin" />
                </SelectTrigger>
                <SelectContent>
                  {bins
                    .filter((b) => b.is_active)
                    .map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.bin_code} ({b.bin_type})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={assignForm.bin_role}
                onValueChange={(v) =>
                  setAssignForm({ ...assignForm, bin_role: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Min Quantity</Label>
                <Input
                  type="number"
                  value={assignForm.min_quantity}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, min_quantity: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Max Quantity</Label>
                <Input
                  type="number"
                  value={assignForm.max_quantity}
                  onChange={(e) =>
                    setAssignForm({ ...assignForm, max_quantity: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Reorder Point</Label>
                <Input
                  type="number"
                  value={assignForm.reorder_point}
                  onChange={(e) =>
                    setAssignForm({
                      ...assignForm,
                      reorder_point: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Unit of Measure</Label>
                <Input
                  value={assignForm.unit_of_measure}
                  onChange={(e) =>
                    setAssignForm({
                      ...assignForm,
                      unit_of_measure: e.target.value,
                    })
                  }
                  placeholder="EA"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssignDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveAssignment} disabled={saving}>
              {saving ? 'Saving...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
