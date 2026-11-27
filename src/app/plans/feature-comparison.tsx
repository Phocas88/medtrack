'use client';

import Link from 'next/link';
import { useState } from 'react';
import { pricingTiers } from '@/lib/public-pricing';

const included = ['Included', 'Included', 'Included'] as const;
const growth = ['—', 'Included', 'Included'] as const;
const connectedAtLaunch = ['—', 'At launch', 'At launch'] as const;

const groups = [
  { name: 'Workspace and team', rows: [
    ['Warehouse locations', pricingTiers.map(plan => plan.warehouses)],
    ['Team members', pricingTiers.map(plan => plan.seats)],
    ['Self-serve warehouse setup', included],
    ['CSV product and opening-balance imports', included],
    ['Role-based access for managers and floor staff', included],
  ] },
  { name: 'Inventory and traceability', rows: [
    ['SKU catalog and product categories', included],
    ['Product archiving and restoration', included],
    ['Stock by bin and lot', included],
    ['Serial capture on supported receipts and shipments', included],
    ['Lot expiration tracking', included],
    ['Quarantine holds and dispositions', growth],
    ['Stock movement history', included],
    ['Cycle counts and variance review', included],
  ] },
  { name: 'Purchasing and inbound', rows: [
    ['Supplier records', included],
    ['Purchase orders', included],
    ['Partial purchase-order receiving', included],
    ['Shortage and damage recording', included],
    ['Receiving labels', included],
    ['Putaway tasks', included],
    ['Reorder levels and low-stock views', included],
    ['Dock appointments', growth],
  ] },
  { name: 'Warehouse floor', rows: [
    ['Mobile barcode scanning and bin labels', included],
    ['Assign warehouse scanner tasks', included],
    ['Pick-bin replenishment', growth],
    ['Warehouse transfers and partial receipts', growth],
    ['Kit assembly from components', growth],
  ] },
  { name: 'Orders and fulfillment', rows: [
    ['Order desk with search and status filters', included],
    ['Customer records', included],
    ['Picking and shipment posting', included],
    ['On-hand stock reservations for orders', included],
    ['Carton SKU verification', included],
    ['Partial shipments for local orders', included],
    ['Sales returns', included],
    ['Customer portal', growth],
  ] },
  { name: 'Reporting and AI', rows: [
    ['Warehouse dashboard and AI assistant', included],
    ['Inventory value and movement reporting', included],
    ['Inventory and order report exports', included],
    ['Metrics with drill-downs', growth],
    ['Assigned warehouse follow-ups with resolution history', growth],
  ] },
  { name: 'Integrations at launch', rows: [
    ['Shopify order import and tracking', connectedAtLaunch],
    ['WooCommerce order connection', connectedAtLaunch],
    ['EasyPost carrier rates and shipping labels', connectedAtLaunch],
    ['QuickBooks Online eligible invoice export', connectedAtLaunch],
    ['Square retail connection', connectedAtLaunch],
    ['Workflow automation through Zapier', ['—', '—', 'At launch']],
  ] },
] as const;

export function FeatureComparison() {
  const [annual, setAnnual] = useState(false);
  const [search, setSearch] = useState('');
  const [mobilePlan, setMobilePlan] = useState(0);
  const showPlan = (index: number) => index === mobilePlan ? 'table-cell' : 'hidden md:table-cell';
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
    <label className="flex items-center gap-3 text-sm font-semibold md:hidden">Plan to view
      <select value={mobilePlan} onChange={event => setMobilePlan(Number(event.target.value))} className="min-h-11 rounded-md border border-brand-control-border bg-brand-white px-3">
        {pricingTiers.map((plan, index) => <option key={plan.name} value={index}>{plan.name}</option>)}
      </select>
    </label>
    <div className="overflow-hidden rounded-xl border border-brand-border-gray">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-brand-lavender">
          <tr>
            <th scope="col" className="w-3/5 bg-brand-lavender p-3 md:w-[34%]">Features</th>
            {pricingTiers.map((plan, index) => <th key={plan.name} scope="col" className={`w-2/5 space-y-2 break-words p-3 align-top md:w-auto ${showPlan(index)}`}>
              <span className="block text-lg font-bold text-brand-deep-plum">{plan.name}</span>
              <span className="block"><strong className="text-xl text-brand-royal-plum">{'$'}{annual ? plan.annual / 12 : plan.monthly}</strong> / mo{annual && ' equivalent'}</span>
              <span className="block font-normal">{annual ? `$${plan.annual.toLocaleString('en-US')} billed annually` : 'Billed monthly'}</span>
              <Link href="/auth/signup" aria-label={`Register for ${plan.name} prelaunch`} className="brand-cta inline-flex px-2 py-1 text-xs">Register</Link>
            </th>)}
          </tr>
        </thead>
        {matches.map(group => <tbody key={group.name}>
          <tr className="bg-brand-deep-plum text-white"><th scope="rowgroup" colSpan={2} className="p-3 md:hidden">{group.name}</th><th scope="rowgroup" colSpan={4} className="hidden p-3 md:table-cell">{group.name}</th></tr>
          {group.rows.map(([name, values]) => <tr key={name} className="border-t border-brand-border-gray">
            <th scope="row" className="bg-brand-white p-3 font-medium">{name}</th>
            {values.map((value, i) => <td className={`p-3 ${showPlan(i)}`} key={pricingTiers[i].name}>{value === '—' ? <span aria-label="Not included">—</span> : value}</td>)}
          </tr>)}
        </tbody>)}
        {!matches.length && <tbody><tr><td colSpan={2} className="p-3 md:hidden">No matching features.</td><td colSpan={4} className="hidden p-3 md:table-cell">No matching features.</td></tr></tbody>}
      </table>
    </div>
    <p className="text-sm text-brand-muted-gray">Scale includes the Growth features with more warehouse and team capacity.</p>
  </section>;
}
