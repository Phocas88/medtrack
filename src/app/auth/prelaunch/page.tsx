import Link from 'next/link';
import { redirect } from 'next/navigation';
import { InvexiqsLogo } from '@/components/ui/invexiqs-logo';
import { createClient } from '@/lib/supabase/server';

async function signOut() {
  'use server';
  const db = await createClient();
  await db.auth.signOut();
  redirect('/auth/login');
}

async function openWorkspace() {
  'use server';
  const db = await createClient();
  const { data: status } = await db.rpc('prelaunch_status');
  if (status !== 'open') redirect('/auth/prelaunch');
  const { error } = await db.rpc('bootstrap_tenant', { p_name: '', p_full_name: '' });
  if (error) redirect('/auth/prelaunch?setup=failed');
  redirect('/onboarding');
}

export default async function PrelaunchPage({ searchParams }: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect('/auth/login');
  const { data: status, error } = await db.rpc('prelaunch_status');
  if (!error && status === 'none') redirect('/dashboard');
  const { setup } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-brand-lavender px-5 py-10">
      <section className="w-full max-w-lg space-y-5 rounded-2xl border border-brand-border-gray bg-brand-white p-6 text-brand-deep-plum sm:p-9">
        <Link href="/" className="inline-block"><InvexiqsLogo size="lg" /></Link>
        <h1 className="text-3xl font-bold">{status === 'open' ? 'Invexiqs is open' : 'Your prelaunch account is ready'}</h1>
        {error ? <p role="alert">We couldn’t check workspace access. Please refresh or sign in again.</p> : status === 'open' ? (
          <>
            <p>Set up your warehouse to start using Invexiqs WMS.</p>
            {setup === 'failed' && <p role="alert">We couldn’t create your workspace. Please try again or contact support.</p>}
            <form action={openWorkspace}><button className="brand-cta px-4 py-2">Set up my workspace</button></form>
          </>
        ) : (
          <>
            <p>Invexiqs WMS is scheduled to launch in <strong>June 2027</strong>. We’ll post the exact date on our website closer to launch.</p>
            <p>You’re signed in as <strong className="break-all">{user.email}</strong>. Warehouse access will open at launch.</p>
            <Link className="inline-block font-semibold text-brand-royal-plum underline" href="/demo">Explore the live demo</Link>
          </>
        )}
        <form action={signOut}><button className="text-sm underline">Sign out</button></form>
      </section>
    </main>
  );
}
