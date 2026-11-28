'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { dashboardMetrics } from '@/lib/analytics-digest';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ActionForm, checked, Empty, Field, Panel, SelectOption, Submit, textField, useWorkspaceAction,
} from './workspace-controls';

type Dashboard = { id: string; name: string; metrics: string[] };
type Preference = { cadence: string; email_delivery: boolean; csv_export: boolean };
type Export = { export_id: string; report_date: string };

export function AnalyticsWorkspace({ dashboards, metrics, preference, exports, tenantId, userId }: {
  dashboards: Dashboard[]; metrics: Record<string, number>; preference: Preference | null;
  exports: Export[]; tenantId: string; userId: string;
}) {
  const { busy, run } = useWorkspaceAction();
  const [selected, setSelected] = useState(dashboards[0]?.id ?? '');
  const active = dashboards.find(dashboard => dashboard.id === selected);
  return <div className="space-y-4">
    <Panel title="My Dashboards" description="Save the metrics you check most often. Each card opens the workflow behind the number.">
      <Field label="Dashboard">
        <SelectOption options={dashboards} placeholder="New dashboard" value={selected} onChange={event => setSelected(event.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dashboardMetrics.filter(metric => !active || active.metrics.includes(metric.id)).map(metric => (
          <Link key={metric.id} href={metric.href} className="rounded-lg border bg-muted/30 p-3 hover:border-primary focus-visible:ring-2">
            <span className="block text-sm text-muted-foreground">{metric.label}</span>
            <strong className="text-2xl">{Number(metrics[metric.id] ?? 0).toLocaleString()}</strong>
          </Link>
        ))}
      </div>
      <ActionForm key={active?.id ?? 'new'} className="space-y-3" onSubmit={(data, form) => void run(async () => {
        const name = textField(data, 'name');
        const chosen = data.getAll('metric').map(String);
        if (!chosen.length) throw new Error('Choose at least one metric.');
        const db = createClient();
        const saved = active
          ? await db.from('analytics_dashboards').update({ name, metrics: chosen }).eq('id', active.id).select('id').single()
          : await db.from('analytics_dashboards').insert({ tenant_id: tenantId, user_id: userId, name, metrics: chosen }).select('id').single();
        const row = checked(saved);
        if (row) setSelected(row.id);
        if (!active) form.reset();
      }, 'Dashboard saved.')}>
        <Field label="Dashboard Name"><Input name="name" defaultValue={active?.name} maxLength={80} required /></Field>
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">Metrics</legend>
          {dashboardMetrics.map(metric => <label key={metric.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="metric" value={metric.id} defaultChecked={active?.metrics.includes(metric.id) ?? true} />{metric.label}
          </label>)}
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Submit busy={busy}>Save Dashboard</Submit>
          {active && <Button variant="outline" type="button" disabled={busy} onClick={() => void run(async () => {
            checked(await createClient().from('analytics_dashboards').delete().eq('id', active.id));
            setSelected('');
          }, 'Dashboard removed.')}>Delete Dashboard</Button>}
        </div>
      </ActionForm>
    </Panel>
    <Panel title="Scheduled Reports" description="Schedule your warehouse exceptions report at 07:00 UTC. Weekly reports run on Mondays.">
      <ActionForm className="space-y-3" onSubmit={data => void run(async () => {
        checked(await createClient().rpc('set_analytics_delivery', {
          p_cadence: textField(data, 'cadence') || null, p_email: data.has('email'), p_csv: data.has('csv'),
        }));
      }, 'Schedule saved.')}>
        <Field label="Schedule"><SelectOption options={[{ id: 'daily', name: 'Daily' }, { id: 'weekly', name: 'Weekly' }]}
          placeholder="Off" name="cadence" defaultValue={preference?.cadence ?? ''} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked={preference?.email_delivery} /> Email my reports</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="csv" defaultChecked={preference?.csv_export} /> Save a CSV and attach it when email is enabled</label>
        <Submit busy={busy}>Save Schedule</Submit>
      </ActionForm>
      <h3 className="font-medium">Recent Exports</h3>
      {exports.length ? <ul className="space-y-2">{exports.map(row => <li key={row.export_id}>
        <a href={`/api/suite/analytics/exports/${row.export_id}`} className="text-sm font-semibold text-primary underline">Download report for {row.report_date}</a>
      </li>)}</ul> : <Empty>CSV reports appear here after the next scheduled run.</Empty>}
      <Link href="/analytics-digests" className="text-sm font-semibold text-primary underline">View In-app Digest History</Link>
    </Panel>
  </div>;
}
