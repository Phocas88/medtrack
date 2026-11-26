'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import type { warehousePriorities } from '@/lib/warehouse-priorities';

type Priorities = Awaited<ReturnType<typeof warehousePriorities>>;

export function PriorityList({ groups }: { groups: Priorities }) {
  if (!groups.some(group => group.count)) {
    return <p className="text-sm text-muted-foreground">No overdue receipts, aging putaway, or stalled orders.</p>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {groups.map(group => (
        <div key={group.label} className="min-w-0 space-y-2">
          <h3 className="text-sm font-semibold">{group.label} ({group.count})</h3>
          <ul className="space-y-2 text-sm">
            {group.records.map(record => (
              <li key={record.href} className="break-words">
                <Link href={record.href} className="font-medium underline underline-offset-2">{record.label}</Link>
                <p className="text-muted-foreground">{record.detail}</p>
              </li>
            ))}
          </ul>
          {group.count === 0 && <p className="text-sm text-muted-foreground">None open.</p>}
          {group.count > group.records.length && (
            <Link href={group.href} className="text-sm underline">Showing {group.records.length} of {group.count}. Open queue</Link>
          )}
        </div>
      ))}
    </div>
  );
}

export function ShiftPriorities() {
  const { user, tenantId } = useAuth();
  const allowed = user?.is_active && user.access_level !== 'scanner_only' &&
    (user.role === 'manager' || user.role === 'admin');
  const [result, setResult] = useState<{ tenant: typeof tenantId; groups?: Priorities }>();

  useEffect(() => {
    if (!allowed || !tenantId) return;
    const controller = new AbortController();
    fetch('/api/inventory-assistant?view=priorities', { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load shift priorities.');
        const groups: Priorities = await response.json();
        if (!controller.signal.aborted) setResult({ tenant: tenantId, groups });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ tenant: tenantId });
      });
    return () => controller.abort();
  }, [allowed, tenantId]);

  if (!allowed || !tenantId) return null;
  const current = result?.tenant === tenantId ? result : undefined;

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4" aria-label="Shift priorities">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Shift priorities</h2>
        <Link href="/inventory-assistant" className="text-sm underline underline-offset-2">Ask the assistant</Link>
      </div>
      <p className="text-sm text-muted-foreground">Overdue receipts, putaway open over 24 hours, and orders without an update in 48 hours.</p>
      {current?.groups ? <PriorityList groups={current.groups} /> : (
        <p role="status" className="text-sm">{current ? 'Unable to load shift priorities.' : 'Checking warehouse records…'}</p>
      )}
    </section>
  );
}
