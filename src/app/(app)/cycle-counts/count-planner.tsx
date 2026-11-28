'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type Progress = {
  id: string;
  warehouse: string;
  start_date: string;
  deadline: string;
  recurring: boolean;
  total: number;
  approved: number;
  due_today: number;
  overdue: number;
  per_day: number;
};

export function CountPlanner({ locations, onCreated, revision }: {
  locations: { id: string; name: string }[];
  onCreated: () => Promise<void>;
  revision: number;
}) {
  const [plans, setPlans] = useState<Progress[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const { data, error } = await createClient().rpc('cycle_count_plan_progress');
    if (error) {
      setError('Could not load count plans.');
      return;
    }
    setError('');
    setPlans((data ?? []).filter((plan: Progress) => !plan.recurring));
  }, []);

  useEffect(() => { void load(); }, [load, revision]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>100% Warehouse Count Plan</CardTitle>
        <CardDescription>Choose a warehouse and deadline. Invexiqs schedules blind counts for its current bin, SKU, and lot balances across calendar days.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]" onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBusy(true);
          try {
            const { error } = await createClient().rpc('create_cycle_count_plan', {
              p_location: form.get('warehouse'),
              p_start: form.get('start'),
              p_deadline: form.get('deadline'),
            });
            if (error) { toast.error(error.message); return; }
            toast.success('Count plan created. Open its documents under Active Counts.');
            await onCreated();
          } finally { setBusy(false); }
        }}>
          <label className="space-y-1 text-sm font-medium">
            Warehouse
            <select name="warehouse" required defaultValue="" className="block h-10 w-full rounded-md border bg-background px-3">
              <option value="" disabled>Select warehouse</option>
              {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Start Date<Input name="start" type="date" min={today} defaultValue={today} required /></label>
          <label className="space-y-1 text-sm font-medium">Deadline<Input name="deadline" type="date" min={today} required /></label>
          <Button type="submit" disabled={busy || locations.length === 0}>{busy ? 'Creating…' : 'Create Count Plan'}</Button>
        </form>

        {error && <p role="alert" className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}
        {!error && plans?.length === 0 && <p className="text-sm text-muted-foreground">No coverage plans yet.</p>}
        {!!plans?.length && (
          <ul className="grid gap-3 md:grid-cols-2">
            {plans.map(plan => {
              const percent = Math.floor(plan.approved / plan.total * 100);
              return <li key={plan.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold">{plan.warehouse}</h3>
                  <span className="font-semibold">{percent}%</span>
                </div>
                <progress className="block h-2 w-full accent-primary" max={plan.total} value={plan.approved} aria-label={`${plan.warehouse} count completion`} />
                <p className="text-sm text-muted-foreground">{plan.approved} of {plan.total} lines approved · Deadline {plan.deadline}</p>
                <dl className="grid grid-cols-3 gap-2 text-sm">
                  <div><dt>Due today</dt><dd className="font-semibold">{plan.due_today}</dd></div>
                  <div><dt>Overdue</dt><dd className="font-semibold">{plan.overdue}</dd></div>
                  <div><dt>Needed per day</dt><dd className="font-semibold">{plan.per_day}</dd></div>
                </dl>
              </li>;
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
