import type { ReactNode } from 'react';
import { InvexiqsLogo } from '@/components/ui/invexiqs-logo';
import Link from 'next/link';

const publicNavigation = [
  ['Contact', '/#contact'],
  ['Features', '/#features'],
  ['Live demo', '/demo'],
  ['Pricing', '/#pricing'],
  ['Sign in', '/auth/login'],
  ['Solutions', '/#solutions'],
] as const;

export function PublicHeader({ currentPath, controls }: { currentPath?: string; controls?: ReactNode }) {
  return (
    <header className="border-b border-brand-border-gray bg-brand-white text-brand-deep-plum">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-3 px-5 py-4 lg:px-8">
        <Link href="/" aria-label="Invexiqs WMS home" className="flex w-36 max-w-[48%] items-center rounded-sm py-1 sm:w-48">
          <InvexiqsLogo />
        </Link>
        <Link href="/#contact" className="brand-cta order-2 px-3 py-2 text-sm lg:order-3">
          Request a pilot
        </Link>
        <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-brand-muted-gray lg:order-2 lg:w-auto">
          {publicNavigation.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={currentPath === href ? 'page' : undefined}
              className="rounded-sm py-1 hover:text-brand-royal-plum hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:font-semibold aria-[current=page]:text-brand-royal-plum"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {controls && <div className="border-t border-brand-border-gray">{controls}</div>}
    </header>
  );
}
