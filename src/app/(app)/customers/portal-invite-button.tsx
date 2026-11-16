"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
export function PortalInviteButton({ customerId, customerEmail }: { customerId: string; customerEmail: string | null; customerName: string }) {
  const [loading, setLoading] = useState(false);
  async function invite(event: React.MouseEvent) {
    event.stopPropagation(); setLoading(true);
    try {
      const response = await fetch('/api/portal/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Invitation failed');
      toast.success('Invitation email requested');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Invitation failed'); }
    finally { setLoading(false); }
  }
  return <Button variant="outline" size="sm" disabled={!customerEmail || loading} onClick={invite}>{loading ? 'Sending…' : 'Invite to portal'}</Button>;
}
