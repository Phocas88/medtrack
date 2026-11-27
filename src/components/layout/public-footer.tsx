import Link from 'next/link';
import { PublicHelp } from './public-help';

const groups = [
  ['Product', [['Warehouse features', '/#features'], ['Warehouse AI', '/#warehouse-ai'], ['Who it’s for', '/#solutions']]],
  ['Get started', [['Compare plans', '/plans'], ['Live demo', '/demo'], ['Create a prelaunch account', '/auth/signup'], ['Request a pilot', '/#contact']]],
  ['Resources', [['Integration roadmap', '/integrations-directory'], ['Warehouse guide', '/guide'], ['Support', '/support']]],
  ['Free tools', [['Barcode and bin labels', '/tools#barcode'], ['Reorder-point calculator', '/tools#reorder'], ['CSV import templates', '/tools#templates']]],
] as const;

export function PublicFooter() {
  return <footer className="bg-brand-deep-plum text-brand-white">
    <div className="mx-auto max-w-7xl space-y-8 px-5 py-10 lg:px-8">
      <nav aria-label="Footer navigation" className="grid grid-cols-2 gap-6 md:grid-cols-4">
        {groups.map(([label, links]) => <section key={label}>
          <h2 className="font-semibold">{label}</h2>
          <ul className="mt-3 space-y-2 text-sm text-brand-lavender">
            {links.map(([text, href]) => <li key={href}><Link className="hover:underline" href={href}>{text}</Link></li>)}
          </ul>
        </section>)}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-brand-lilac/50 pt-5 text-sm">
        <p>© {new Date().getFullYear()} Invexiqs WMS</p>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/legal/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/legal/terms" className="hover:underline">Terms of Service</Link>
          <PublicHelp />
        </div>
      </div>
    </div>
  </footer>;
}
