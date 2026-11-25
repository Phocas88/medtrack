import Link from 'next/link';

export const metadata = { title: 'Get started | Stokora WMS', robots: { index: false } };

export default function SignupPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-14 text-slate-950">
      <div className="w-full max-w-lg space-y-5 rounded-lg border border-slate-200 bg-white p-8">
        <Link href="/" className="text-lg font-semibold">Stokora</Link>
        <h1 className="text-3xl font-bold">Get started with Stokora</h1>
        <p className="text-slate-700">Request a pilot to discuss your warehouse workflow and account setup.</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/#contact" className="rounded-md bg-emerald-800 px-4 py-2 font-semibold text-white hover:bg-emerald-900">
            Request a pilot
          </Link>
          <Link href="/auth/login" className="rounded-sm font-medium text-emerald-800 underline">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
