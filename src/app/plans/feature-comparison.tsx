'use client';

import Link from 'next/link';
import { useState } from 'react';
import { pricingTiers } from '@/lib/public-pricing';

const included = ['Included', 'Included', 'Included'];
const groups = [
  { name: 'Workspace', rows: [
    ['Warehouse locations', pricingTiers.map(plan => plan.warehouses)],
    ['Team members', pricingTiers.map(plan => plan.seats)],
    ['Self-serve setup and CSV imports', included],
    ['Warehouse transfers', ['—', 'Included', 'Included']],
  ] },
  { name: 'Inventory and receiving', rows: [
    ['Stock by bin and lot', included],
    ['Purchase-order receiving and putaway', included],
    ['Mobile barcode scanning and bin labels', included],
    ['Cycle counts and stock movement history', included],
    ['Pick-bin replenishment', ['—', 'Included', 'Included']],
  ] },
  { name: 'Fulfillment and reporting', rows: [
    ['Picking and shipment posting', included],
    ['Partial shipments for local orders', included],
    ['Warehouse dashboard and AI assistant', included],
    ['Warehouse follow-up queue', ['—', 'Included', 'Included']],
  ] },
  { name: 'Planned integrations', rows: [
    ['Shopify, EasyPost and QuickBooks Online', ['—', 'Planned', 'Planned']],
    ['Workflow automation through Zapier', ['—', '—', 'Planned']],
  ] },
] as const;

export function FeatureComparison() {
  const [annual, setAnnual] = useState(false);
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const matches = groups.map(group => ({
    ...group,
    rows: group.rows.filter(([feature]) => !query || `${group.name} ${feature}`.toLowerCase().includes(query)),
  })).filter(group => group.rows.length);
  return <section aria-label="Compare Invexiqs plans" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <fieldset className="flex gap-4 text-sm font-semibold">
        <legend className="sr-only">Billing interval</legend>
        <label className="flex items-center gap-2"><input type="radio" name="billing" checked={!annual} onChange={() => setAnnual(false)} />Monthly</label>
        <label className="flex items-center gap-2"><input type="radio" name="billing" checked={annual} onChange={() => setAnnual(true)} />Annual</label>
      </fieldset>
      <label className="text-sm font-medium">Search features
        <input type="search" className="ml-2 max-w-full rounded-md border border-brand-control-border px-2 py-2" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
    </div>
    <div tabIndex={0} role="region" aria-label="Scrollable plan comparison" className="overflow-x-auto rounded-xl border border-brand-border-gray">
      <table className="w-full min-w-[39rem] table-fixed text-left text-sm">
        <thead className="bg-brand-lavender">
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-[8.5rem] bg-brand-lavender p-3 sm:w-[30%]">Features</th>
            {pricingTiers.map(plan => <th key={plan.name} scope="col" className="space-y-2 p-3 align-top">
              <span className="block text-lg font-bold text-brand-deep-plum">{plan.name}</span>
              <span className="block"><strong className="text-xl text-brand-royal-plum">{'$'}{annual ? plan.annual / 12 : plan.monthly}</strong> / mo{annual && ' equivalent'}</span>
              <span className="block font-normal">{annual ? `$${plan.annual.toLocaleString('en-US')} billed annually` : 'Billed monthly'}</span>
              <Link href="/auth/signup" aria-label={`Register for ${plan.name} prelaunch`} className="brand-cta inline-flex px-2 py-1 text-xs">Register</Link>
            </th>)}
          </tr>
        </thead>
        {matches.map(group => <tbody key={group.name}>
          <tr className="bg-brand-deep-plum text-white"><th scope="rowgroup" colSpan={4} className="p-3"><span className="sticky left-3">{group.name}</span></th></tr>
          {group.rows.map(([name, values]) => <tr key={name} className="border-t border-brand-border-gray">
            <th scope="row" className="sticky left-0 bg-brand-white p-3 font-medium">{name}</th>
            {values.map((value, i) => <td className="p-3" key={pricingTiers[i].name}>{value === '—' ? <span aria-label="Not included">—</span> : value}</td>)}
          </tr>)}
        </tbody>)}
        {!matches.length && <tbody><tr><td colSpan={4} className="p-3">No matching features.</td></tr></tbody>}
      </table>
    </div>
    <p className="text-sm text-brand-muted-gray">On smaller screens, scroll across to see all three plans. Scale includes the Growth features with more warehouse and team capacity.</p>
  </section>;
}
