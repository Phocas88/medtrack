'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { PackageCheck, Info, Printer } from 'lucide-react';
import { generateReceivingDocumentPDF } from '@/lib/pdf';
import { formatCurrency } from '@/lib/format';
import type { PurchaseOrder, POLine, Product, Location } from '@/types/database';

interface ReceiveLine {
  po_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity_ordered: number;
  quantity_previously_received: number;
  remaining: number;
  quantity_to_receive: number;
  damaged_quantity: number;
  confirmed_shortage: boolean;
  discrepancy_note: string;
  lot_number: string;
  expiration_date: string;
  unit_cost: number;
}

interface Discrepancy {
  request_id: string;
  po_line_id: string;
  ordered_quantity: number;
  usable_quantity: number;
  damaged_quantity: number;
  remaining_quantity: number;
  confirmed_shortage: boolean;
  note: string | null;
  created_at: string;
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
  const [history, setHistory] = useState<Discrepancy[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [draftingLine, setDraftingLine] = useState<string | null>(null);
  const [handoff, setHandoff] = useState('');
  const canReceive = ['approved', 'sent', 'partial'].includes(po.status);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<Location[]>([]);
  const [receivingLocationId, setReceivingLocationId] = useState<string>('');

  useEffect(() => {
    if (!open || !po) return;
    setScanOpen(false);
    setScanMessage('');
    setHandoff('');
    setHistory([]);
    setHistoryError(false);
    loadLines();
    loadLocations();
  }, [open, po]);

  async function loadLocations() {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');

    const locs = data || [];
    setLocations(locs);
    if (!locs.length) setReceivingLocationId('');

    // Auto-select: prefer a dock/receiving location, else the PO's location, else first
    const dockLoc = locs.find(
      (l: Location) =>
        l.location_type?.toLowerCase().includes('dock') ||
        l.location_type?.toLowerCase().includes('receiving') ||
        l.name?.toLowerCase().includes('dock') ||
        l.name?.toLowerCase().includes('receiving')
    );
    if (dockLoc) {
      setReceivingLocationId(dockLoc.id);
    } else if (po.location_id && locs.find((l: Location) => l.id === po.location_id)) {
      setReceivingLocationId(po.location_id);
    } else if (locs.length > 0) {
      setReceivingLocationId(locs[0].id);
    }
  }

  async function loadLines() {
    setLoading(true);
    const supabase = createClient();
    const historyRequest = supabase.from('po_receiving_discrepancies')
      .select('request_id,po_line_id,ordered_quantity,usable_quantity,damaged_quantity,remaining_quantity,confirmed_shortage,note,created_at')
      .eq('tenant_id', tenantId).eq('po_id', po.id).order('created_at', { ascending: false }).limit(20);
    const [{ data: poLines }, historyResult] = await Promise.all([supabase
      .from('po_lines')
      .select('*, product:products(*)')
      .eq('tenant_id', tenantId).eq('po_id', po.id)
      .order('created_at'), historyRequest]);
    setHistory(historyResult.data || []);
    setHistoryError(!!historyResult.error);

    if (!poLines) {
      setLines([]);
      setLoading(false);
      return;
    }

    const receiveLines: ReceiveLine[] = poLines.map((line: POLine & { product: Product }) => {
      const previouslyReceived = line.quantity_received ?? 0;
      const remaining = line.quantity_ordered - previouslyReceived;
      return {
        po_line_id: line.id,
        product_id: line.product_id,
        product_name: line.product?.name || 'Unknown',
        sku: line.product?.sku || '',
        quantity_ordered: line.quantity_ordered,
        quantity_previously_received: previouslyReceived,
        remaining,
        quantity_to_receive: 0,
        damaged_quantity: 0,
        confirmed_shortage: false,
        discrepancy_note: '',
        lot_number: '',
        expiration_date: '',
        unit_cost: line.unit_cost,
      };
    });

    setLines(receiveLines);
    setLoading(false);
  }

  function updateLine(index: number, field: keyof ReceiveLine, value: string | number | boolean) {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function scanItem(value: string) {
    const fields = Object.fromEntries(value.trim().split('|').filter(part => /^(SKU|LOT|EXP):/.test(part))
      .map(part => [part.slice(0, 3), part.slice(4)]));
    const sku = fields.SKU ?? value.trim();
    const candidates = lines.filter(line => line.remaining > 0 && line.sku.toLowerCase() === sku.toLowerCase());
    if (candidates.length !== 1) {
      setScanMessage(candidates.length ? `SKU ${sku} has multiple open PO lines. Enter the quantity on the correct line.`
        : `SKU ${sku} does not match an open PO line. Set it aside for review.`);
      return;
    }
    const match = candidates[0];
    if ((fields.LOT && match.lot_number && fields.LOT !== match.lot_number) ||
        (fields.EXP && match.expiration_date && fields.EXP !== match.expiration_date)) {
      setScanMessage('This scan conflicts with the lot or expiration already entered. Post each lot separately.');
      return;
    }
    setLines(current => current.map(line => line.po_line_id === match.po_line_id ? {
      ...line, quantity_to_receive: line.quantity_to_receive + 1,
      lot_number: fields.LOT || line.lot_number, expiration_date: fields.EXP || line.expiration_date,
    } : line));
    setScanMessage(`Counted 1 usable unit of ${sku}. Move damaged units to the damaged quantity before posting.`);
    setScanOpen(false);
  }

  async function draftNotes(line: ReceiveLine) {
    const remaining = line.remaining - line.quantity_to_receive - line.damaged_quantity;
    if (remaining < 0 || (line.confirmed_shortage && remaining === 0)) {
      toast.error('Correct the delivery quantities before drafting a note.');
      return;
    }
    setDraftingLine(line.po_line_id);
    try {
      const response = await fetch('/api/receiving-discrepancy-draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poNumber: po.po_number, sku: line.sku, usable: line.quantity_to_receive,
          damaged: line.damaged_quantity, remaining,
          confirmedShortage: line.confirmed_shortage,
        }),
      });
      if (!response.ok) throw new Error('Draft unavailable');
      const { note, handoff } = await response.json();
      setLines(current => current.map(row => row.po_line_id === line.po_line_id ? { ...row, discrepancy_note: note } : row));
      setHandoff(handoff);
    } catch {
      toast.error('Could not draft the notes. You can enter the discrepancy note manually.');
    } finally {
      setDraftingLine(null);
    }
  }

  const receivingLocation = locations.find((l) => l.id === receivingLocationId);

  async function handleReceive() {
    if (!tenantId || !user || !canReceive || saving) return;

    if (!receivingLocationId) {
      toast.error('Select a receiving location');
      return;
    }

    const linesToReceive = lines.filter((l) => l.quantity_to_receive > 0 || l.damaged_quantity > 0 || l.confirmed_shortage);
    if (linesToReceive.length === 0) {
      toast.error('Enter a delivered quantity or confirm a shortage');
      return;
    }

    // Validate
    for (const line of linesToReceive) {
      const delivered = line.quantity_to_receive + line.damaged_quantity;
      if (![line.quantity_to_receive, line.damaged_quantity].every(qty => Number.isInteger(qty) && qty >= 0)) {
        toast.error('Enter nonnegative whole quantities');
        return;
      }
      if (line.confirmed_shortage && delivered >= line.remaining) {
        toast.error('Clear confirmed shortage for fully delivered lines');
        return;
      }
      if (delivered > line.remaining) {
        toast.error(`Cannot receive more than remaining qty for ${line.product_name}`);
        return;
      }
      if (delivered > 0 && !line.lot_number.trim()) {
        toast.error(`Lot number is required for ${line.product_name}`);
        return;
      }
    }

    setSaving(true);
    const supabase = createClient();

    try {
      const { error } = await supabase.rpc('receive_purchase_order', {
        p_request_id: requestId, p_po_id: po.id, p_location_id: receivingLocationId, p_lines: linesToReceive,
      });
      if (error) throw error;
      setRequestId(crypto.randomUUID());
      toast.success('Receiving review saved');
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Failed to receive items';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving && !draftingLine) onOpenChange(next); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="h-5 w-5" />
            {canReceive ? 'Receive against' : 'Receiving history for'} {po.po_number}
          </DialogTitle>
        </DialogHeader>

        {historyError && <p role="status" className="text-sm">Could not load discrepancy history.</p>}
        {history.length > 0 && (
          <section className="space-y-2" aria-label="Recent receiving discrepancies">
            <h3 className="text-sm font-semibold">Recent discrepancies</h3>
            <Link className="text-sm underline" href={`/warehouse-followups?po=${po.id}`}>View supplier follow-ups</Link>
            {history.map(row => (
              <div key={row.request_id + row.po_line_id} className="rounded border p-2 text-sm">
                <p>{lines.find(line => line.po_line_id === row.po_line_id)?.sku} · {row.created_at.slice(0, 10)} · {row.usable_quantity} usable · {row.damaged_quantity} damaged · {row.remaining_quantity} open{row.confirmed_shortage ? ' · Confirmed shortage' : ''}</p>
                {row.note && <p className="whitespace-pre-wrap break-words">{row.note}</p>}
              </div>
            ))}
          </section>
        )}
        {!canReceive ? (!loading && !history.length && !historyError && <p>No recorded receiving discrepancies.</p>) : loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : lines.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">No lines found</div>
        ) : (
          <fieldset disabled={saving || !!draftingLine} className="min-w-0 space-y-4">
            {/* Receiving Location Selector */}
            <div className="space-y-2">
              <Label>Receiving Location</Label>
              <Select disabled={saving || !!draftingLine} value={receivingLocationId} onValueChange={setReceivingLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select receiving location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code}) - {loc.location_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Info banner */}
            {receivingLocation && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-sm">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  Items will be received to <span className="font-medium">{receivingLocation.name}</span> and
                  put-away tasks will be generated automatically. Associates can then move items to their
                  assigned bins via the Put-Away page or Scanner.
                </div>
              </div>
            )}

            <Button type="button" variant="outline" disabled={saving} onClick={() => setScanOpen(value => !value)}>
              {scanOpen ? 'Close scanner' : 'Scan item'}
            </Button>
            {scanOpen && <BarcodeScanner onScan={scanItem} onClose={() => setScanOpen(false)} />}
            {scanMessage && <p role="status" className="break-words text-sm">{scanMessage}</p>}

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

                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <span className="text-muted-foreground">Ordered:</span>{' '}
                    <span className="font-medium">{line.quantity_ordered}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Delivered before:</span>{' '}
                    <span className="font-medium">{line.quantity_previously_received}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Remaining:</span>{' '}
                    <span className="font-medium">{line.remaining}</span>
                  </div>
                </div>

                {line.remaining > 0 && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor={`usable-${line.po_line_id}`} className="text-xs">Usable quantity</Label>
                      <Input id={`usable-${line.po_line_id}`}
                        type="number"
                        min={0}
                        max={line.remaining}
                        value={line.quantity_to_receive || ''}
                        onChange={(e) =>
                          updateLine(index, 'quantity_to_receive', Number(e.target.value))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`damage-${line.po_line_id}`} className="text-xs">Damaged quantity</Label>
                      <Input id={`damage-${line.po_line_id}`} type="number" min={0}
                        value={line.damaged_quantity || ''}
                        onChange={event => updateLine(index, 'damaged_quantity', Number(event.target.value))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`lot-${line.po_line_id}`} className="text-xs">Lot number</Label>
                      <Input id={`lot-${line.po_line_id}`}
                        value={line.lot_number}
                        onChange={(e) => updateLine(index, 'lot_number', e.target.value)}
                        placeholder="LOT-001"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`expiry-${line.po_line_id}`} className="text-xs">Expiration date</Label>
                      <Input id={`expiry-${line.po_line_id}`}
                        type="date"
                        value={line.expiration_date}
                        onChange={(e) => updateLine(index, 'expiration_date', e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {line.remaining > 0 && (
                  <div className="space-y-2 text-sm">
                    <p>Delivered now: {line.quantity_to_receive + line.damaged_quantity} · Open after posting: {Math.max(0, line.remaining - line.quantity_to_receive - line.damaged_quantity)}</p>
                    {line.quantity_to_receive + line.damaged_quantity > line.remaining &&
                      <p role="alert" className="text-destructive">Overage. Set aside extra units before posting.</p>}
                    {line.damaged_quantity > 0 && <p>Set damaged units aside for supplier follow-up. They will be recorded here and excluded from putaway.</p>}
                    {line.quantity_to_receive + line.damaged_quantity > 0 && !line.lot_number.trim() &&
                      <p>Lot number is required for delivered units.</p>}
                    {line.quantity_to_receive > 0 && !line.expiration_date &&
                      <p className="text-muted-foreground">No expiration date entered. Check the lot label before posting.</p>}
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={line.confirmed_shortage}
                        onChange={event => updateLine(index, 'confirmed_shortage', event.target.checked)} />
                      Confirm shortage for supplier follow-up
                    </label>
                    {!line.confirmed_shortage && <p className="text-muted-foreground">Leave unchecked for a normal partial delivery.</p>}
                    {(line.damaged_quantity > 0 || line.confirmed_shortage) && (
                      <>
                        <Label htmlFor={`note-${line.po_line_id}`}>Discrepancy note</Label>
                        <textarea id={`note-${line.po_line_id}`} className="w-full rounded-md border bg-background p-2"
                          rows={3} maxLength={2000} value={line.discrepancy_note}
                          onChange={event => updateLine(index, 'discrepancy_note', event.target.value)} />
                        <Button type="button" variant="outline" size="sm" disabled={!!draftingLine || saving}
                          onClick={() => void draftNotes(line)}>
                          {draftingLine === line.po_line_id ? 'Drafting…' : 'Draft note and handoff with AI'}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            {handoff && (
              <div className="space-y-2 rounded border p-3">
                <Label htmlFor="receiving-handoff">Shift handoff draft</Label>
                <textarea id="receiving-handoff" className="w-full rounded-md border bg-background p-2" rows={3}
                  value={handoff} onChange={event => setHandoff(event.target.value)} />
                <Button type="button" size="sm" variant="outline" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(handoff);
                    toast.success('Shift handoff copied');
                  } catch {
                    toast.error('Select and copy the handoff text manually.');
                  }
                }}>Copy handoff</Button>
              </div>
            )}

            <div className="flex flex-wrap justify-between gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const supabase = createClient();
                  const { data: tenant } = await supabase.from('tenants').select('name, settings').eq('id', tenantId).single();
                  const { data: supplier } = await supabase.from('suppliers').select('*').eq('id', po.supplier_id).single();
                  const selectedLoc = locations.find((l) => l.id === receivingLocationId);
                  if (!tenant) return;
                  const s = (tenant.settings || {}) as Record<string, string>;
                  const received = lines.filter((l) => l.quantity_to_receive > 0 || l.damaged_quantity > 0 || l.confirmed_shortage);
                  generateReceivingDocumentPDF({
                    companyName: tenant.name,
                    companyAddress: s.address || '',
                    poNumber: po.po_number,
                    receivingNumber: `RCV-${po.po_number}-${new Date().toISOString().split('T')[0]}`,
                    receivingDate: new Date().toLocaleDateString(),
                    receivingLocation: selectedLoc?.name || 'Receiving Dock',
                    supplierName: supplier?.name || '',
                    supplierContact: supplier?.contact_name || null,
                    receivedBy: user?.full_name || '',
                    lines: received.map((l) => ({
                      productName: l.product_name,
                      sku: l.sku,
                      lotNumber: l.lot_number,
                      expirationDate: l.expiration_date || null,
                      quantityOrdered: l.quantity_ordered,
                      quantityReceived: l.quantity_previously_received,
                      quantityThisReceipt: l.quantity_to_receive,
                      unitCost: l.unit_cost,
                      condition: l.damaged_quantity ? `${l.damaged_quantity} damaged set aside` : l.confirmed_shortage ? 'Confirmed shortage' : 'Good',
                    })),
                    totalItemsReceived: received.reduce((s, l) => s + l.quantity_to_receive, 0),
                    totalValue: received.reduce((s, l) => s + l.quantity_to_receive * l.unit_cost, 0),
                    notes: lines.filter(line => line.discrepancy_note.trim()).map(line => `${line.sku}: ${line.discrepancy_note}`).join('\n') || null,
                    putAwayTasksGenerated: received.filter(line => line.quantity_to_receive > 0).length,
                  });
                }}
              >
                <Printer className="h-4 w-4 mr-1" />
                Print Receiving Doc
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={handleReceive} disabled={saving || !!draftingLine}>
                  {saving ? 'Receiving...' : 'Receive Items'}
                </Button>
              </div>
            </div>
          </fieldset>
        )}
      </DialogContent>
    </Dialog>
  );
}
