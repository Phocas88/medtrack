'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { ShieldCheck, Ban, Flame } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { QuarantineHold, QuarantineStatus } from '@/types/database';

function statusBadge(status: QuarantineStatus) {
  const variants: Record<QuarantineStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    held: 'secondary',
    released: 'default',
    rejected: 'destructive',
    destroyed: 'destructive',
  };
  return (
    <Badge variant={variants[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hold: (QuarantineHold & {
    product_name?: string;
    lot_number?: string;
    held_by_name?: string;
  }) | null;
  onUpdated: () => void;
}

export function QuarantineDialog({ open, onOpenChange, hold, onUpdated }: Props) {
  const { user, tenantId } = useAuth();
  const [approvalNote, setApprovalNote] = useState('');
  const [processing, setProcessing] = useState(false);

  if (!hold) return null;

  const isResolved = hold.status !== 'held';

  async function resolve(action: 'released' | 'rejected' | 'destroyed') {
    if (!hold || !user || !tenantId) return;
    if (!approvalNote.trim()) { toast.error('An approval note is required'); return; }
    setProcessing(true);
    const { error } = await createClient().rpc('resolve_quarantine', { p_hold_id: hold.id, p_action: action, p_note: approvalNote });
    setProcessing(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Hold ${action}`); setApprovalNote(''); onOpenChange(false); onUpdated();
  }
  const handleRelease = () => resolve('released');
  const handleReject = () => resolve('rejected');
  const handleDestroy = () => resolve('destroyed');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Quarantine Hold
            {statusBadge(hold.status)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Hold Details */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Product</span>
              <p className="font-medium">{hold.product_name || '--'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Lot #</span>
              <p className="font-medium">{hold.lot_number || '--'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Quantity</span>
              <p className="font-medium">{hold.quantity}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Held Date</span>
              <p className="font-medium">{formatDate(hold.held_at)}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Held By</span>
              <p className="font-medium">{hold.held_by_name || hold.held_by || '--'}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Reason</span>
              <p className="font-medium">{hold.reason}</p>
            </div>
            {hold.notes && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Notes</span>
                <p className="font-medium">{hold.notes}</p>
              </div>
            )}
          </div>

          {!isResolved && (
            <>
              <Separator />

              <div className="space-y-2">
                <Label>Approval / Action Note</Label>
                <Textarea
                  value={approvalNote}
                  onChange={(e) => setApprovalNote(e.target.value)}
                  rows={3}
                  placeholder="Required for release, optional for reject/destroy..."
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleRelease}
                  disabled={processing}
                  className="flex-1"
                >
                  <ShieldCheck className="h-4 w-4 mr-2" /> Release
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReject}
                  disabled={processing}
                  className="flex-1"
                >
                  <Ban className="h-4 w-4 mr-2" /> Reject
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDestroy}
                  disabled={processing}
                  className="flex-1"
                >
                  <Flame className="h-4 w-4 mr-2" /> Destroy
                </Button>
              </div>
            </>
          )}

          {isResolved && hold.released_at && (
            <>
              <Separator />
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Resolution</span>
                  <p className="font-medium capitalize">{hold.status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Resolved Date</span>
                  <p className="font-medium">{formatDate(hold.released_at)}</p>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
