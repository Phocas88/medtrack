import Link from 'next/link';
import { PublicHeader } from '@/components/layout/public-header';
import { PublicFooter } from '@/components/layout/public-footer';
import { annualMonthlyEquivalent, annualSavings, launchPricing } from '@/lib/public-pricing';

export const metadata = { title: 'Warehouse pricing and features | Invexiqs', description: 'Compare monthly and annual billing for Invexiqs WMS and see what comes with your warehouse subscription.' };

const featureGroups = [
  ['Workspace', [
    ['Warehouse locations', String(launchPricing.warehouses)],
    ['Team members', `Up to ${launchPricing.teamMembers}`],
    ['Self-serve setup and CSV imports', 'Included'],
  ]],
  ['Inventory and receiving', [
    ['Stock by bin and lot', 'Included'],
    ['Purchase-order receiving and putaway', 'Included'],
    ['Cycle counts and stock movement history', 'Included'],
    ['Mobile barcode scanning and bin labels', 'Included'],
  ]],
  ['Fulfillment and reporting', [
    ['Order picking and shipment posting', 'Included'],
    ['Partial shipments for local orders', 'Included'],
    ['Warehouse dashboard and AI assistant', 'Included'],
  ]],
] as const;

export default function PlansPage() {
  return <><PublicHeader /><main className="mx-auto max-w-5xl space-y-8 px-5 py-12">
    <div className="space-y-3">
      <h1 className="text-4xl font-bold text-brand-deep-plum">Compare pricing and features</h1>
      <p>Planned launch pricing in USD per organization. Both billing options include one warehouse and up to five team members.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <article className="space-y-3 rounded-xl border border-brand-border-gray p-5">
        <h2 className="text-xl font-semibold">Monthly</h2>
        <p><strong className="text-3xl text-brand-royal-plum">{'$'}{launchPricing.monthly}</strong> / month</p>
        <p>Billed monthly per organization.</p>
      </article>
      <article className="space-y-3 rounded-xl border border-brand-border-gray bg-brand-lavender p-5">
        <h2 className="text-xl font-semibold">Annual</h2>
        <p><strong className="text-3xl text-brand-royal-plum">{'$'}{annualMonthlyEquivalent}</strong> / month equivalent</p>
        <p>{'$'}{launchPricing.annual} billed once a year. Save {'$'}{annualSavings} compared with 12 monthly payments.</p>
      </article>
    </div>
    <section aria-labelledby="included-features" className="space-y-4">
      <h2 id="included-features" className="text-2xl font-semibold">What’s included</h2>
      <div className="overflow-hidden rounded-xl border border-brand-border-gray">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="bg-brand-deep-plum text-white"><tr>
            <th scope="col" className="w-1/2 p-2 sm:p-3">Feature</th>
            <th scope="col" className="p-2 sm:p-3">Monthly</th>
            <th scope="col" className="p-2 sm:p-3">Annual</th>
          </tr></thead>
          {featureGroups.map(([group, rows]) => <tbody key={group}>
            <tr className="bg-brand-lavender"><th scope="rowgroup" colSpan={3} className="p-2 text-brand-deep-plum sm:p-3">{group}</th></tr>
            {rows.map(([name, detail]) => <tr className="border-t border-brand-border-gray" key={name}>
              <th scope="row" className="p-2 font-medium sm:p-3">{name}</th>
              <td className="p-2 sm:p-3">{detail}</td><td className="p-2 sm:p-3">{detail}</td>
            </tr>)}
          </tbody>)}
        </table>
      </div>
    </section>
    <p>Need more warehouses or team seats? <Link className="font-semibold underline" href="/#contact">Talk to us about your operation</Link>. See the <Link className="font-semibold underline" href="/integrations-directory">integration roadmap</Link> for planned connectors.</p>
    <section className="space-y-4 rounded-xl bg-brand-warm-cream p-5">
      <h2 className="text-xl font-semibold">Opening in June 2027</h2>
      <p>Create an account now for free. Warehouse access and paid subscriptions open at launch. We’ll announce the exact date closer to June.</p>
      <Link className="brand-cta px-4 py-2" href="/auth/signup">Create a prelaunch account</Link>
    </section>
  </main><PublicFooter /></>;
}
