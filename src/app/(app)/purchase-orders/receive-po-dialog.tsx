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
import { toast } from 'sonner';
import { PackageCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { PurchaseOrder, POLine, Product } from '@/types/database';

interface ReceiveLine {
  po_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity_ordered: number;
  quantity_previously_received: number;
  remaining: number;
  quantity_to_receive: number;
  lot_number: string;
  expiration_date: string;
  location_bin: string;
  unit_cost: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  po: PurchaseOrder;
  onSaved: () => void;
}

export function ReceivePODialog({ open, onOpenChange, po, onSaved }: Props) {
  const { user, tenantId } = useAuth();
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !po) return;
    loadLines();
  }, [open, po]);

  async function loadLines() {
    setLoading(true);
    const supabase = createClient();
    const { data: poLines } = await supabase
      .from('po_lines')
      .select('*, product:products(*)')
      .eq('po_id', po.id)
      .order('created_at');

    if (!poLines) {
      setLines([]);
      setLoading(false);
      return;
    }

    const receiveLines: ReceiveLine[] = poLines.map((line: POLine & { product: Product }) => {
      const remaining = line.quantity_ordered - line.quantity_received;
      return {
        po_line_id: line.id,
        product_id: line.product_id,
        product_name: line.product?.name || 'Unknown',
        sku: line.product?.sku || '',
        quantity_ordered: line.quantity_ordered,
        quantity_previously_received: line.quantity_received,
        remaining,
        quantity_to_receive: 0,
        lot_number: '',
        expiration_date: '',
        location_bin: '',
        unit_cost: line.unit_cost,
      };
    });

    setLines(receiveLines);
    setLoading(false);
  }

  function updateLine(index: number, field: keyof ReceiveLine, value: string | number) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  async function handleReceive() {
    if (!tenantId || !user) return;

    const linesToReceive = lines.filter((l) => l.quantity_to_receive > 0);
    if (linesToReceive.length === 0) {
      toast.error('Enter a quantity to receive for at least one line');
      return;
    }

    // Validate
    for (const line of linesToReceive) {
      if (line.quantity_to_receive > line.remaining) {
        toast.error(`Cannot receive more than remaining qty for ${line.product_name}`);
        return;
      }
      if (!line.lot_number.trim()) {
        toast.error(`Lot number is required for ${line.product_name}`);
        return;
      }
    }

    setSaving(true);
    const supabase = createClient();

    try {
      for (const line of linesToReceive) {
        // Create lot record
        const { data: lot, error: lotErr } = await supabase
          .from('lots')
          .insert({
            tenant_id: tenantId,
            product_id: line.product_id,
            lot_number: line.lot_number,
            expiration_date: line.expiration_date || null,
            quantity_on_hand: line.quantity_to_receive,
            received_date: new Date().toISOString().split('T')[0],
            supplier_id: po.supplier_id,
            cost_at_receipt: line.unit_cost,
            location: line.location_bin || null,
            location_id: po.location_id || null,
            status: 'active',
          })
          .select('id')
          .single();
        if (lotErr) throw lotErr;

        // Create stock movement
        const { error: mvErr } = await supabase.from('stock_movements').insert({
          tenant_id: tenantId,
          product_id: line.product_id,
          lot_id: lot.id,
          user_id: user.id,
          quantity: line.quantity_to_receive,
          movement_type: 'receive',
          reason: `Received against PO ${po.po_number}`,
          reference_number: po.po_number,
          metadata: { po_id: po.id, po_line_id: line.po_line_id },
        });
        if (mvErr) throw mvErr;

        // Update po_line quantity_received
        const { error: lineErr } = await supabase
          .from('po_lines')
          .update({
            quantity_received: line.quantity_previously_received + line.quantity_to_receive,
          })
          .eq('id', line.po_line_id);
        if (lineErr) throw lineErr;
      }

      // Check if all lines are fully received
      const { data: updatedLines } = await supabase
        .from('po_lines')
        .select('quantity_ordered, quantity_received')
        .eq('po_id', po.id);

      const allReceived = updatedLines?.every(
        (l: { quantity_ordered: number; quantity_received: number }) => l.quantity_received >= l.quantity_ordered
      );
      const anyReceived = updatedLines?.some(
        (l: { quantity_ordered: number; quantity_received: number }) => l.quantity_received > 0
      );

      const newStatus = allReceived ? 'received' : anyReceived ? 'partial' : po.status;

      if (newStatus !== po.status) {
        await supabase
          .from('purchase_orders')
          .update({ status: newStatus })
          .eq('id', po.id);
      }

      toast.success('Items received successfully');
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to receive items';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            Receive Against {po.po_number}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : lines.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No lines found</div>
        ) : (
          <div className="space-y-4">
            {lines.map((line, index) => (
              <div
                key={line.po_line_id}
                className={`p-4 border rounded-lg space-y-3 ${
                  line.remaining === 0 ? 'opacity-50 bg-muted/50' : 'bg-muted/20'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{line.product_name}</span>
                    <span className="text-sm text-muted-foreground ml-2">({line.sku})</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {formatCurrency(line.unit_cost)} / unit
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Ordered:</span>{' '}
                    <span className="font-medium">{line.quantity_ordered}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Received:</span>{' '}
                    <span className="font-medium">{line.quantity_previously_received}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Remaining:</span>{' '}
                    <span className="font-medium">{line.remaining}</span>
                  </div>
                </div>

                {line.remaining > 0 && (
                  <div className="grid grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Qty to Receive</Label>
                      <Input
                        type="number"
                        min={0}
                        max={line.remaining}
                        value={line.quantity_to_receive || ''}
                        onChange={(e) =>
                          updateLine(index, 'quantity_to_receive', parseInt(e.target.value) || 0)
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Lot Number *</Label>
                      <Input
                        value={line.lot_number}
                        onChange={(e) => updateLine(index, 'lot_number', e.target.value)}
                        placeholder="LOT-001"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Expiration Date</Label>
                      <Input
                        type="date"
                        value={line.expiration_date}
                        onChange={(e) => updateLine(index, 'expiration_date', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Location / Bin</Label>
                      <Input
                        value={line.location_bin}
                        onChange={(e) => updateLine(index, 'location_bin', e.target.value)}
                        placeholder="A-1-01"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleReceive} disabled={saving}>
                {saving ? 'Receiving...' : 'Receive Items'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
