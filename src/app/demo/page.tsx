'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PublicHeader } from '@/components/layout/public-header';
import { roleRoutes } from '@/lib/demo-roles';

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
  const [error, setError] = useState('');
  useEffect(() => { setReady(true); }, []);

  async function launch(role: (typeof roles)[number]['key']) {
    if (loading) return;
    setLoading(role);
    setError('');
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
      setError('The demo could not sign in. Please try again in a moment.');
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader currentPath="/demo" />
      <main className="mx-auto max-w-6xl space-y-7 px-5 py-12 sm:py-16">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">See Stokora in action</h1>
          <p className="text-lg text-slate-700">Choose a role to open the real Stokora interface in a shared sample warehouse.</p>
          <p className="text-sm text-slate-700">Use sample information only. Other demo visitors share this warehouse.</p>
        </div>
        <div aria-label="Demo roles" className="grid gap-4 sm:grid-cols-2">
          {roles.map(({ key, title, detail }) => (
            <button
              type="button"
              key={key}
              disabled={!ready || loading !== null}
              onClick={() => launch(key)}
              className="space-y-2 rounded-lg border border-slate-300 bg-white p-5 text-left hover:border-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-70"
            >
              <span className="block font-semibold">{title}</span>
              <span className="block text-sm text-slate-700">{loading === key ? 'Opening demo…' : detail}</span>
            </button>
          ))}
        </div>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-red-900">{error}</p>}
        <Link href="/#contact" className="inline-block font-medium text-emerald-800 underline">Request a walkthrough or pilot</Link>
      </main>
    </div>
  );
}
