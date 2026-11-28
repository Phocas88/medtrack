'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import {
  ActionForm, checked, Empty, Field, formGrid, type Option, Panel, postJson, SelectOption, Submit, textField, useWorkspaceAction,
} from './workspace-controls';

type Register = { id: string; name: string; location_id: string; is_active: boolean };
type Shift = {
  id: string; register_id: string; opened_at: string; closed_at: string | null; opening_cash: number;
  counted_cash: number | null; expected_cash: number | null; variance: number | null;
};
type Terminal = { register_id: string; livemode: boolean };
type Attempt = { id: string; register_id: string; status: string; failure: string | null; created_at: string };

export function POSWorkspace({ registers, shifts, locations, terminals, attempts, admin, currency }: {
  registers: Register[]; shifts: Shift[]; locations: Option[]; terminals: Terminal[]; attempts: Attempt[]; admin: boolean; currency: string;
}) {
  const money = (amount: number) => formatCurrency(amount, currency);
  const { busy, run } = useWorkspaceAction();
  const [editRegister, setEditRegister] = useState<Register>();
  const locationsById = new Map(locations.map(location => [location.id, location.name]));
  const terminalsById = new Map(terminals.map(terminal => [terminal.register_id, terminal]));
  const openByRegister = new Map(shifts.filter(shift => !shift.closed_at).map(shift => [shift.register_id, shift]));
  const registerNames = new Map(registers.map(register => [register.id, register.name]));
  function updatePayment(id: string, action: 'status' | 'cancel' | 'refund') {
    if (action === 'refund' && !window.confirm('Refund this card transaction in Stripe? This action will return the full payment.')) return;
    void run(async () => {
      const result = await postJson<{ status: string; message?: string }>('/api/pos/charge', { requestId: id, action });
      if (result.message) throw new Error(result.message);
    }, 'Payment status checked.');
  }
  return <div className="space-y-4">
    <Panel title="Registers and Shifts" description="Choose which store supplies stock for each register. Open a cash drawer to start selling.">
      {admin && <ActionForm className={formGrid} key={editRegister?.id ?? 'new'} onSubmit={(data, form) => void run(async () => {
        checked(await createClient().rpc('save_pos_register', {
          p_id: editRegister?.id ?? crypto.randomUUID(), p_name: textField(data, 'name'),
          p_location: editRegister?.location_id ?? textField(data, 'location'), p_active: data.has('active'),
        }));
        form.reset();
        setEditRegister(undefined);
      }, 'Register saved.')}>
        <Field label="Register Name"><Input name="name" maxLength={80} required defaultValue={editRegister?.name} /></Field>
        <Field label="Store or Warehouse"><SelectOption name="location" options={locations} placeholder="Select location" defaultValue={editRegister?.location_id} disabled={!!editRegister} required /></Field>
        <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editRegister?.is_active ?? true} /> Active register</label>
        <div className="flex flex-wrap gap-2">
          <Submit busy={busy} disabled={!locations.length}>Save Register</Submit>
          {editRegister && <Button variant="outline" type="button" onClick={() => setEditRegister(undefined)}>Cancel Edit</Button>}
        </div>
      </ActionForm>}
      {registers.length ? <div className="grid gap-3 xl:grid-cols-2">{registers.map(register => {
        const open = openByRegister.get(register.id);
        const terminal = terminalsById.get(register.id);
        return <article key={register.id} className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">{register.name} · {locationsById.get(register.location_id) ?? 'Warehouse'}</h3>
          <Empty>{register.is_active ? open ? `Shift open · Float ${money(open.opening_cash)}` : 'Shift closed' : 'Register disabled'}</Empty>
          {terminal && <p className="text-sm font-medium">{terminal.livemode ? 'Live Stripe Terminal' : 'Test Stripe Terminal'}</p>}
          {admin && <Button type="button" size="sm" variant="outline" onClick={() => setEditRegister(register)}>Edit Register</Button>}
          {register.is_active && !open && <ActionForm className="flex flex-wrap items-end gap-2" onSubmit={data => void run(async () => {
            checked(await createClient().rpc('open_pos_shift', { p_register: register.id, p_cash: Number(data.get('cash')) }));
          }, 'Shift opened.')}>
            <Field label="Opening Cash"><Input name="cash" type="number" min="0" step="0.01" defaultValue="0" required /></Field>
            <Submit busy={busy}>Open Shift</Submit>
          </ActionForm>}
          {open && <>
            <Link href={`/pos?register=${register.id}`} className="text-sm font-semibold text-primary underline">Open Checkout</Link>
            <ActionForm className="flex flex-wrap items-end gap-2" onSubmit={data => {
              if (!window.confirm(`Close the open shift on ${register.name}?`)) return;
              void run(async () => {
                checked(await createClient().rpc('close_pos_shift', {
                  p_shift: open.id, p_count: Number(data.get('cash')), p_notes: textField(data, 'notes'),
                }));
              }, 'Shift closed. See the reconciliation below.');
            }}>
              <Field label="Counted Cash"><Input name="cash" type="number" min="0" step="0.01" required /></Field>
              <Field label="Closeout Notes"><Input name="notes" maxLength={500} /></Field>
              <Submit busy={busy}>Close Shift</Submit>
            </ActionForm>
          </>}
        </article>;
      })}</div> : <Empty>Create a register to start recording sales at a specific store.</Empty>}
    </Panel>
    {admin && <Panel title="Stripe Terminal Setup" description="Use a reader on your store’s Stripe account. Close its register shift before connecting or changing the reader.">
      <ActionForm className={formGrid} onSubmit={(data, form) => void run(async () => {
        await postJson('/api/pos/terminal', {
          action: 'connect', registerId: textField(data, 'register'), key: textField(data, 'key'), readerId: textField(data, 'reader'),
        });
        form.reset();
      }, 'Stripe Terminal connected.')}>
        <Field label="Register"><SelectOption options={registers.filter(register => !openByRegister.has(register.id))} placeholder="Select a closed register" name="register" required /></Field>
        <Field label="Stripe Reader ID"><Input name="reader" placeholder="tmr_…" autoComplete="off" required /></Field>
        <Field label="Restricted Stripe API Key"><Input name="key" type="password" autoComplete="new-password" required /></Field>
        <Submit busy={busy}>Connect Reader</Submit>
      </ActionForm>
      {!!terminals.length && <ul className="divide-y">{terminals.map(terminal => <li key={terminal.register_id} className="flex items-center justify-between gap-2 py-2 text-sm">
        <span>{registerNames.get(terminal.register_id)} · {terminal.livemode ? 'Live' : 'Test'}</span>
        <Button size="sm" variant="outline" disabled={busy || openByRegister.has(terminal.register_id)} onClick={() => {
          if (!window.confirm('Disconnect the Stripe Terminal reader?')) return;
          void run(() => postJson('/api/pos/terminal', { action: 'disconnect', registerId: terminal.register_id }), 'Reader disconnected.');
        }}>Disconnect</Button>
      </li>)}</ul>}
    </Panel>}
    <Panel title="Card Payment Review">
      {attempts.length ? <ul className="divide-y">{attempts.map(attempt => <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div className="min-w-0"><p className="font-medium">{registerNames.get(attempt.register_id)} · {attempt.status.replaceAll('_', ' ')}</p>
          <p className="break-all text-muted-foreground">{attempt.failure ?? attempt.id}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => updatePayment(attempt.id, 'status')}>Check or Post Payment</Button>
          {attempt.status === 'pending' && <Button size="sm" variant="outline" disabled={busy} onClick={() => updatePayment(attempt.id, 'cancel')}>Cancel Payment</Button>}
          {['paid_review', 'refund_pending'].includes(attempt.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => updatePayment(attempt.id, 'refund')}>Refund Payment</Button>}
        </div>
      </li>)}</ul> : <Empty>No unresolved card payments.</Empty>}
    </Panel>
    <Panel title="Recent Shift Closeouts">
      {shifts.some(shift => shift.closed_at) ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b">{['Register', 'Closed', 'Expected', 'Counted', 'Variance'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{shifts.filter(shift => shift.closed_at).map(shift => <tr key={shift.id} className="border-b">
          <th scope="row" className="p-2 font-medium">{registerNames.get(shift.register_id)}</th>
          <td className="p-2">{new Date(shift.closed_at!).toLocaleString()}</td>
          <td className="p-2">{money(shift.expected_cash ?? 0)}</td><td className="p-2">{money(shift.counted_cash ?? 0)}</td>
          <td className={`p-2 ${Number(shift.variance) !== 0 ? 'font-semibold text-destructive' : ''}`}>{money(shift.variance ?? 0)}</td>
        </tr>)}</tbody>
      </table></div> : <Empty>No shifts have been closed yet.</Empty>}
    </Panel>
  </div>;
}
