import Link from 'next/link';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';

export const metadata = { title: 'Compare planned billing options | Invexiqs' };
export default function PlansPage() {
  return <><PublicHeader /><main className="mx-auto max-w-5xl space-y-7 px-5 py-12">
    <h1 className="text-4xl font-bold text-brand-deep-plum">Compare planned billing options</h1>
    <p>Invexiqs is scheduled for June 2027. We’ll publish final rates and plan limits closer to launch.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {[['Monthly', 'Pay one month at a time.'], ['Annual', 'Pay for a full year upfront.']].map(([title, detail]) =>
        <article className="rounded-xl border bg-brand-lavender p-5" key={title}><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2">{detail}</p><p className="mt-3 text-sm">Rate to be announced</p></article>)}
    </div>
    <h2 className="text-xl font-semibold">How plans are designed</h2>
    <p>Pricing is planned around warehouse locations and order volume, with team access included. Prelaunch accounts are free to create.</p>
    <Link className="brand-cta px-4 py-2" href="/auth/signup">Create a prelaunch account</Link>
  </main><PublicFooter /></>;
}
