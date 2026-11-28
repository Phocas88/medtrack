'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import type { Product, Supplier, ProductUomConversion, ProductBinAssignment, Bin } from '@/types/database';

// ── Product form schema (unchanged) ──

const stockLevel = z.string().regex(/^(?:[0-9]+)?$/, 'Enter a whole number or leave blank')
  .refine((value) => Number(value) <= 2147483647, 'Enter a smaller value');

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  sku: z.string().min(1, 'SKU is required'),
  manufacturer: z.string().optional(),
  category: z.string().optional(),
  supplier_id: z.string().optional(),
  unit_of_measure: z.string().min(1),
  cost: z.coerce.number().min(0),
  price: z.coerce.number().min(0),
  low_stock_threshold: z.coerce.number().int().min(0),
  par_level_min: stockLevel,
  par_level_max: stockLevel,
  stock_rotation: z.enum(['FIFO', 'FEFO', 'LIFO']),
  storage_requirement: z.enum(['room_temp', 'refrigerated', 'frozen']),
  is_lot_tracked: z.boolean(),
  is_serial_tracked: z.boolean(),
  expiry_alert_days: z.coerce.number().int().min(1),
  notes: z.string().optional(),
}).refine((data) => !data.par_level_max || Number(data.par_level_max) >= Number(data.par_level_min), {
  path: ['par_level_max'], message: 'Maximum must be at least the minimum',
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
}

// ── Inline types for joined data ──

type UomRow = ProductUomConversion;

interface BinAssignmentRow extends ProductBinAssignment {
  bin?: Bin & { zone?: { id: string; name: string; code: string }; location?: { id: string; name: string; code: string } };
}

type BinOption = Omit<Bin, 'zone' | 'location'> & {
  zone?: { id: string; name: string; code: string } | null;
  location?: { id: string; name: string; code: string } | null;
};

// ── Main dialog ──

export function ProductDialog({ open, onOpenChange, product, onSaved }: Props) {
  const { tenantId } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      sku: '',
      manufacturer: '',
      category: '',
      supplier_id: '',
      unit_of_measure: 'each',
      cost: 0,
      price: 0,
      low_stock_threshold: 10,
      par_level_min: '',
      par_level_max: '',
      stock_rotation: 'FEFO',
      storage_requirement: 'room_temp',
      is_lot_tracked: true,
      is_serial_tracked: false,
      expiry_alert_days: 90,
      notes: '',
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();
    supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name')
      .then(({ data }) => setSuppliers(data || []));
  }, [tenantId]);

  useEffect(() => {
    if (product) {
      form.reset({
        name: product.name,
        sku: product.sku,
        manufacturer: product.manufacturer || '',
        category: product.category || '',
        supplier_id: product.supplier_id || '',
        unit_of_measure: product.unit_of_measure,
        cost: product.cost,
        price: product.price,
        low_stock_threshold: product.low_stock_threshold,
        par_level_min: product.par_level_min?.toString() ?? '',
        par_level_max: product.par_level_max?.toString() ?? '',
        stock_rotation: product.stock_rotation ?? 'FEFO',
        storage_requirement: product.storage_requirement,
        is_lot_tracked: product.is_lot_tracked,
        is_serial_tracked: product.is_serial_tracked,
        expiry_alert_days: product.expiry_alert_days,
        notes: product.notes || '',
      });
    } else {
      form.reset();
    }
    setActiveTab('details');
  }, [product, open]);

  async function onSubmit(data: FormData) {
    if (!tenantId) return;
    setSaving(true);
    const supabase = createClient();

    const fields = {
      name: data.name,
      sku: data.sku,
      manufacturer: data.manufacturer || null,
      category: data.category || null,
      supplier_id: data.supplier_id && data.supplier_id !== 'none' ? data.supplier_id : null,
      unit_of_measure: data.unit_of_measure,
      cost: data.cost,
      price: data.price,
      low_stock_threshold: data.low_stock_threshold,
      par_level_min: data.par_level_min === '' ? null : Number(data.par_level_min),
      par_level_max: data.par_level_max === '' ? null : Number(data.par_level_max),
      stock_rotation: data.stock_rotation,
      storage_requirement: data.storage_requirement,
      is_lot_tracked: data.is_lot_tracked,
      is_serial_tracked: data.is_serial_tracked,
      expiry_alert_days: data.expiry_alert_days,
      notes: data.notes || null,
    };

    if (product) {
      const { error } = await supabase
        .from('products')
        .update(fields)
        .eq('id', product.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Product updated');
    } else {
      const { error } = await supabase
        .from('products')
        .insert({ ...fields, tenant_id: tenantId! });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Product created');
    }

    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  const isEditing = !!product;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'New Product'}</DialogTitle>
        </DialogHeader>

        {isEditing ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="uom-bins">UOM &amp; Bins</TabsTrigger>
            </TabsList>

            <TabsContent value="details">
              <ProductDetailsForm
                form={form}
                suppliers={suppliers}
                saving={saving}
                product={product}
                onSubmit={onSubmit}
                onCancel={() => onOpenChange(false)}
              />
            </TabsContent>

            <TabsContent value="uom-bins">
              <div className="space-y-8">
                <UomSection productId={product.id} tenantId={tenantId!} />
                <BinAssignmentsSection productId={product.id} tenantId={tenantId!} />
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <ProductDetailsForm
            form={form}
            suppliers={suppliers}
            saving={saving}
            product={product}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Extracted product details form (the original form, unchanged) ──

function ProductDetailsForm({
  form,
  suppliers,
  saving,
  product,
  onSubmit,
  onCancel,
}: {
  form: ReturnType<typeof useForm<FormData>>;
  suppliers: Supplier[];
  saving: boolean;
  product: Product | null;
  onSubmit: (data: FormData) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Product Name *</Label>
          <Input {...form.register('name')} />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>SKU *</Label>
          <Input {...form.register('sku')} />
          {form.formState.errors.sku && (
            <p className="text-xs text-destructive">{form.formState.errors.sku.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Manufacturer</Label>
          <Input {...form.register('manufacturer')} />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Input {...form.register('category')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Supplier</Label>
          <Select
            value={form.watch('supplier_id')}
            onValueChange={(v) => form.setValue('supplier_id', v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unit of Measure</Label>
          <Input {...form.register('unit_of_measure')} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Cost ($)</Label>
          <Input type="number" step="0.01" {...form.register('cost')} />
        </div>
        <div className="space-y-2">
          <Label>Price ($)</Label>
          <Input type="number" step="0.01" {...form.register('price')} />
        </div>
        <div className="space-y-2">
          <Label>Low Stock Threshold</Label>
          <Input type="number" {...form.register('low_stock_threshold')} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="product-minimum-stock">Total Minimum Stock</Label>
          <Input id="product-minimum-stock" type="number" min={0} step={1} placeholder="Use reorder point" {...form.register('par_level_min')} />
          {form.formState.errors.par_level_min && <p role="alert" className="text-sm text-destructive">{form.formState.errors.par_level_min.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="product-maximum-stock">Total Maximum Stock</Label>
          <Input id="product-maximum-stock" type="number" min={0} step={1} placeholder="Optional" {...form.register('par_level_max')} />
          {form.formState.errors.par_level_max && <p role="alert" className="text-sm text-destructive">{form.formState.errors.par_level_max.message}</p>}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="product-stock-rotation">Stock Rotation</Label>
        <select id="product-stock-rotation" className="block min-h-10 w-full rounded-md border bg-background px-3" {...form.register('stock_rotation')}>
          <option value="FEFO">FEFO · Earliest expiry first</option>
          <option value="FIFO">FIFO · Oldest received first</option>
          <option value="LIFO">LIFO · Newest received first</option>
        </select>
        <p className="text-xs text-muted-foreground">Applies to outbound lot selection. Accounting valuation stays separate.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Storage Requirement</Label>
          <Select
            value={form.watch('storage_requirement')}
            onValueChange={(v) => form.setValue('storage_requirement', v as 'room_temp' | 'refrigerated' | 'frozen')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="room_temp">Room Temperature</SelectItem>
              <SelectItem value="refrigerated">Refrigerated</SelectItem>
              <SelectItem value="frozen">Frozen</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Expiry Alert (days)</Label>
          <Input type="number" {...form.register('expiry_alert_days')} />
        </div>
      </div>

      <div className="flex gap-8">
        <div className="flex items-center gap-2">
          <Switch
            checked={form.watch('is_lot_tracked')}
            onCheckedChange={(v) => form.setValue('is_lot_tracked', v)}
          />
          <Label>Lot Tracked</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.watch('is_serial_tracked')}
            onCheckedChange={(v) => form.setValue('is_serial_tracked', v)}
          />
          <Label>Serial Tracked</Label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea {...form.register('notes')} rows={3} />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : product ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}

// ── UOM Section ──

const UOM_PRESETS = ['each', 'inner', 'case', 'box', 'pallet'];

function UomSection({ productId, tenantId }: { productId: string; tenantId: string }) {
  const [uoms, setUoms] = useState<UomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [savingUom, setSavingUom] = useState(false);
  const [editingBarcodeId, setEditingBarcodeId] = useState<string | null>(null);
  const [editBarcodeValue, setEditBarcodeValue] = useState('');

  // New UOM form state
  const [newUomName, setNewUomName] = useState('each');
  const [newCustomName, setNewCustomName] = useState('');
  const [newFactor, setNewFactor] = useState('1');
  const [newBarcode, setNewBarcode] = useState('');
  const [newIsDefault, setNewIsDefault] = useState(false);

  const fetchUoms = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('product_uom_conversions')
      .select('*')
      .eq('product_id', productId)
      .order('conversion_factor', { ascending: true });
    setUoms(data || []);
    setLoading(false);
  }, [productId]);

  useEffect(() => { fetchUoms(); }, [fetchUoms]);

  async function handleAddUom() {
    const uomName = newUomName === '_custom' ? newCustomName.trim() : newUomName;
    if (!uomName) { toast.error('UOM name is required'); return; }
    const factor = parseFloat(newFactor);
    if (isNaN(factor) || factor <= 0) { toast.error('Conversion factor must be > 0'); return; }

    setSavingUom(true);
    const supabase = createClient();

    // If setting as default, unset other defaults first
    if (newIsDefault) {
      await supabase
        .from('product_uom_conversions')
        .update({ is_default: false })
        .eq('product_id', productId);
    }

    const { error } = await supabase.from('product_uom_conversions').insert({
      tenant_id: tenantId,
      product_id: productId,
      uom_name: uomName,
      conversion_factor: factor,
      barcode: newBarcode.trim() || null,
      is_default: newIsDefault,
      is_orderable: true,
      is_sellable: true,
    });

    if (error) { toast.error(error.message); }
    else {
      toast.success('UOM added');
      setAdding(false);
      setNewUomName('each');
      setNewCustomName('');
      setNewFactor('1');
      setNewBarcode('');
      setNewIsDefault(false);
      fetchUoms();
    }
    setSavingUom(false);
  }

  async function handleDeleteUom(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('product_uom_conversions').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('UOM removed'); fetchUoms(); }
  }

  async function handleSaveBarcode(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('product_uom_conversions')
      .update({ barcode: editBarcodeValue.trim() || null })
      .eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Barcode updated'); setEditingBarcodeId(null); fetchUoms(); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Units of Measure</h3>
        {!adding && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add UOM
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>UOM Name</TableHead>
              <TableHead>Factor</TableHead>
              <TableHead>UPC / GTIN</TableHead>
              <TableHead>Default</TableHead>
              <TableHead>Orderable</TableHead>
              <TableHead>Sellable</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {uoms.map((uom) => (
              <TableRow key={uom.id}>
                <TableCell className="font-medium capitalize">{uom.uom_name}</TableCell>
                <TableCell>{uom.conversion_factor} each</TableCell>
                <TableCell>
                  {editingBarcodeId === uom.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editBarcodeValue}
                        onChange={(e) => setEditBarcodeValue(e.target.value)}
                        className="h-7 text-xs w-40"
                        placeholder="Enter UPC/GTIN"
                        autoFocus
                      />
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleSaveBarcode(uom.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingBarcodeId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => { setEditingBarcodeId(uom.id); setEditBarcodeValue(uom.barcode || ''); }}
                    >
                      {uom.barcode || <span className="italic">click to add</span>}
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </TableCell>
                <TableCell>
                  {uom.is_default && <Badge variant="default">Default</Badge>}
                </TableCell>
                <TableCell>
                  {uom.is_orderable ? <Badge variant="secondary">Yes</Badge> : <span className="text-xs text-muted-foreground">No</span>}
                </TableCell>
                <TableCell>
                  {uom.is_sellable ? <Badge variant="secondary">Yes</Badge> : <span className="text-xs text-muted-foreground">No</span>}
                </TableCell>
                <TableCell>
                  <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteUom(uom.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {uoms.length === 0 && !adding && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                  No UOM conversions defined. Add one to track multiple packaging levels.
                </TableCell>
              </TableRow>
            )}

            {/* Inline add row */}
            {adding && (
              <TableRow>
                <TableCell>
                  <Select value={newUomName} onValueChange={setNewUomName}>
                    <SelectTrigger className="h-8 text-xs w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UOM_PRESETS.map((u) => (
                        <SelectItem key={u} value={u} className="capitalize">{u}</SelectItem>
                      ))}
                      <SelectItem value="_custom">Custom...</SelectItem>
                    </SelectContent>
                  </Select>
                  {newUomName === '_custom' && (
                    <Input
                      value={newCustomName}
                      onChange={(e) => setNewCustomName(e.target.value)}
                      placeholder="Custom name"
                      className="h-7 text-xs mt-1 w-28"
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Input
                    value={newFactor}
                    onChange={(e) => setNewFactor(e.target.value)}
                    type="number"
                    min="1"
                    step="1"
                    className="h-8 text-xs w-20"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                    placeholder="UPC/GTIN"
                    className="h-8 text-xs w-36"
                  />
                </TableCell>
                <TableCell>
                  <Switch checked={newIsDefault} onCheckedChange={setNewIsDefault} />
                </TableCell>
                <TableCell colSpan={2} />
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleAddUom} disabled={savingUom}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setAdding(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ── Bin Assignments Section ──

function BinAssignmentsSection({ productId, tenantId }: { productId: string; tenantId: string }) {
  const [assignments, setAssignments] = useState<BinAssignmentRow[]>([]);
  const [uoms, setUoms] = useState<UomRow[]>([]);
  const [bins, setBins] = useState<BinOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [savingBin, setSavingBin] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMin, setEditMin] = useState('');
  const [editMax, setEditMax] = useState('');
  const [editReorder, setEditReorder] = useState('');

  // New assignment form state
  const [newBinId, setNewBinId] = useState('');
  const [newRole, setNewRole] = useState<'primary' | 'secondary'>('primary');
  const [newUom, setNewUom] = useState('');
  const [newMin, setNewMin] = useState('0');
  const [newMax, setNewMax] = useState('100');
  const [newReorder, setNewReorder] = useState('10');

  const fetchAll = useCallback(async () => {
    const supabase = createClient();

    const [assignRes, uomRes, binRes] = await Promise.all([
      supabase
        .from('product_bin_assignments')
        .select('*, bin:bins(id, bin_code, bin_type, location_id, zone_id, zone:zones(id, name, code), location:locations(id, name, code))')
        .eq('product_id', productId)
        .eq('is_active', true)
        .order('bin_role', { ascending: true }),
      supabase
        .from('product_uom_conversions')
        .select('*')
        .eq('product_id', productId)
        .order('conversion_factor', { ascending: true }),
      supabase
        .from('bins')
        .select('*, zone:zones(id, name, code), location:locations(id, name, code)')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('bin_code'),
    ]);

    setAssignments((assignRes.data || []) as BinAssignmentRow[]);
    setUoms(uomRes.data || []);
    setBins((binRes.data || []) as BinOption[]);
    setLoading(false);
  }, [productId, tenantId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Sort bins: for reserve role, show bins in the same zone as existing primary bins first
  function getSortedBins() {
    if (newRole !== 'secondary') return bins;

    const primaryZoneIds = new Set(
      assignments
        .filter((a) => a.bin_role === 'primary' && a.bin?.zone_id)
        .map((a) => a.bin!.zone_id)
    );

    if (primaryZoneIds.size === 0) return bins;

    return [...bins].sort((a, b) => {
      const aInZone = a.zone_id && primaryZoneIds.has(a.zone_id) ? 0 : 1;
      const bInZone = b.zone_id && primaryZoneIds.has(b.zone_id) ? 0 : 1;
      return aInZone - bInZone;
    });
  }

  async function handleAddAssignment() {
    if (!newBinId) { toast.error('Select a bin'); return; }
    if (!newUom) { toast.error('Select a UOM'); return; }

    setSavingBin(true);
    const supabase = createClient();

    const { error } = await supabase.from('product_bin_assignments').insert({
      tenant_id: tenantId,
      product_id: productId,
      bin_id: newBinId,
      bin_role: newRole,
      unit_of_measure: newUom,
      min_quantity: Number(newMin),
      max_quantity: Number(newMax),
      reorder_point: Number(newReorder),
      is_active: true,
    });

    if (error) toast.error(error.message);
    else {
      toast.success('Bin assigned');
      setAdding(false);
      setNewBinId('');
      setNewRole('primary');
      setNewUom('');
      setNewMin('0');
      setNewMax('100');
      setNewReorder('10');
      fetchAll();
    }
    setSavingBin(false);
  }

  async function handleDeleteAssignment(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from('product_bin_assignments').update({ is_active: false }).eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Bin unassigned'); fetchAll(); }
  }

  async function handleSaveEdit(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('product_bin_assignments')
      .update({
        min_quantity: Number(editMin),
        max_quantity: Number(editMax),
        reorder_point: Number(editReorder),
      })
      .eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Updated'); setEditingId(null); fetchAll(); }
  }

  function startEdit(a: BinAssignmentRow) {
    setEditingId(a.id);
    setEditMin(String(a.min_quantity));
    setEditMax(String(a.max_quantity));
    setEditReorder(String(a.reorder_point));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Bin Assignments</h3>
        {!adding && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Assign Bin
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bin Code</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead>Min</TableHead>
                <TableHead>Max</TableHead>
                <TableHead>Reorder Pt</TableHead>
                <TableHead>Location / Zone</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium font-mono">{a.bin?.bin_code || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={a.bin_role === 'primary' ? 'default' : 'secondary'}>
                      {a.bin_role === 'primary' ? 'Primary' : 'Reserve'}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{a.unit_of_measure}</TableCell>
                  {editingId === a.id ? (
                    <>
                      <TableCell>
                        <Input value={editMin} onChange={(e) => setEditMin(e.target.value)} type="number" className="h-7 text-xs w-16" />
                      </TableCell>
                      <TableCell>
                        <Input value={editMax} onChange={(e) => setEditMax(e.target.value)} type="number" className="h-7 text-xs w-16" />
                      </TableCell>
                      <TableCell>
                        <Input value={editReorder} onChange={(e) => setEditReorder(e.target.value)} type="number" className="h-7 text-xs w-16" />
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{a.min_quantity}</TableCell>
                      <TableCell>{a.max_quantity}</TableCell>
                      <TableCell>{a.reorder_point}</TableCell>
                    </>
                  )}
                  <TableCell className="text-xs text-muted-foreground">
                    {a.bin?.location?.name || '—'}
                    {a.bin?.zone ? ` / ${a.bin.zone.name}` : ''}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {editingId === a.id ? (
                        <>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleSaveEdit(a.id)}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(a)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteAssignment(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {assignments.length === 0 && !adding && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                    No bin assignments. Assign bins to define pick and replenishment locations.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Add assignment form */}
          {adding && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <h4 className="text-sm font-medium">Assign Bin</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Bin</Label>
                  <Select value={newBinId} onValueChange={setNewBinId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select bin" />
                    </SelectTrigger>
                    <SelectContent>
                      {getSortedBins().map((b) => {
                        const zoneName = b.zone?.name || '';
                        const locName = b.location?.name || '';
                        const label = `${b.bin_code} — ${locName}${zoneName ? ` / ${zoneName}` : ''}`;
                        // Highlight same-zone bins when picking reserve
                        const primaryZoneIds = new Set(
                          assignments
                            .filter((a) => a.bin_role === 'primary' && a.bin?.zone_id)
                            .map((a) => a.bin!.zone_id)
                        );
                        const isSameZone = newRole === 'secondary' && b.zone_id && primaryZoneIds.has(b.zone_id);
                        return (
                          <SelectItem key={b.id} value={b.id}>
                            <span className={isSameZone ? 'font-medium' : ''}>
                              {label}
                              {isSameZone ? ' (same zone)' : ''}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as 'primary' | 'secondary')}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="primary">Primary (pick)</SelectItem>
                      <SelectItem value="secondary">Reserve (replenish)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">UOM</Label>
                  <Select value={newUom} onValueChange={setNewUom}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select UOM" />
                    </SelectTrigger>
                    <SelectContent>
                      {uoms.map((u) => (
                        <SelectItem key={u.id} value={u.uom_name} className="capitalize">{u.uom_name} ({u.conversion_factor}x)</SelectItem>
                      ))}
                      {uoms.length === 0 && (
                        <SelectItem value="_none" disabled>Add UOM conversions first</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Min Qty</Label>
                  <Input value={newMin} onChange={(e) => setNewMin(e.target.value)} type="number" min="0" className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Max Qty</Label>
                  <Input value={newMax} onChange={(e) => setNewMax(e.target.value)} type="number" min="0" className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Reorder Point</Label>
                  <Input value={newReorder} onChange={(e) => setNewReorder(e.target.value)} type="number" min="0" className="h-8 text-xs" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
                <Button type="button" size="sm" onClick={handleAddAssignment} disabled={savingBin}>
                  {savingBin ? 'Saving...' : 'Assign'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
