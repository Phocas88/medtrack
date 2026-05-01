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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Play, Send, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { CycleCount, CycleCountLine, Location, CountStatus } from '@/types/database';

function generateCountNumber(): string {
  return 'CC-' + Date.now().toString(36).toUpperCase();
}

const REASON_CODES = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'theft', label: 'Theft' },
  { value: 'miscount', label: 'Miscount' },
  { value: 'sample', label: 'Sample' },
  { value: 'other', label: 'Other' },
];

interface CountLineItem {
  id?: string;
  product_id: string;
  lot_id: string | null;
  system_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  reason_code: string | null;
  product_name?: string;
  product_sku?: string;
  lot_number?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cycleCount: (CycleCount & { lines?: CycleCountLine[] }) | null;
  onSaved: () => void;
}

export function CountDialog({ open, onOpenChange, cycleCount, onSaved }: Props) {
  const { tenantId, user } = useAuth();
  const [locations, setLocations] = useState<Location[]>([]);

  const [locationId, setLocationId] = useState('');
  const [countType, setCountType] = useState('full');
  const [isBlind, setIsBlind] = useState(false);
  const [plannedDate, setPlannedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<CountLineItem[]>([]);
  const [saving, setSaving] = useState(false);

  const isNew = !cycleCount;
  const status = cycleCount?.status || 'planned';
  const isPlanned = status === 'planned';
  const isInProgress = status === 'in_progress';
  const isPendingReview = status === 'pending_review';
  const isApproved = status === 'approved';
  const blindMode = cycleCount?.is_blind ?? isBlind;

  const loadRefs = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');
    setLocations(data || []);
  }, [tenantId]);

  useEffect(() => {
    if (open) loadRefs();
  }, [open, loadRefs]);

  useEffect(() => {
    if (cycleCount) {
      setLocationId(cycleCount.location_id || '');
      setCountType(cycleCount.count_type);
      setIsBlind(cycleCount.is_blind);
      setPlannedDate(cycleCount.planned_date || '');
      setNotes(cycleCount.notes || '');
      setLines(
        (cycleCount.lines || []).map((l) => ({
          id: l.id,
          product_id: l.product_id,
          lot_id: l.lot_id,
          system_quantity: l.system_quantity,
          counted_quantity: l.counted_quantity,
          variance: l.variance,
          reason_code: l.reason_code,
          product_name: l.product?.name,
          product_sku: l.product?.sku,
          lot_number: l.lot?.lot_number,
        }))
      );
    } else {
      setLocationId('');
      setCountType('full');
      setIsBlind(false);
      setPlannedDate('');
      setNotes('');
      setLines([]);
    }
  }, [cycleCount, open]);

  async function createCount() {
    if (!tenantId || !locationId) {
      toast.error('Select a location');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const countNumber = generateCountNumber();

    const { data, error } = await supabase
      .from('cycle_counts')
      .insert({
        tenant_id: tenantId,
        count_number: countNumber,
        location_id: locationId,
        status: 'planned' as const,
        count_type: countType,
        is_blind: isBlind,
        planned_date: plannedDate || null,
        created_by: user?.id || null,
        notes: notes || null,
      })
      .select()
      .single();

    if (error || !data) {
      toast.error(error?.message || 'Failed to create cycle count');
      setSaving(false);
      return;
    }

    toast.success(`Cycle count ${countNumber} created`);
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  async function startCount() {
    if (!cycleCount || !tenantId) return;
    setSaving(true);
    const supabase = createClient();

    // Fetch current inventory at this location
    const { data: lotsData } = await supabase
      .from('lots')
      .select('*, product:products(name, sku)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('location_id', cycleCount.location_id!)
      .gt('quantity_on_hand', 0);

    if (!lotsData || lotsData.length === 0) {
      toast.error('No active inventory found at this location');
      setSaving(false);
      return;
    }

    // Create count lines from inventory
    const lineInserts = lotsData.map((lot) => ({
      tenant_id: tenantId,
      count_id: cycleCount.id,
      product_id: lot.product_id,
      lot_id: lot.id,
      location: lot.location,
      system_quantity: lot.quantity_on_hand,
      counted_quantity: null,
      variance: null,
      reason_code: null,
      counted_by: null,
      counted_at: null,
    }));

    const { error: lErr } = await supabase.from('cycle_count_lines').insert(lineInserts);
    if (lErr) {
      toast.error(lErr.message);
      setSaving(false);
      return;
    }

    // Update status
    const { error: uErr } = await supabase
      .from('cycle_counts')
      .update({ status: 'in_progress' })
      .eq('id', cycleCount.id);

    if (uErr) {
      toast.error(uErr.message);
      setSaving(false);
      return;
    }

    toast.success('Count started - inventory lines populated');
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  function updateLine(index: number, counted: number | null) {
    setLines(
      lines.map((l, i) => {
        if (i !== index) return l;
        const variance = counted !== null ? counted - l.system_quantity : null;
        return { ...l, counted_quantity: counted, variance };
      })
    );
  }

  function updateLineReason(index: number, reason: string | null) {
    setLines(lines.map((l, i) => (i === index ? { ...l, reason_code: reason } : l)));
  }

  async function submitForReview() {
    if (!cycleCount || !tenantId) return;
    if (lines.some((l) => l.counted_quantity === null)) {
      toast.error('All items must have a counted quantity');
      return;
    }
    // Check that lines with variance have a reason code
    if (lines.some((l) => l.variance !== null && l.variance !== 0 && !l.reason_code)) {
      toast.error('Provide a reason code for all lines with variance');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Update each line
    for (const line of lines) {
      if (line.id) {
        await supabase
          .from('cycle_count_lines')
          .update({
            counted_quantity: line.counted_quantity,
            variance: line.variance,
            reason_code: line.reason_code,
            counted_by: user?.id || null,
            counted_at: new Date().toISOString(),
          })
          .eq('id', line.id);
      }
    }

    const { error } = await supabase
      .from('cycle_counts')
      .update({ status: 'pending_review' })
      .eq('id', cycleCount.id);

    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Count submitted for review');
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  async function approveCount() {
    if (!cycleCount || !tenantId) return;
    setSaving(true);
    const supabase = createClient();

    // Create stock_movements for each variance line
    const movements = [];
    for (const line of lines) {
      if (line.variance && line.variance !== 0) {
        movements.push({
          tenant_id: tenantId,
          product_id: line.product_id,
          lot_id: line.lot_id || null,
          user_id: user?.id || '',
          quantity: line.variance,
          movement_type: 'adjust' as const,
          reason: `Cycle count ${cycleCount.count_number} - ${line.reason_code || 'adjustment'}`,
          reference_number: cycleCount.count_number,
          metadata: { cycle_count_id: cycleCount.id },
        });
      }
    }

    if (movements.length > 0) {
      const { error: mErr } = await supabase.from('stock_movements').insert(movements);
      if (mErr) {
        toast.error('Failed to create adjustments: ' + mErr.message);
        setSaving(false);
        return;
      }

      // Update lot quantities
      for (const line of lines) {
        if (line.lot_id && line.variance && line.variance !== 0) {
          const { data: lot } = await supabase
            .from('lots')
            .select('quantity_on_hand')
            .eq('id', line.lot_id)
            .single();

          if (lot) {
            await supabase
              .from('lots')
              .update({ quantity_on_hand: lot.quantity_on_hand + line.variance })
              .eq('id', line.lot_id);
          }
        }
      }
    }

    const { error } = await supabase
      .from('cycle_counts')
      .update({
        status: 'approved',
        approved_by: user?.id || null,
        approved_at: new Date().toISOString(),
        completed_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', cycleCount.id);

    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success('Count approved and inventory adjusted');
    setSaving(false);
    onOpenChange(false);
    onSaved();
  }

  const statusLabel = (s: CountStatus) =>
    s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const totalVariance = lines.reduce((sum, l) => sum + Math.abs(l.variance || 0), 0);
  const varianceLines = lines.filter((l) => l.variance !== null && l.variance !== 0).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isNew ? 'New Cycle Count' : `Cycle Count ${cycleCount.count_number}`}
            {!isNew && (
              <Badge
                variant={
                  status === 'approved' ? 'default' :
                  status === 'pending_review' ? 'secondary' :
                  status === 'cancelled' ? 'destructive' : 'outline'
                }
                className="ml-3"
              >
                {statusLabel(status)}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Create form ── */}
          {isNew && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location *</Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Count Type</Label>
                  <Select value={countType} onValueChange={setCountType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="spot">Spot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Planned Date</Label>
                  <Input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
                </div>
                <div className="flex items-center gap-3 pt-7">
                  <Switch checked={isBlind} onCheckedChange={setIsBlind} id="blind-mode" />
                  <Label htmlFor="blind-mode">Blind Count (hide system quantities)</Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
            </>
          )}

          {/* ── Count info (view mode) ── */}
          {!isNew && (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Location:</span>{' '}
                <span className="font-medium">{cycleCount.location?.name || '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Type:</span>{' '}
                <span className="font-medium capitalize">{cycleCount.count_type}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Blind:</span>{' '}
                <span className="font-medium">{cycleCount.is_blind ? 'Yes' : 'No'}</span>
              </div>
            </div>
          )}

          {/* ── Count lines ── */}
          {!isNew && lines.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Count Lines ({lines.length} items)</Label>
                {(isPendingReview || isApproved) && (
                  <span className="text-sm text-muted-foreground">
                    Variance: {varianceLines} line{varianceLines !== 1 ? 's' : ''}, {totalVariance} unit{totalVariance !== 1 ? 's' : ''} total
                  </span>
                )}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Lot</TableHead>
                      {!blindMode && <TableHead className="w-[90px]">System</TableHead>}
                      <TableHead className="w-[90px]">Counted</TableHead>
                      <TableHead className="w-[90px]">Variance</TableHead>
                      <TableHead className="w-[130px]">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line, idx) => (
                      <TableRow
                        key={idx}
                        className={line.variance && line.variance !== 0 ? 'bg-destructive/5' : ''}
                      >
                        <TableCell className="text-sm">
                          {line.product_name || '—'}
                          {line.product_sku && (
                            <span className="text-xs text-muted-foreground ml-1">({line.product_sku})</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{line.lot_number || '—'}</TableCell>
                        {!blindMode && (
                          <TableCell className="text-sm font-mono">{line.system_quantity}</TableCell>
                        )}
                        <TableCell>
                          {isInProgress ? (
                            <Input
                              type="number"
                              min={0}
                              className="h-8 text-sm font-mono"
                              value={line.counted_quantity ?? ''}
                              onChange={(e) =>
                                updateLine(idx, e.target.value === '' ? null : parseInt(e.target.value))
                              }
                            />
                          ) : (
                            <span className="text-sm font-mono">{line.counted_quantity ?? '—'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {line.variance !== null && line.variance !== 0 ? (
                            <Badge variant="destructive" className="font-mono">
                              {line.variance > 0 ? '+' : ''}{line.variance}
                            </Badge>
                          ) : line.variance === 0 ? (
                            <span className="text-sm text-muted-foreground font-mono">0</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {isInProgress && line.variance !== null && line.variance !== 0 ? (
                            <Select
                              value={line.reason_code || '_none'}
                              onValueChange={(v) => updateLineReason(idx, v === '_none' ? null : v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Reason" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">Select...</SelectItem>
                                {REASON_CODES.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs capitalize">{line.reason_code || '—'}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {isApproved || status === 'cancelled' ? 'Close' : 'Cancel'}
            </Button>
            {isNew && (
              <Button onClick={createCount} disabled={saving}>
                {saving ? 'Creating...' : 'Create Count'}
              </Button>
            )}
            {isPlanned && !isNew && (
              <Button onClick={startCount} disabled={saving}>
                <Play className="h-4 w-4 mr-2" />
                {saving ? 'Starting...' : 'Start Count'}
              </Button>
            )}
            {isInProgress && (
              <Button onClick={submitForReview} disabled={saving}>
                <Send className="h-4 w-4 mr-2" />
                {saving ? 'Submitting...' : 'Submit for Review'}
              </Button>
            )}
            {isPendingReview && (
              <Button onClick={approveCount} disabled={saving}>
                <CheckCircle className="h-4 w-4 mr-2" />
                {saving ? 'Approving...' : 'Approve & Adjust'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
