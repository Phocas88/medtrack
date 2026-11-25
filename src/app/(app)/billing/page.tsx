import Link from 'next/link';
import { plans } from '@/lib/plans';

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-2 text-muted-foreground">Online billing is unavailable. Contact Stokora for help choosing or managing a plan.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map(({ id, name, price, audience }) => (
          <section key={id} className="space-y-2 rounded-lg border bg-card p-5">
            <h2 className="text-lg font-semibold">{name}</h2>
            <p className="text-xl font-semibold">${price} <span className="text-sm font-normal text-muted-foreground">USD / month</span></p>
            <p className="text-sm text-muted-foreground">{audience}</p>
          </section>
        ))}
      </div>
      <Link href="/support" className="inline-block rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Contact support</Link>
    </div>
  );
}
