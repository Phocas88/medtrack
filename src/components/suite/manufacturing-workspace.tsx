'use client';

import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import {
  ActionForm, checked, Empty, Field, formGrid, type Option, Panel, SelectOption, Submit, textField, useWorkspaceAction,
} from './workspace-controls';

type BomLine = { sku: string; name: string; quantity: number };
type Job = {
  id: string; job_number: number; kit_id: string; quantity: number; due_date: string; status: string; bom: BomLine[];
  material_cost: number | null; labor_cost: number | null; overhead_cost: number | null;
  notes: string | null; lot: { lot_number: string } | null;
};
type Requirement = { product_id: string; sku: string; name: string; required: number; available: number; shortage: number; first_due: string };

export function ManufacturingWorkspace({ kits, jobs, requirements }: { kits: Option[]; jobs: Job[]; requirements: Requirement[] }) {
  const { busy, run } = useWorkspaceAction();
  const kitNames = new Map(kits.map(kit => [kit.id, kit.name]));
  function transition(job: Job, action: 'start' | 'complete' | 'cancel', labor = 0, overhead = 0) {
    void run(async () => {
      checked(await createClient().rpc('update_production_job', { p_id: job.id, p_action: action, p_labor: labor, p_overhead: overhead }));
    }, { start: 'Production started.', complete: 'Finished inventory and job costs were posted.', cancel: 'Production job cancelled.' }[action]);
  }
  return <div className="space-y-4">
    <Panel title="Plan Production" description="Create a work order from an active bill of materials. The work order records the component quantities it was planned with.">
      <ActionForm className={formGrid} onSubmit={(data, form) => void run(async () => {
        checked(await createClient().rpc('create_production_job', {
          p_id: crypto.randomUUID(), p_kit: textField(data, 'kit'), p_quantity: Number(data.get('quantity')),
          p_due_date: textField(data, 'due'), p_notes: textField(data, 'notes'),
        }));
        form.reset();
      }, 'Production job created.')}>
        <Field label="Bill of Materials"><SelectOption name="kit" options={kits} placeholder="Choose a kit" required /></Field>
        <Field label="Units to Build"><Input name="quantity" type="number" min="1" max="1000000" defaultValue="1" required /></Field>
        <Field label="Due Date"><Input name="due" type="date" required /></Field>
        <Field label="Job Notes"><Input name="notes" maxLength={1000} /></Field>
        <div className="self-end"><Submit busy={busy} disabled={!kits.length}>Create Work Order</Submit></div>
      </ActionForm>
      <Link href="/kitting" className="text-sm font-semibold text-primary underline">Manage Bills of Materials</Link>
    </Panel>
    <Panel title="Material Requirements" description="Review component demand from planned and active jobs against stock available after sales-order reservations.">
      {requirements.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead><tr className="border-b">{['Component', 'Required', 'Available', 'Shortage', 'First Due'].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead>
        <tbody>{requirements.map(row => <tr key={row.product_id} className="border-b">
          <th scope="row" className="p-2 font-medium">{row.sku} · {row.name}</th>
          <td className="p-2 tabular-nums">{row.required}</td><td className="p-2 tabular-nums">{row.available}</td>
          <td className={`p-2 tabular-nums ${row.shortage ? 'font-semibold text-destructive' : ''}`}>{row.shortage}</td><td className="p-2">{row.first_due}</td>
        </tr>)}</tbody>
      </table></div> : <Empty>No component demand from open work orders.</Empty>}
    </Panel>
    <Panel title="Production Work Orders">
      {jobs.length ? <div className="grid gap-3 xl:grid-cols-2">{jobs.map(job => <article key={job.id} className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold">WO-{job.job_number} · {kitNames.get(job.kit_id) ?? 'Bill of Materials'}</h3>
          <span className="rounded-full bg-muted px-2 py-1 text-xs capitalize">{job.status.replaceAll('_', ' ')}</span>
        </div>
        <Empty>{job.quantity} units · Due {job.due_date}</Empty>
        {job.notes && <p className="text-sm">{job.notes}</p>}
        <details className="text-sm"><summary className="cursor-pointer font-medium">Component Requirements</summary>
          <ul className="ml-4 mt-2 list-disc">{job.bom.map((line, index) => <li key={`${line.sku}-${index}`}>{line.quantity * job.quantity} × {line.sku} · {line.name}</li>)}</ul>
        </details>
        {job.status === 'completed' && <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt>Materials</dt><dd className="font-semibold">{formatCurrency(job.material_cost ?? 0)}</dd></div>
          <div><dt>Labor</dt><dd className="font-semibold">{formatCurrency(job.labor_cost ?? 0)}</dd></div>
          <div><dt>Overhead</dt><dd className="font-semibold">{formatCurrency(job.overhead_cost ?? 0)}</dd></div>
          <div><dt>Total Job Cost</dt><dd className="font-semibold">{formatCurrency(Number(job.material_cost) + Number(job.labor_cost) + Number(job.overhead_cost))}</dd></div>
          {job.lot && <div className="col-span-2 break-all"><dt>Finished Lot</dt><dd className="font-medium">{job.lot.lot_number}</dd></div>}
        </dl>}
        {job.status === 'in_progress' && <ActionForm className="flex flex-wrap items-end gap-3" onSubmit={data => {
          if (window.confirm(`Post ${job.quantity} finished units and consume components for WO-${job.job_number}?`))
            transition(job, 'complete', Number(data.get('labor')), Number(data.get('overhead')));
        }}>
          <Field label="Actual Labor Cost"><Input name="labor" type="number" min="0" step="0.01" defaultValue="0" required /></Field>
          <Field label="Actual Overhead"><Input name="overhead" type="number" min="0" step="0.01" defaultValue="0" required /></Field>
          <Submit busy={busy}>Post Production</Submit>
        </ActionForm>}
        <div className="flex flex-wrap gap-2">
          {job.status === 'planned' && <Button size="sm" disabled={busy} onClick={() => transition(job, 'start')}>Start Job</Button>}
          {['planned', 'in_progress'].includes(job.status) && <Button size="sm" variant="outline" disabled={busy} onClick={() => {
            if (window.confirm(`Cancel WO-${job.job_number}?`)) transition(job, 'cancel');
          }}>Cancel Job</Button>}
        </div>
      </article>)}</div> : <Empty>No production work orders yet.</Empty>}
    </Panel>
  </div>;
}
