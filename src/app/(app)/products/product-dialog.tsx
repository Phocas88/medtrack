'use client';

import { useEffect, useState } from 'react';
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
import { toast } from 'sonner';
import type { Product, Supplier } from '@/types/database';

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
  storage_requirement: z.enum(['room_temp', 'refrigerated', 'frozen']),
  is_lot_tracked: z.boolean(),
  is_serial_tracked: z.boolean(),
  expiry_alert_days: z.coerce.number().int().min(1),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSaved: () => void;
}

export function ProductDialog({ open, onOpenChange, product, onSaved }: Props) {
  const { tenantId } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);

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
        storage_requirement: product.storage_requirement,
        is_lot_tracked: product.is_lot_tracked,
        is_serial_tracked: product.is_serial_tracked,
        expiry_alert_days: product.expiry_alert_days,
        notes: product.notes || '',
      });
    } else {
      form.reset();
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'New Product'}</DialogTitle>
        </DialogHeader>

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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : product ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
