'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Truck, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { Transfer, TransferLine, Location, Product, Lot } from '@/types/database';

function generateTransferNumber(): string {
  return 'TRF-' + Date.now().toString(36).toUpperCase();
}

interface LineItem {
  id?: string;
  product_id: string;
  lot_id: string | null;
  quantity: number;
  quantity_received: number;
  product_name?: string;
  lot_number?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transfer: (Transfer & { lines?: TransferLine[] }) | null;
  onSaved: () => void;
}

export function TransferDialog({ open, onOpenChange, transfer, onSaved }: Props) {
  const { tenantId, user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);

  const [fromLocationId, setFromLocationId] = useState('');
  const [toLocationId, setToLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);

  const isNew = !transfer;
  const isPending = transfer?.status === 'pending';
  const isInTransit = transfer?.status === 'in_transit';
  const isReceived = transfer?.status === 'received';

  const loadRefs = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    const [locRes, prodRes, lotRes] = await Promise.all([
      supabase.from('locations').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('lots').select('*').eq('tenant_id', tenantId).eq('status', 'active').order('lot_number'),
    ]);
    setLocations(locRes.data || []);
    setProducts(prodRes.data || []);
    setLots(lotRes.data || []);
  }, [tenantId]);

  useEffect(() => {
    if (open) loadRefs();
  }, [open, loadRefs]);

  useEffect(() => {
    if (transfer) {
      setFromLocationId(transfer.from_location_id);
      setToLocationId(transfer.to_location_id);
      setNotes(transfer.notes || '');
      setLines(
        (transfer.lines || []).map((l) => ({
          id: l.id,
          product_id: l.product_id,
          lot_id: l.lot_id,
          quantity: l.quantity,
          quantity_received: l.quantity_received,
          product_name: l.product?.name,
          lot_number: l.lot?.lot_number,
        }))
      );
    } else {
      setFromLocationId('');
      setToLocationId('');
      setNotes('');
      setLines([]);
    }
  }, [transfer, open]);

  function addLine() {
    setLines([...lines, { product_id: '', lot_id: null, quantity: 1, quantity_received: 0 }]);
  }

  function updateLine(index: number, field: keyof LineItem, value: string | number | null) {
    setLines(lines.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function removeLine(index: number) {
    setLines(lines.filter((_, i) => i !== index));
  }

  async function saveTransfer() {
    if (!tenantId) return;
    if (!fromLocationId || !toLocationId) {
      toast.error('Select both locations');
      return;
    }
    if (fromLocationId === toLocationId) {
      toast.error('From and To locations must be different');
      return;
    }
    if (lines.length === 0 || lines.some((l) => !l.product_id || l.quantity <= 0)) {
      toast.error('Add at least one valid line item');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const transferNumber = generateTransferNumber();
    const { data: newTransfer, error: tErr } = await supabase
      .from('transfers')
      .insert({
        tenant_id: tenantId,
        transfer_number: transferNumber,
        from_location_id: fromLocationId,
        to_location_id: toLocationId,
        status: 'pending' as const,
        initiated_by: user?.id || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (tErr || !newTransfer) {
      toast.error(tErr?.message || 'Failed to create transfer');
      setSaving(false);
      return;
    }

    const lineInserts = lines.map((l) => ({
      tenant_id: tenantId,
      transfer_id: newTransfer.id,
      product_id: l.product_id,
      lot_id: l.lot_id || null,
      quantity: l.quantity,
      quantity_received: 0,
    }));

    const { error: lErr } = await supabase.from('transfer_lines').insert(lineInserts);
    if (lErr) {
      toast.error(lErr.message);
      setSaving(false);
      return;
    }

    toast.success(`Transfer ${transferNumber} created`);
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  async function shipTransfer() {
    if (!transfer) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('transfers')
      .update({ status: 'in_transit', shipped_at: new Date().toISOString() })
      .eq('id', transfer.id);

    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Transfer shipped');
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  async function receiveTransfer() {
    if (!transfer || !tenantId) return;
    if (lines.some((l) => l.quantity_received < 0)) {
      toast.error('Received quantities cannot be negative');
      return;
    }
    setSaving(true);
    const supabase = createClient();

    // Update each transfer line with received qty
    for (const line of lines) {
      if (line.id) {
        await supabase
          .from('transfer_lines')
          .update({ quantity_received: line.quantity_received })
          .eq('id', line.id);
      }
    }

    // Update transfer status
    const { error: tErr } = await supabase
      .from('transfers')
      .update({
        status: 'received',
        received_by: user?.id || null,
        received_at: new Date().toISOString(),
      })
      .eq('id', transfer.id);

    if (tErr) { toast.error(tErr.message); setSaving(false); return; }

    // Create stock movements for each line
    const movements = [];
    for (const line of lines) {
      if (line.quantity_received > 0) {
        // Negative at source
        movements.push({
          tenant_id: tenantId,
          product_id: line.product_id,
          lot_id: line.lot_id || null,
          user_id: user?.id || '',
          quantity: -line.quantity_received,
          movement_type: 'ship' as const,
          reason: `Transfer ${transfer.transfer_number} - shipped`,
          reference_number: transfer.transfer_number,
          metadata: { transfer_id: transfer.id },
        });
        // Positive at destination
        movements.push({
          tenant_id: tenantId,
          product_id: line.product_id,
          lot_id: line.lot_id || null,
          user_id: user?.id || '',
          quantity: line.quantity_received,
          movement_type: 'receive' as const,
          reason: `Transfer ${transfer.transfer_number} - received`,
          reference_number: transfer.transfer_number,
          metadata: { transfer_id: transfer.id },
        });
      }
    }

    if (movements.length > 0) {
      const { error: mErr } = await supabase.from('stock_movements').insert(movements);
      if (mErr) {
        toast.error('Transfer received but stock movements failed: ' + mErr.message);
        setSaving(false);
        onOpenChange(false);
        onSaved();
        return;
      }
    }

    // Update lot locations for received items
    for (const line of lines) {
      if (line.lot_id && line.quantity_received > 0) {
        await supabase
          .from('lots')
          .update({ location_id: transfer.to_location_id })
          .eq('id', line.lot_id);
      }
    }

    toast.success('Transfer received and stock updated');
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  const statusLabel = transfer?.status
    ? transfer.status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '';

  const productName = (id: string) => products.find((p) => p.id === id)?.name || '—';
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name || '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isNew ? 'New Transfer' : `Transfer ${transfer.transfer_number}`}
            {!isNew && (
              <Badge
                variant={
                  transfer.status === 'received' ? 'default' :
                  transfer.status === 'in_transit' ? 'secondary' :
                  transfer.status === 'cancelled' ? 'destructive' : 'outline'
                }
                className="ml-3"
              >
                {statusLabel}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Locations */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>From Location *</Label>
              {isNew ? (
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium py-2">{locationName(transfer.from_location_id)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>To Location *</Label>
              {isNew ? (
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium py-2">{locationName(transfer.to_location_id)}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          {isNew && (
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
          )}
          {!isNew && transfer.notes && (
            <div className="text-sm text-muted-foreground">Notes: {transfer.notes}</div>
          )}

          {/* Line Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              {isNew && (
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              )}
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead className="w-[100px]">Qty</TableHead>
                    {isInTransit && <TableHead className="w-[100px]">Received</TableHead>}
                    {isReceived && <TableHead className="w-[100px]">Received</TableHead>}
                    {isNew && <TableHead className="w-[50px]"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isNew ? 4 : 3} className="h-16 text-center text-muted-foreground">
                        No items added
                      </TableCell>
                    </TableRow>
                  ) : (
                    lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          {isNew ? (
                            <Select value={line.product_id} onValueChange={(v) => updateLine(idx, 'product_id', v)}>
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Product" /></SelectTrigger>
                              <SelectContent>
                                {products.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">{line.product_name || productName(line.product_id)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isNew ? (
                            <Select
                              value={line.lot_id || '_none'}
                              onValueChange={(v) => updateLine(idx, 'lot_id', v === '_none' ? null : v)}
                            >
                              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Optional" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">No lot</SelectItem>
                                {lots
                                  .filter((l) => l.product_id === line.product_id)
                                  .map((l) => (
                                    <SelectItem key={l.id} value={l.id}>{l.lot_number} (qty: {l.quantity_on_hand})</SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm">{line.lot_number || '—'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isNew ? (
                            <Input
                              type="number"
                              min={1}
                              className="h-8 text-sm"
                              value={line.quantity}
                              onChange={(e) => updateLine(idx, 'quantity', parseInt(e.target.value) || 0)}
                            />
                          ) : (
                            <span className="text-sm">{line.quantity}</span>
                          )}
                        </TableCell>
                        {isInTransit && (
                          <TableCell>
                            <Input
                              type="number"
                              min={0}
                              max={line.quantity}
                              className="h-8 text-sm"
                              value={line.quantity_received}
                              onChange={(e) => updateLine(idx, 'quantity_received', parseInt(e.target.value) || 0)}
                            />
                          </TableCell>
                        )}
                        {isReceived && (
                          <TableCell>
                            <span className="text-sm">{line.quantity_received}</span>
                          </TableCell>
                        )}
                        {isNew && (
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => removeLine(idx)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {isReceived || transfer?.status === 'cancelled' ? 'Close' : 'Cancel'}
            </Button>
            {isNew && (
              <Button onClick={saveTransfer} disabled={saving}>
                {saving ? 'Saving...' : 'Create Transfer'}
              </Button>
            )}
            {isPending && (
              <Button onClick={shipTransfer} disabled={saving}>
                <Truck className="h-4 w-4 mr-2" />
                {saving ? 'Shipping...' : 'Ship Transfer'}
              </Button>
            )}
            {isInTransit && (
              <Button onClick={receiveTransfer} disabled={saving}>
                <PackageCheck className="h-4 w-4 mr-2" />
                {saving ? 'Receiving...' : 'Receive Transfer'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
