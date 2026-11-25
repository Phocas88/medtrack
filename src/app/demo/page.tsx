'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PublicHeader } from '@/components/layout/public-header';
import { roleRoutes } from '@/lib/demo-roles';

const sampleTasks = {
  cashier: ['Add packing tape to a sample sale.', 'Add sample item', 'Packing tape added. Sample subtotal: $4.50.'],
  customer: ['Check the status of sample order SO-1042.', 'View sample order', 'SO-1042 is packed and awaiting carrier pickup.'],
  associate: ['Pick six cartons of shipping labels from bin B-04.', 'Confirm sample pick', 'Six cartons picked from bin B-04.'],
  manager: ['Review a sample count of 24 rolls of packing tape in bin A-01.', 'Record sample count', 'Count recorded. Bin A-01 has 24 rolls of packing tape.'],
} as const;

const roles = [
  { key: 'cashier', title: 'Cashier Register', detail: 'Explore the product catalog and register layout.' },
  { key: 'customer', title: 'Customer Portal', detail: 'Browse a sample catalog and view order history.' },
  { key: 'associate', title: 'Floor / Warehouse Associate', detail: 'Open the mobile scanner to see picking and counting tasks.' },
  { key: 'manager', title: 'Management Desktop', detail: 'View the warehouse dashboard, stock, and bin locations.' },
] as const;

export default function DemoPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [sampleRole, setSampleRole] = useState<keyof typeof sampleTasks | null>(null);
  const [taskDone, setTaskDone] = useState(false);
  const sample = sampleRole ? sampleTasks[sampleRole] : null;
  useEffect(() => { setReady(true); }, []);

  async function launch(role: (typeof roles)[number]['key']) {
    if (loading) return;
    setLoading(role);
    setSampleRole(null);
    setTaskDone(false);
    try {
      const response = await fetch('/api/demo/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error('Demo sign-in failed');
      router.push(roleRoutes[role]);
      router.refresh();
    } catch {
      setSampleRole(role);
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader currentPath="/demo" />
      <main className="mx-auto max-w-6xl space-y-7 px-5 py-12 sm:py-16">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">See Stokora in action</h1>
          <p className="text-lg text-slate-700">Choose a role to explore a sample warehouse workflow.</p>
          <p className="text-sm text-slate-700">Use sample information only. The full demo uses a shared sample warehouse.</p>
        </div>
        <div aria-label="Demo roles" className="grid gap-4 sm:grid-cols-2">
          {roles.map(({ key, title, detail }) => (
            <button
              type="button"
              key={key}
              disabled={!ready || loading !== null}
              aria-pressed={sampleRole === key}
              onClick={() => launch(key)}
              className="space-y-2 rounded-lg border border-slate-300 bg-white p-5 text-left hover:border-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-70"
            >
              <span className="block font-semibold">{title}</span>
              <span className="block text-sm text-slate-700">{loading === key ? 'Opening demo…' : detail}</span>
            </button>
          ))}
        </div>
        {sample && (
          <section aria-labelledby="sample-title" className="space-y-3 rounded-lg border border-slate-300 bg-white p-5">
            <h2 id="sample-title" className="text-xl font-semibold">
              {roles.find(({ key }) => key === sampleRole)?.title} sample walkthrough
            </h2>
            <p className="text-sm text-slate-700">The full demo is temporarily unavailable. This walkthrough uses sample data in your browser.</p>
            <p>{sample[0]}</p>
            <button
              type="button"
              onClick={() => setTaskDone(!taskDone)}
              className="rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
            >
              {taskDone ? 'Reset sample task' : sample[1]}
            </button>
            <p role="status" className="text-sm text-emerald-900">{taskDone && sample[2]}</p>
          </section>
        )}
        <Link href="/#contact" className="inline-block font-medium text-emerald-800 underline">Request a walkthrough or pilot</Link>
      </main>
    </div>
  );
}
