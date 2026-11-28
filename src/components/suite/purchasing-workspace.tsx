'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import {
  ActionForm, checked, Empty, Field, formGrid, type Option,
  optionalNumber, Panel, postJson, SelectOption, Submit, textField, useWorkspaceAction,
} from './workspace-controls';

type Rules = { admin_threshold: number | null; separate_approver: boolean };

export function PurchasingWorkspace({ rules, suppliers, admin }: { rules: Rules | null; suppliers: Option[]; admin: boolean }) {
  const { busy, run } = useWorkspaceAction();
  const [supplier, setSupplier] = useState('');
  return <div className="space-y-4">
    <Panel title="Purchase Approval Rules" description="Configure approval for submitted purchase orders using the line subtotal in your workspace currency.">
      {admin ? <ActionForm className={formGrid} onSubmit={data => void run(async () => {
        checked(await createClient().rpc('set_purchase_approval_rules', {
          p_threshold: optionalNumber(data, 'threshold'), p_separate: data.has('separate'),
        }));
      }, 'Approval rules saved.')}>
        <Field label="Administrator Approval At or Above">
          <Input name="threshold" type="number" min="0" step="0.01" defaultValue={rules?.admin_threshold ?? ''} placeholder="No threshold" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="separate" defaultChecked={rules?.separate_approver} /> Require a different approver from the creator
        </label>
        <div className="self-end"><Submit busy={busy}>Save Rules</Submit></div>
      </ActionForm> : <Empty>{rules?.admin_threshold != null ? `Administrator approval starts at ${rules.admin_threshold}.` : 'Managers can approve purchase orders.'} {rules?.separate_approver && 'A second user must approve every purchase order.'}</Empty>}
      <Link href="/purchase-orders?status=pending_approval" className="text-sm font-semibold text-primary underline">Open Purchase Orders</Link>
    </Panel>
    <Panel title="Supplier Accounts" description="Invite a supplier to sign in and view sent purchase orders, expected dates, and receiving progress.">
      <Link href="/supplier-portal" className="text-sm font-semibold text-primary underline">Open Supplier Portal</Link>
      {admin && <ActionForm className="flex flex-wrap items-end gap-3" onSubmit={data => void run(async () => {
        await postJson('/api/suite/suppliers', { supplierId: textField(data, 'supplier'), action: 'invite' });
      }, 'Supplier invitation requested.')}>
        <Field label="Supplier">
          <SelectOption options={suppliers} placeholder="Select a supplier" name="supplier" value={supplier}
            onChange={event => setSupplier(event.target.value)} required />
        </Field>
        <Submit busy={busy}>Send Invitation</Submit>
        <Button type="button" variant="outline" disabled={busy || !supplier} onClick={() => {
          if (!window.confirm('Remove this supplier’s access to the portal?')) return;
          void run(() => postJson('/api/suite/suppliers', { supplierId: supplier, action: 'revoke' }), 'Supplier access removed.');
        }}>Revoke Access</Button>
      </ActionForm>}
      {admin && !suppliers.length && <Empty><Link href="/suppliers" className="underline">Add a supplier</Link> to send an invitation.</Empty>}
    </Panel>
  </div>;
}
