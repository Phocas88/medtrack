'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
import { Plus, Play, Trash2, AlertTriangle } from 'lucide-react';
import { formatDateTime, formatNumber } from '@/lib/format';
import { pickLotsForQuantity } from '@/lib/fefo';
import { toast } from 'sonner';
import type { Kit, KitComponent, KitAssembly, Product } from '@/types/database';

interface KitWithDetails extends Kit {
  product?: Product;
  components?: (KitComponent & { product?: Product })[];
}

interface ComponentStock {
  component: KitComponent & { product?: Product };
  available: number;
  required: number;
  sufficient: boolean;
}

export default function KittingPage() {
  const { user, tenantId } = useAuth();
  const [kits, setKits] = useState<KitWithDetails[]>([]);
  const [assemblies, setAssemblies] = useState<(KitAssembly & { kit?: Kit })[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Kit dialog
  const [kitDialogOpen, setKitDialogOpen] = useState(false);
  const [kitName, setKitName] = useState('');
  const [kitDescription, setKitDescription] = useState('');
  const [kitProductId, setKitProductId] = useState('');
  const [kitComponents, setKitComponents] = useState<{ product_id: string; quantity: number }[]>([]);
  const [editKit, setEditKit] = useState<KitWithDetails | null>(null);

  // Assembly dialog
  const [assemblyDialogOpen, setAssemblyDialogOpen] = useState(false);
  const [assemblyKitId, setAssemblyKitId] = useState('');
  const [assemblyQty, setAssemblyQty] = useState('1');
  const [assemblyNotes, setAssemblyNotes] = useState('');
  const [componentStocks, setComponentStocks] = useState<ComponentStock[]>([]);
  const [checkingStock, setCheckingStock] = useState(false);

  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [kitRes, assemblyRes, prodRes] = await Promise.all([
      supabase
        .from('kits')
        .select('*, product:products(*), components:kit_components(*, product:products(*))')
        .eq('tenant_id', tenantId)
        .order('name'),
      supabase
        .from('kit_assemblies')
        .select('*, kit:kits(*)')
        .eq('tenant_id', tenantId)
        .order('assembled_at', { ascending: false })
        .limit(50),
      supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .order('name'),
    ]);

    setKits(kitRes.data || []);
    setAssemblies(assemblyRes.data || []);
    setProducts(prodRes.data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Kit dialog handlers
  function openKitDialog(kit?: KitWithDetails) {
    if (kit) {
      setEditKit(kit);
      setKitName(kit.name);
      setKitDescription(kit.description || '');
      setKitProductId(kit.product_id);
      setKitComponents(
        (kit.components || []).map((c) => ({
          product_id: c.component_product_id,
          quantity: c.quantity,
        }))
      );
    } else {
      setEditKit(null);
      setKitName('');
      setKitDescription('');
      setKitProductId('');
      setKitComponents([]);
    }
    setKitDialogOpen(true);
  }

  function addComponent() {
    setKitComponents([...kitComponents, { product_id: '', quantity: 1 }]);
  }

  function removeComponent(index: number) {
    setKitComponents(kitComponents.filter((_, i) => i !== index));
  }

  function updateComponent(index: number, field: 'product_id' | 'quantity', value: string | number) {
    const updated = [...kitComponents];
    if (field === 'quantity') {
      updated[index].quantity = Number(value);
    } else {
      updated[index].product_id = value as string;
    }
    setKitComponents(updated);
  }

  async function saveKit() {
    if (!tenantId || !kitName || !kitProductId) {
      toast.error('Kit name and product are required');
      return;
    }
    if (kitComponents.length === 0 || kitComponents.some((c) => !c.product_id || c.quantity <= 0)) {
      toast.error('Add at least one valid component');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    if (editKit) {
      // Update kit
      const { error } = await supabase
        .from('kits')
        .update({ name: kitName, description: kitDescription || null, product_id: kitProductId })
        .eq('id', editKit.id);

      if (error) { toast.error('Failed to update kit'); setSaving(false); return; }

      // Delete old components and re-insert
      await supabase.from('kit_components').delete().eq('kit_id', editKit.id);
      await supabase.from('kit_components').insert(
        kitComponents.map((c) => ({
          tenant_id: tenantId,
          kit_id: editKit.id,
          component_product_id: c.product_id,
          quantity: c.quantity,
        }))
      );

      toast.success('Kit updated');
    } else {
      // Create kit
      const { data: newKit, error } = await supabase
        .from('kits')
        .insert({
          tenant_id: tenantId,
          name: kitName,
          description: kitDescription || null,
          product_id: kitProductId,
          is_active: true,
        })
        .select()
        .single();

      if (error || !newKit) { toast.error('Failed to create kit'); setSaving(false); return; }

      await supabase.from('kit_components').insert(
        kitComponents.map((c) => ({
          tenant_id: tenantId,
          kit_id: newKit.id,
          component_product_id: c.product_id,
          quantity: c.quantity,
        }))
      );

      toast.success('Kit created');
    }

    setSaving(false);
    setKitDialogOpen(false);
    loadData();
  }

  // Assembly dialog handlers
  async function openAssemblyDialog() {
    setAssemblyKitId('');
    setAssemblyQty('1');
    setAssemblyNotes('');
    setComponentStocks([]);
    setAssemblyDialogOpen(true);
  }

  async function checkStock() {
    if (!assemblyKitId || !tenantId) return;
    setCheckingStock(true);

    const kit = kits.find((k) => k.id === assemblyKitId);
    if (!kit || !kit.components) {
      setCheckingStock(false);
      return;
    }

    const supabase = createClient();
    const qty = parseInt(assemblyQty) || 1;
    const stocks: ComponentStock[] = [];

    for (const comp of kit.components) {
      const { data: lots } = await supabase
        .from('lots')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('product_id', comp.component_product_id)
        .eq('status', 'active')
        .gt('quantity_on_hand', 0);

      const totalAvailable = (lots || []).reduce((sum, l) => sum + l.quantity_on_hand, 0);
      const required = comp.quantity * qty;

      stocks.push({
        component: comp,
        available: totalAvailable,
        required,
        sufficient: totalAvailable >= required,
      });
    }

    setComponentStocks(stocks);
    setCheckingStock(false);
  }

  useEffect(() => {
    if (assemblyKitId && assemblyQty) {
      checkStock();
    }
  }, [assemblyKitId, assemblyQty]);

  async function performAssembly() {
    if (!tenantId || !user || !assemblyKitId) return;

    const kit = kits.find((k) => k.id === assemblyKitId);
    if (!kit || !kit.components) return;

    const qty = parseInt(assemblyQty) || 1;
    const allSufficient = componentStocks.every((s) => s.sufficient);

    if (!allSufficient) {
      toast.error('Insufficient stock for one or more components');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    try {
      // 1. Create assembly record
      const lotNumber = `KIT-${Date.now()}`;
      const { data: assembly, error: assemblyError } = await supabase
        .from('kit_assemblies')
        .insert({
          tenant_id: tenantId,
          kit_id: assemblyKitId,
          quantity_assembled: qty,
          assembled_by: user.id,
          assembled_at: new Date().toISOString(),
          lot_number: lotNumber,
          notes: assemblyNotes || null,
        })
        .select()
        .single();

      if (assemblyError || !assembly) throw new Error('Failed to create assembly');

      // 2. Pick and decrement component lots
      for (const comp of kit.components) {
        const requiredQty = comp.quantity * qty;

        const { data: availableLots } = await supabase
          .from('lots')
          .select('*')
          .eq('tenant_id', tenantId)
          .eq('product_id', comp.component_product_id)
          .eq('status', 'active')
          .gt('quantity_on_hand', 0)
          .order('expiration_date', { ascending: true, nullsFirst: false })
          .order('received_date', { ascending: true });

        const { picks, fulfilled } = pickLotsForQuantity(availableLots || [], requiredQty);

        if (!fulfilled) throw new Error(`Insufficient stock for ${comp.product?.name}`);

        for (const pick of picks) {
          // Decrement lot
          const newQty = pick.lot.quantity_on_hand - pick.pickQuantity;
          await supabase
            .from('lots')
            .update({
              quantity_on_hand: newQty,
              status: newQty <= 0 ? 'depleted' : 'active',
            })
            .eq('id', pick.lot.id);

          // Record stock movement
          await supabase.from('stock_movements').insert({
            tenant_id: tenantId,
            product_id: comp.component_product_id,
            lot_id: pick.lot.id,
            user_id: user.id,
            quantity: -pick.pickQuantity,
            movement_type: 'adjust',
            reason: `Kit assembly: ${kit.name} (x${qty})`,
            reference_number: lotNumber,
          });

          // Record assembly lot usage
          await supabase.from('kit_assembly_lots').insert({
            tenant_id: tenantId,
            assembly_id: assembly.id,
            component_product_id: comp.component_product_id,
            lot_id: pick.lot.id,
            quantity_used: pick.pickQuantity,
          });
        }
      }

      // 3. Create assembled lot for the kit product
      await supabase.from('lots').insert({
        tenant_id: tenantId,
        product_id: kit.product_id,
        lot_number: lotNumber,
        quantity_on_hand: qty,
        received_date: new Date().toISOString().split('T')[0],
        cost_at_receipt: 0,
        status: 'active',
      });

      // 4. Record inbound movement for kit product
      await supabase.from('stock_movements').insert({
        tenant_id: tenantId,
        product_id: kit.product_id,
        user_id: user.id,
        quantity: qty,
        movement_type: 'adjust',
        reason: `Kit assembled: ${kit.name}`,
        reference_number: lotNumber,
      });

      toast.success(`Assembled ${qty}x ${kit.name}`);
      setAssemblyDialogOpen(false);
      loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Assembly failed');
    } finally {
      setSaving(false);
    }
  }

  const kitColumns: Column<KitWithDetails>[] = [
    { key: 'name', label: 'Kit Name', sortable: true },
    {
      key: 'product',
      label: 'Product SKU',
      render: (row) => row.product ? `${row.product.sku} - ${row.product.name}` : '—',
    },
    {
      key: 'components',
      label: 'Components',
      render: (row) => (
        <Badge variant="secondary">{row.components?.length || 0} items</Badge>
      ),
    },
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
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => openKitDialog(row)}>
          Edit
        </Button>
      ),
    },
  ];

  const assemblyColumns: Column<typeof assemblies[0]>[] = [
    {
      key: 'kit',
      label: 'Kit',
      render: (row) => row.kit?.name || '—',
    },
    {
      key: 'quantity_assembled',
      label: 'Quantity',
      sortable: true,
      render: (row) => formatNumber(row.quantity_assembled),
    },
    {
      key: 'lot_number',
      label: 'Lot Number',
    },
    {
      key: 'assembled_at',
      label: 'Assembled',
      sortable: true,
      render: (row) => formatDateTime(row.assembled_at),
    },
    {
      key: 'notes',
      label: 'Notes',
      render: (row) => row.notes || '—',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Kitting" />
        <div className="text-muted-foreground">Loading kit data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Kitting"
        description="Manage kits and assemble products from components"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openAssemblyDialog} disabled={kits.length === 0}>
              <Play className="mr-2 h-4 w-4" />
              Assemble Kit
            </Button>
            <Button onClick={() => openKitDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              New Kit
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Kits</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={kits}
            columns={kitColumns}
            searchKey="name"
            searchPlaceholder="Search kits..."
            emptyMessage="No kits configured. Create one to get started."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assembly History</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={assemblies}
            columns={assemblyColumns}
            emptyMessage="No assemblies recorded yet."
          />
        </CardContent>
      </Card>

      {/* Kit Dialog */}
      <Dialog open={kitDialogOpen} onOpenChange={setKitDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editKit ? 'Edit' : 'New'} Kit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kit Name *</Label>
                <Input value={kitName} onChange={(e) => setKitName(e.target.value)} placeholder="Kit name" />
              </div>
              <div className="space-y-2">
                <Label>Kit Product *</Label>
                <Select value={kitProductId} onValueChange={setKitProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product for kit" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.sku} - {p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={kitDescription} onChange={(e) => setKitDescription(e.target.value)} placeholder="Optional description" />
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Components</Label>
                <Button variant="outline" size="sm" onClick={addComponent}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add Component
                </Button>
              </div>
              {kitComponents.length === 0 ? (
                <p className="text-sm text-muted-foreground">No components added yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="w-[120px]">Quantity</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kitComponents.map((comp, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={comp.product_id} onValueChange={(v) => updateComponent(idx, 'product_id', v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products
                                .filter((p) => p.id !== kitProductId)
                                .map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.sku} - {p.name}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={comp.quantity}
                            onChange={(e) => updateComponent(idx, 'quantity', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => removeComponent(idx)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKitDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveKit} disabled={saving}>{saving ? 'Saving...' : 'Save Kit'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assembly Dialog */}
      <Dialog open={assemblyDialogOpen} onOpenChange={setAssemblyDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assemble Kit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Select Kit *</Label>
                <Select value={assemblyKitId} onValueChange={setAssemblyKitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select kit" />
                  </SelectTrigger>
                  <SelectContent>
                    {kits.filter((k) => k.is_active).map((k) => (
                      <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  value={assemblyQty}
                  onChange={(e) => setAssemblyQty(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={assemblyNotes}
                onChange={(e) => setAssemblyNotes(e.target.value)}
                placeholder="Optional assembly notes"
                rows={2}
              />
            </div>

            {assemblyKitId && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label className="text-base font-semibold">Required Components</Label>
                  {checkingStock ? (
                    <p className="text-sm text-muted-foreground">Checking stock...</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead className="text-right">Required</TableHead>
                          <TableHead className="text-right">Available</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {componentStocks.map((cs, idx) => (
                          <TableRow key={idx}>
                            <TableCell>
                              {cs.component.product
                                ? `${cs.component.product.sku} - ${cs.component.product.name}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-right">{formatNumber(cs.required)}</TableCell>
                            <TableCell className="text-right">{formatNumber(cs.available)}</TableCell>
                            <TableCell className="text-right">
                              {cs.sufficient ? (
                                <Badge variant="default">OK</Badge>
                              ) : (
                                <Badge variant="destructive">
                                  <AlertTriangle className="mr-1 h-3 w-3" />
                                  Short {formatNumber(cs.required - cs.available)}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssemblyDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={performAssembly}
              disabled={saving || !assemblyKitId || componentStocks.some((s) => !s.sufficient)}
            >
              {saving ? 'Assembling...' : 'Assemble'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
