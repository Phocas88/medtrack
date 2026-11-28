'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function AssignScanner({ countId, tenantId }: { countId: string; tenantId: string }) {
  const [team, setTeam] = useState<{ id: string; full_name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void createClient().from('users').select('id,full_name').eq('tenant_id', tenantId)
      .eq('is_active', true).order('full_name').then(({ data, error }) => {
        if (error) toast.error('Could not load the warehouse team.');
        else setTeam(data ?? []);
      });
  }, [tenantId]);

  return <form className="flex flex-wrap items-end gap-3 rounded-lg border p-3" onSubmit={async event => {
    event.preventDefault();
    const assignee = new FormData(event.currentTarget).get('assignee');
    setBusy(true);
    try {
      const { data, error } = await createClient().rpc('assign_cycle_count_scanner', { p_count: countId, p_assignee: assignee });
      if (error) toast.error(error.message);
      else if (data) toast.success(`Assigned ${data} bin and lot count tasks. Reopen this document after the operator submits them.`);
      else toast.info('No unassigned bin and lot lines remain.');
    } finally { setBusy(false); }
  }}>
    <label className="min-w-48 text-sm">Scanner Operator
      <select name="assignee" required defaultValue="" className="block h-10 w-full rounded-md border bg-background px-3">
        <option value="" disabled>Select team member</option>
        {team.map(member => <option key={member.id} value={member.id}>{member.full_name}</option>)}
      </select>
    </label>
    <Button variant="outline" type="submit" disabled={busy || !team.length}>{busy ? 'Assigning…' : 'Assign Bin Counts'}</Button>
    <p className="basis-full text-sm text-muted-foreground">The operator scans the assigned bin, SKU, and lot. Unbinned lines stay in this document for manual entry.</p>
  </form>;
}
