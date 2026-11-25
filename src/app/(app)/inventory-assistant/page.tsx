'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import type { inventoryAlerts } from '@/lib/inventory-assistant';

type Alerts = Awaited<ReturnType<typeof inventoryAlerts>>;
type Answer = { answer: string; evidence?: unknown };

const endpoint = '/api/inventory-assistant';
const questions = [
  'Which SKUs are below reorder level?',
  'Which lots are expiring?',
  'Which orders are stalled?',
  'Summarize warehouse alerts',
];

export default function InventoryAssistantPage() {
  const { user, loading } = useAuth();
  const allowed = !!user?.is_active && (user.role === 'admin' || user.role === 'manager');
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [alertError, setAlertError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) throw new Error('Alerts unavailable');
        const data = await response.json();
        if (controller.signal.aborted) return;
        setAlerts(data);
        setAlertError('');
      } catch {
        if (!controller.signal.aborted) setAlertError('Could not refresh warehouse alerts.');
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 300000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [allowed]);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !question.trim()) return;
    setBusy(true);
    setAnswer(null);
    setError('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not answer the question.');
      setAnswer(data);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not answer the question.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p>Loading inventory assistant…</p>;
  if (!allowed) return <p>Warehouse manager access is required.</p>;

  const groups = alerts ? [
    { title: 'Low stock', href: '/reorder', ...alerts.lowStock,
      lines: alerts.lowStock.records.map(row => ({ id: row.id, text: `${row.sku} · ${row.onHand} on hand · reorder level ${row.threshold}` })) },
    { title: 'Expiring and expired lots', href: '/expiration', ...alerts.expiring,
      lines: alerts.expiring.records.map(row => ({ id: row.id, text: `${row.sku} · lot ${row.lot} · ${row.expired ? 'expired' : 'expires'} ${row.expires}` })) },
    { title: 'Stalled fulfillment', href: '/ship', ...alerts.fulfillment,
      lines: alerts.fulfillment.records.map(row => ({ id: row.id, text: `${row.order_number} · ${row.status} · last updated ${row.updated_at.slice(0, 10)}` })) },
  ] : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Inventory assistant</h1>
        <p className="text-muted-foreground">Ask about stock, bin locations, and warehouse alerts. Answers are read-only.</p>
      </header>
      <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="ask-heading">
        <h2 id="ask-heading" className="font-semibold">Ask a warehouse question</h2>
        <div className="flex flex-wrap gap-2">
          {questions.map(prompt => (
            <Button key={prompt} type="button" size="sm" variant="outline" disabled={busy} onClick={() => setQuestion(prompt)}>{prompt}</Button>
          ))}
        </div>
        <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="inventory-question" className="sr-only">Warehouse question</label>
          <input id="inventory-question" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2" value={question}
            onChange={event => setQuestion(event.target.value)} placeholder="Where is SKU 1042 and how much is on hand?"
            maxLength={500} required disabled={busy} />
          <Button disabled={busy || !question.trim()}>{busy ? 'Checking records…' : 'Ask'}</Button>
        </form>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {answer && <div role="status" className="space-y-2"><p className="whitespace-pre-wrap">{answer.answer}</p></div>}
        {answer?.evidence !== undefined && (
          <details className="rounded border p-2">
            <summary className="cursor-pointer text-sm font-medium">Source records</summary>
            <pre className="mt-2 max-h-72 overflow-auto text-xs">{JSON.stringify(answer.evidence, null, 2)}</pre>
          </details>
        )}
      </section>
      <section className="space-y-3" aria-labelledby="alert-heading">
        <h2 id="alert-heading" className="text-lg font-semibold">Warehouse alerts</h2>
        <p className="text-sm text-muted-foreground">Refreshes every five minutes while open. Fulfillment flags open orders with no update in 48 hours.</p>
        {alertError && <p role="alert" className="text-destructive">{alertError}{alerts && ' Showing the last successful check.'}</p>}
        {!alerts && !alertError && <p role="status">Checking warehouse alerts…</p>}
        <div className="grid gap-3 lg:grid-cols-3">
          {groups.map(group => (
            <article key={group.href} className="space-y-2 rounded-lg border bg-card p-4">
              <h3 className="font-semibold">{group.title} ({group.count})</h3>
              {group.lines.length ? (
                <ul className="max-h-56 space-y-2 overflow-auto text-sm">{group.lines.map(line => <li key={line.id}>{line.text}</li>)}</ul>
              ) : <p className="text-sm text-muted-foreground">No alerts.</p>}
              {group.count > group.lines.length && <p className="text-sm text-muted-foreground">Showing {group.lines.length} of {group.count}.</p>}
              <Link className="inline-block text-sm underline" href={group.href}>Open records</Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
