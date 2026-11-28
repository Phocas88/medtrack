'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

type Rule = { class: string; counts_per_year: number; interval_days: number; float_days: number; fiscal_start_month: number };
type Recommendation = {
  product_id: string;
  sku: string;
  product_name: string;
  period_value: number;
  recommended_class: string;
  current_class: string | null;
  locked: boolean;
};

const classes = ['A', 'B', 'C', 'D'];
const fieldStyle = 'block min-h-10 w-full rounded-md border bg-background px-3';

export function RecurringCounts({ locations, onGenerated }: {
  locations: { id: string; name: string }[];
  onGenerated: () => Promise<void>;
}) {
  const [rules, setRules] = useState<Rule[]>();
  const [ruleError, setRuleError] = useState('');
  const [recommendations, setRecommendations] = useState<Recommendation[]>();
  const [busy, setBusy] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 364 * 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    void createClient().from('cycle_count_rules').select('class,counts_per_year,interval_days,float_days,fiscal_start_month')
      .then(({ data, error }) => {
        if (error) setRuleError('Could not load recurring count rules.');
        else setRules(data ?? []);
      });
  }, []);

  return (
    <details className="rounded-lg border bg-card p-5">
      <summary className="cursor-pointer text-lg font-semibold">Recurring Cycle Counts</summary>
      <div className="mt-4 space-y-6">
        <section aria-labelledby="count-class-rules" className="space-y-3">
          <h3 id="count-class-rules" className="font-semibold">Class Schedules</h3>
          <p className="text-sm text-muted-foreground">Counts per fiscal year set the annual limit and a default interval over 365 days. Enter an interval to override it. Float days allow a count to become due early. Leave counts per year blank to turn off scheduling for a class.</p>
          {ruleError && <p role="alert" className="text-sm text-destructive">{ruleError}</p>}
          {!rules && !ruleError && <p role="status" className="text-sm">Loading schedules…</p>}
          {rules && classes.map(group => {
            const rule = rules.find(item => item.class === group);
            return <form key={group} className="grid items-end gap-2 rounded-md border p-3 sm:grid-cols-3 xl:grid-cols-[3rem_1fr_1fr_1fr_1fr_auto]" onSubmit={async event => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const target = String(form.get('frequency'));
              const interval = String(form.get('interval'));
              setBusy(group);
              try {
                const { error } = await createClient().rpc('save_cycle_count_rule', {
                  p_class: group,
                  p_counts: target ? Number(target) : null,
                  p_interval: interval ? Number(interval) : null,
                  p_float: Number(form.get('float')),
                  p_fiscal_month: Number(form.get('fiscal_month')),
                });
                if (error) { toast.error(error.message); return; }
                toast.success(`Class ${group} schedule saved.`);
              } finally { setBusy(''); }
            }}>
              <strong className="py-2">{group}</strong>
              <label className="text-sm">Counts Per Year<Input name="frequency" type="number" min="1" max="365" defaultValue={rule?.counts_per_year} /></label>
              <label className="text-sm">Interval Days<Input name="interval" type="number" min="1" max="366" placeholder="Auto" defaultValue={rule?.interval_days} /></label>
              <label className="text-sm">Float Days<Input name="float" type="number" min="0" max="365" defaultValue={rule?.float_days ?? 0} /></label>
              <label className="text-sm">Fiscal Year Starts<select name="fiscal_month" className={fieldStyle} defaultValue={rule?.fiscal_start_month ?? 1}>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{new Date(2020, i, 1).toLocaleString(undefined, { month: 'short' })}</option>)}
              </select></label>
              <Button type="submit" variant="outline" disabled={!!busy}>Save Class {group}</Button>
            </form>;
          })}
        </section>
        <section aria-labelledby="count-abc-analysis" className="space-y-3">
          <h3 id="count-abc-analysis" className="font-semibold">ABC Analysis</h3>
          <p className="text-sm text-muted-foreground">Rank products by shipped consumption value or open sales-order requirements. Edit and lock an individual class in Products.</p>
          <form className="grid items-end gap-3 sm:grid-cols-3 lg:grid-cols-5" onSubmit={async event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const apply = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'apply';
            if (apply && !window.confirm('Apply recommendations to all unlocked products for this period?')) return;
            setBusy('analysis');
            try {
              const { data, error } = await createClient().rpc('analyze_cycle_count_abc', {
                p_start: form.get('from'),
                p_end: form.get('through'),
                p_basis: form.get('basis'),
                p_apply: apply,
              });
              if (error) { toast.error(error.message); return; }
              setRecommendations(data ?? []);
              if (apply) toast.success('Updated the classes of unlocked products.');
            } finally { setBusy(''); }
          }}>
            <label className="text-sm">From<Input name="from" type="date" defaultValue={yearAgo} required /></label>
            <label className="text-sm">Through<Input name="through" type="date" defaultValue={today} required /></label>
            <label className="text-sm">Basis<select name="basis" className={fieldStyle}>
              <option value="consumption">Consumption Value</option>
              <option value="requirements">Requirements Value</option>
            </select></label>
            <Button type="submit" variant="outline" disabled={!!busy}>Preview Classes</Button>
            <Button type="submit" value="apply" disabled={!!busy}>Apply Classes</Button>
          </form>
          {recommendations && <div className="space-y-2">
            <p role="status" className="text-sm text-muted-foreground">{recommendations.length ? `Showing ${Math.min(25, recommendations.length)} highest-ranked products.` : 'No products to classify.'}</p>
            {recommendations.length > 0 && <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr>{['SKU', 'Product', 'Period Value', 'Current Class', 'Recommended Class'].map(col => <th key={col} scope="col" className="p-2">{col}</th>)}</tr></thead>
                <tbody>{recommendations.slice(0, 25).map(product => <tr key={product.product_id} className="border-t">
                  <td className="p-2">{product.sku}</td><td className="p-2">{product.product_name}</td>
                  <td className="p-2">{Number(product.period_value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="p-2">{product.current_class ?? 'Unclassified'}{product.locked ? ' · Locked' : ''}</td>
                  <td className="p-2">{product.recommended_class}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          </div>}
        </section>
        <section aria-labelledby="generate-due-counts" className="space-y-3">
          <h3 id="generate-due-counts" className="font-semibold">Due Count Documents</h3>
          <p className="text-sm text-muted-foreground">The daily scheduler creates blind counts for eligible stock. You can also check a warehouse now. Finish its open plan documents before generating another set.</p>
          <form className="flex flex-wrap items-end gap-3" onSubmit={async event => {
            event.preventDefault();
            const warehouse = new FormData(event.currentTarget).get('warehouse');
            setBusy('generate');
            try {
              const { data, error } = await createClient().rpc('generate_due_cycle_counts', { p_location: warehouse });
              if (error) { toast.error(error.message); return; }
              if (!data) { toast.info('No new documents. The warehouse has no eligible due stock or already has an open plan.'); return; }
              toast.success('Due documents are ready in Active Counts.');
              await onGenerated();
            } finally { setBusy(''); }
          }}>
            <label className="min-w-52 text-sm">Warehouse<select name="warehouse" required defaultValue="" className={fieldStyle}>
              <option value="" disabled>Select warehouse</option>
              {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select></label>
            <Button disabled={!!busy || !locations.length} type="submit">Generate Due Counts</Button>
          </form>
        </section>
      </div>
    </details>
  );
}
