import Link from 'next/link';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { availableConnectors, invexiqsSuite, requestedConnectors } from '@/lib/public-integration-directory';

export const metadata = { title: 'Integration Directory | Invexiqs' };

export default function DirectoryPage() {
  return <><PublicHeader /><main className="mx-auto max-w-5xl space-y-10 px-5 py-12">
    <div className="space-y-3">
      <h1 className="text-4xl font-bold text-brand-deep-plum">Integration Directory</h1>
      <p>Explore Invexiqs WMS connectors and register interest in the systems your team uses.</p>
    </div>
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">WMS Connectors</h2>
      <p>These connectors require provider authorization and workspace setup.</p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {availableConnectors.map(([name, detail]) => <li className="rounded-xl border p-5" key={name}><h3 className="text-lg font-semibold">{name}</h3><p className="mt-2">{detail}</p></li>)}
      </ul>
    </section>
    <section id="requests" className="space-y-4 rounded-xl bg-brand-lavender p-5">
      <h2 className="text-2xl font-semibold">Request an Integration</h2>
      <p>Tell us which providers you need for your warehouse. The providers below are accepting requests for future support.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {requestedConnectors.map(([category, names]) => <div key={category}>
          <h3 className="font-semibold">{category}</h3>
          <ul className="list-inside list-disc">{names.map(name => <li key={name}>{name}</li>)}</ul>
        </div>)}
      </div>
      <Link href="/#contact" className="inline-block font-semibold text-brand-royal-plum underline">Tell Us What You Need</Link>
    </section>
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold">Invexiqs Product Roadmap</h2>
      <p>Register interest in future products. The names below describe proposed products and availability is subject to release.</p>
      <ul className="grid list-inside list-disc gap-2 sm:grid-cols-2">{invexiqsSuite.map(name => <li key={name}>{name}</li>)}</ul>
    </section>
  </main><PublicFooter /></>;
}
