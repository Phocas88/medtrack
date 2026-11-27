'use client';

import { useEffect, useState, useCallback } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PackQuantity } from '@/components/workspace/pack-quantity';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { PurchaseOrder, Supplier, Product, Location } from '@/types/database';

const lineSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity_ordered: z.coerce.number().int().min(1, 'Qty must be at least 1'),
  unit_cost: z.coerce.number().min(0, 'Cost must be >= 0'),
  notes: z.string().optional(),
});

const schema = z.object({
  supplier_id: z.string().min(1, 'Supplier is required'),
  expected_date: z.string().optional(),
  location_id: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'At least one line item is required'),
});

type FormData = z.infer<typeof schema>;

function generatePONumber(): string {
  return 'PO-' + Date.now().toString(36).toUpperCase();
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: PurchaseOrder | null;
  onSaved: () => void;
}

export function PODialog({ open, onOpenChange, po, onSaved }: Props) {
  const { user, tenantId, role } = useAuth();
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplier_id: '',
      expected_date: '',
      location_id: '',
      notes: '',
      lines: [{ product_id: '', quantity_ordered: 1, unit_cost: 0, notes: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const watchLines = form.watch('lines');
  const total = watchLines.reduce(
    (sum, line) => sum + (line.quantity_ordered || 0) * (line.unit_cost || 0),
    0
  );

  const isEditable = !po || po.status === 'draft';
  const canApprove = (role === 'admin' || role === 'manager') && po?.status === 'pending_approval';

  const loadReferenceData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    const [suppRes, prodRes, locRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('locations').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
    ]);
    setSuppliers(suppRes.data || []);
    setProducts(prodRes.data || []);
    setLocations(locRes.data || []);
  }, [tenantId]);

  useEffect(() => {
    if (open) loadReferenceData();
  }, [open, loadReferenceData]);

  useEffect(() => {
    if (!open) return;
    if (po) {
      form.reset({
        supplier_id: po.supplier_id,
        expected_date: po.expected_date ? po.expected_date.split('T')[0] : '',
        location_id: po.location_id || '',
        notes: po.notes || '',
        lines: po.lines && po.lines.length > 0
          ? po.lines.map((l) => ({
              product_id: l.product_id,
              quantity_ordered: l.quantity_ordered,
              unit_cost: l.unit_cost,
              notes: l.notes || '',
            }))
          : [{ product_id: '', quantity_ordered: 1, unit_cost: 0, notes: '' }],
      });
    } else {
      form.reset({
        supplier_id: '',
        expected_date: '',
        location_id: '',
        notes: '',
        lines: [{ product_id: '', quantity_ordered: 1, unit_cost: 0, notes: '' }],
      });
    }
  }, [po, open, form]);

  function handleProductChange(index: number, productId: string) {
    form.setValue(`lines.${index}.product_id`, productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      form.setValue(`lines.${index}.unit_cost`, product.cost);
    }
  }

  async function onSubmit(data: FormData, submitStatus: 'draft' | 'pending_approval' = 'draft') {
    if (!tenantId || !user) return;
    setSaving(true);
    const supabase = createClient();

    const poFields = {
      supplier_id: data.supplier_id,
      expected_date: data.expected_date || null,
      location_id: data.location_id || null,
      notes: data.notes || null,
      total_amount: total,
      status: submitStatus,
    };

    try {
      if (po) {
        const { error } = await supabase
          .from('purchase_orders')
          .update(poFields)
          .eq('id', po.id);
        if (error) throw error;

        // Delete existing lines and re-insert
        await supabase.from('po_lines').delete().eq('po_id', po.id);
        const lineRows = data.lines.map((line) => ({
          tenant_id: tenantId,
          po_id: po.id,
          product_id: line.product_id,
          quantity_ordered: line.quantity_ordered,
          quantity_received: 0,
          unit_cost: line.unit_cost,
          notes: line.notes || null,
        }));
        const { error: lineErr } = await supabase.from('po_lines').insert(lineRows);
        if (lineErr) throw lineErr;

        toast.success('Purchase order updated');
      } else {
        const poNumber = generatePONumber();
        const { data: newPO, error } = await supabase
          .from('purchase_orders')
          .insert({
            ...poFields,
            tenant_id: tenantId,
            po_number: poNumber,
            order_date: new Date().toISOString(),
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;

        const lineRows = data.lines.map((line) => ({
          tenant_id: tenantId,
          po_id: newPO.id,
          product_id: line.product_id,
          quantity_ordered: line.quantity_ordered,
          quantity_received: 0,
          unit_cost: line.unit_cost,
          notes: line.notes || null,
        }));
        const { error: lineErr } = await supabase.from('po_lines').insert(lineRows);
        if (lineErr) throw lineErr;

        toast.success(`Purchase order ${poNumber} created`);
      }

      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save purchase order';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApproval(approved: boolean) {
    if (!po || !user) return;
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('purchase_orders')
      .update({
        status: approved ? 'approved' : 'cancelled',
        approved_by: approved ? user.id : null,
        approved_at: approved ? new Date().toISOString() : null,
      })
      .eq('id', po.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(approved ? 'Purchase order approved' : 'Purchase order rejected');
      onOpenChange(false);
      onSaved();
    }
    setSaving(false);
  }

  function statusBadge(status: string) {
    const map: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string; className?: string }> = {
      draft: { variant: 'secondary', label: 'Draft' },
      pending_approval: { variant: 'outline', label: 'Pending Approval', className: 'border-yellow-500 text-yellow-700' },
      approved: { variant: 'default', label: 'Approved' },
      sent: { variant: 'default', label: 'Sent', className: 'bg-blue-600' },
      partial: { variant: 'outline', label: 'Partial', className: 'border-amber-500 text-amber-700' },
      received: { variant: 'default', label: 'Received', className: 'bg-green-600' },
      cancelled: { variant: 'destructive', label: 'Cancelled' },
    };
    const cfg = map[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {po ? `PO ${po.po_number}` : 'New Purchase Order'}
            {po && statusBadge(po.status)}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((data) => onSubmit(data, 'draft'))}
          className="space-y-6"
        >
          {/* Header Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Supplier *</Label>
              <Select
                value={form.watch('supplier_id')}
                onValueChange={(v) => form.setValue('supplier_id', v, { shouldValidate: true })}
                disabled={!isEditable}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.supplier_id && (
                <p className="text-xs text-destructive">{form.formState.errors.supplier_id.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Expected Date</Label>
              <Input
                type="date"
                {...form.register('expected_date')}
                disabled={!isEditable}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={form.watch('location_id') || ''}
                onValueChange={(v) => form.setValue('location_id', v)}
                disabled={!isEditable}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                {...form.register('notes')}
                rows={2}
                disabled={!isEditable}
              />
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Line Items</Label>
              {isEditable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ product_id: '', quantity_ordered: 1, unit_cost: 0, notes: '' })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Line
                </Button>
              )}
            </div>

            {form.formState.errors.lines?.root && (
              <p className="text-xs text-destructive">{form.formState.errors.lines.root.message}</p>
            )}

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start p-3 border rounded-md bg-muted/30">
                  <div className="col-span-5 space-y-1">
                    <Label className="text-xs">Product *</Label>
                    <Select
                      value={form.watch(`lines.${index}.product_id`)}
                      onValueChange={(v) => handleProductChange(index, v)}
                      disabled={!isEditable}
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
                    {form.formState.errors.lines?.[index]?.product_id && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.lines[index]?.product_id?.message}
                      </p>
                    )}
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Stock units *</Label>
                    <Input
                      type="number"
                      min={1}
                      {...form.register(`lines.${index}.quantity_ordered`)}
                      disabled={!isEditable}
                    />
                    {isEditable && tenantId && watchLines[index]?.product_id && <PackQuantity
                      key={watchLines[index].product_id} tenantId={tenantId} productId={watchLines[index].product_id}
                      usage="purchase" onApply={quantity => form.setValue(`lines.${index}.quantity_ordered`, quantity, { shouldDirty: true, shouldValidate: true })} />}
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Cost per stock unit</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      {...form.register(`lines.${index}.unit_cost`)}
                      disabled={!isEditable}
                    />
                  </div>

                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Line Total</Label>
                    <div className="h-9 flex items-center text-sm font-medium">
                      {formatCurrency(
                        (watchLines[index]?.quantity_ordered || 0) *
                        (watchLines[index]?.unit_cost || 0)
                      )}
                    </div>
                  </div>

                  <div className="col-span-1 pt-5">
                    {isEditable && fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end text-lg font-semibold">
              Total: {formatCurrency(total)}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            {canApprove && (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleApproval(false)}
                  disabled={saving}
                >
                  Reject
                </Button>
                <Button
                  type="button"
                  onClick={() => handleApproval(true)}
                  disabled={saving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Approve
                </Button>
              </>
            )}

            {isEditable && (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save Draft'}
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={form.handleSubmit((data) => onSubmit(data, 'pending_approval'))}
                >
                  {saving ? 'Saving...' : 'Submit for Approval'}
                </Button>
              </>
            )}

            {!isEditable && !canApprove && (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
