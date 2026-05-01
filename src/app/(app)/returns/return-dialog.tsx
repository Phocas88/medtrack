'use client';

import { useEffect, useState } from 'react';
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
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type {
  Product,
  Customer,
  Supplier,
  Lot,
  ReturnType,
  ReturnDisposition,
} from '@/types/database';

interface ReturnLineInput {
  product_id: string;
  lot_id: string;
  quantity: number;
  disposition: ReturnDisposition | '';
  reason: string;
}

function emptyLine(): ReturnLineInput {
  return { product_id: '', lot_id: '', quantity: 1, disposition: '', reason: '' };
}

function generateReturnNumber(type: ReturnType): string {
  const prefix = type === 'customer_return' ? 'RET-' : 'RMA-';
  return prefix + Date.now().toString(36).toUpperCase();
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ReturnDialog({ open, onOpenChange, onSaved }: Props) {
  const { user, tenantId } = useAuth();
  const [saving, setSaving] = useState(false);

  const [returnType, setReturnType] = useState<ReturnType>('customer_return');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<ReturnLineInput[]>([emptyLine()]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lotsMap, setLotsMap] = useState<Record<string, Lot[]>>({});

  useEffect(() => {
    if (!tenantId || !open) return;
    const supabase = createClient();

    supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name')
      .then(({ data }) => setCustomers(data || []));

    supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name')
      .then(({ data }) => setSuppliers(data || []));

    supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name')
      .then(({ data }) => setProducts(data || []));
  }, [tenantId, open]);

  // Load lots when a product is selected in a line
  async function loadLotsForProduct(productId: string) {
    if (!tenantId || lotsMap[productId]) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('lots')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('product_id', productId)
      .in('status', ['active', 'expired'])
      .order('lot_number');
    setLotsMap((prev) => ({ ...prev, [productId]: data || [] }));
  }

  function updateLine(index: number, updates: Partial<ReturnLineInput>) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...updates } : line))
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function calculateCreditAmount(): number {
    return lines.reduce((total, line) => {
      const product = products.find((p) => p.id === line.product_id);
      if (!product) return total;
      return total + product.price * line.quantity;
    }, 0);
  }

  function resetForm() {
    setReturnType('customer_return');
    setCustomerId('');
    setSupplierId('');
    setReason('');
    setLines([emptyLine()]);
  }

  async function handleSubmit() {
    if (!tenantId || !user) return;

    // Validate
    if (returnType === 'customer_return' && !customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (returnType === 'supplier_rma' && !supplierId) {
      toast.error('Please select a supplier');
      return;
    }

    const validLines = lines.filter((l) => l.product_id && l.quantity > 0 && l.disposition);
    if (validLines.length === 0) {
      toast.error('Add at least one line item with a product, quantity, and disposition');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const returnNumber = generateReturnNumber(returnType);
    const creditAmount = calculateCreditAmount();

    // Create return header
    const { data: ret, error: retError } = await supabase
      .from('returns')
      .insert({
        tenant_id: tenantId,
        return_number: returnNumber,
        return_type: returnType,
        status: 'completed' as const,
        customer_id: returnType === 'customer_return' ? customerId : null,
        supplier_id: returnType === 'supplier_rma' ? supplierId : null,
        reason: reason || null,
        credit_amount: creditAmount,
        inspected_by: user.id,
        inspected_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select()
      .single();

    if (retError) {
      toast.error(retError.message);
      setSaving(false);
      return;
    }

    // Process each line
    for (const line of validLines) {
      const disposition = line.disposition as ReturnDisposition;

      // Insert return line
      await supabase.from('return_lines').insert({
        tenant_id: tenantId,
        return_id: ret.id,
        product_id: line.product_id,
        lot_id: line.lot_id || null,
        quantity: line.quantity,
        disposition,
        reason: line.reason || null,
      });

      if (disposition === 'restock' && line.lot_id) {
        // Add quantity back to lot
        const { data: lot } = await supabase
          .from('lots')
          .select('quantity_on_hand')
          .eq('id', line.lot_id)
          .single();

        if (lot) {
          await supabase
            .from('lots')
            .update({ quantity_on_hand: lot.quantity_on_hand + line.quantity })
            .eq('id', line.lot_id);
        }

        // Create stock movement
        await supabase.from('stock_movements').insert({
          tenant_id: tenantId,
          product_id: line.product_id,
          lot_id: line.lot_id,
          user_id: user.id,
          quantity: line.quantity,
          movement_type: 'return',
          reason: `Return ${returnNumber} - restocked`,
          reference_number: returnNumber,
        });
      } else if (disposition === 'quarantine') {
        // Create quarantine hold
        await supabase.from('quarantine_holds').insert({
          tenant_id: tenantId,
          lot_id: line.lot_id || null,
          product_id: line.product_id,
          status: 'held',
          reason: line.reason || reason || 'Return - pending inspection',
          quantity: line.quantity,
          held_by: user.id,
          held_at: new Date().toISOString(),
        });
      } else if (disposition === 'destroy') {
        // Record negative adjustment for destroyed items
        await supabase.from('stock_movements').insert({
          tenant_id: tenantId,
          product_id: line.product_id,
          lot_id: line.lot_id || null,
          user_id: user.id,
          quantity: -line.quantity,
          movement_type: 'adjust',
          reason: `Return ${returnNumber} - destroyed`,
          reference_number: returnNumber,
        });
      }
    }

    toast.success(`Return ${returnNumber} processed successfully`);
    resetForm();
    onOpenChange(false);
    onSaved();
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Return</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Return Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Return Type</Label>
              <Select
                value={returnType}
                onValueChange={(v) => setReturnType(v as ReturnType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_return">Customer Return</SelectItem>
                  <SelectItem value="supplier_rma">Supplier RMA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {returnType === 'customer_return' ? (
              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="General reason for this return..."
            />
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Line Items</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Line
              </Button>
            </div>

            {lines.map((line, index) => (
              <div
                key={index}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Line {index + 1}
                  </span>
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeLine(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Product *</Label>
                    <Select
                      value={line.product_id}
                      onValueChange={(v) => {
                        updateLine(index, { product_id: v, lot_id: '' });
                        loadLotsForProduct(v);
                      }}
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

                  <div className="space-y-1">
                    <Label className="text-xs">Lot (optional)</Label>
                    <Select
                      value={line.lot_id}
                      onValueChange={(v) =>
                        updateLine(index, { lot_id: v === 'none' ? '' : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select lot" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No specific lot</SelectItem>
                        {(lotsMap[line.product_id] || []).map((lot) => (
                          <SelectItem key={lot.id} value={lot.id}>
                            {lot.lot_number} (Qty: {lot.quantity_on_hand})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Quantity *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(index, { quantity: parseInt(e.target.value) || 1 })
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Disposition *</Label>
                    <Select
                      value={line.disposition}
                      onValueChange={(v) =>
                        updateLine(index, { disposition: v as ReturnDisposition })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select disposition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="restock">Restock</SelectItem>
                        <SelectItem value="quarantine">Quarantine</SelectItem>
                        <SelectItem value="destroy">Destroy</SelectItem>
                        <SelectItem value="return_to_supplier">
                          Return to Supplier
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Line Reason</Label>
                    <Input
                      value={line.reason}
                      onChange={(e) =>
                        updateLine(index, { reason: e.target.value })
                      }
                      placeholder="Reason for this line..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Credit Amount */}
          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm font-medium">Credit Amount</span>
            <span className="text-lg font-semibold">
              {formatCurrency(calculateCreditAmount())}
            </span>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Processing...' : 'Process Return'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
