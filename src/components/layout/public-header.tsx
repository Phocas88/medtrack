import type { ReactNode } from 'react';
import Image from 'next/image';
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
    <header className="border-b border-slate-200 bg-white text-slate-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-5 gap-y-3 px-5 py-4 lg:px-8">
        <Link href="/" aria-label="Stokora" className="flex h-12 w-36 shrink-0 items-center justify-center overflow-hidden rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:h-14 sm:w-40">
          <Image
            src="/stokora-logo.png"
            alt="Stokora WMS"
            width={1536}
            height={1024}
            sizes="(min-width: 640px) 176px, 160px"
            className="h-auto w-[110%] max-w-none shrink-0"
          />
        </Link>
        <Link href="/#contact" className="order-2 rounded-md bg-emerald-800 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-900 lg:order-3">
          Request a pilot
        </Link>
        <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-slate-700 lg:order-2 lg:w-auto">
          {publicNavigation.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={currentPath === href ? 'page' : undefined}
              className="rounded-sm py-1 hover:text-emerald-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:font-semibold aria-[current=page]:text-emerald-800"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      {controls && <div className="border-t border-slate-200">{controls}</div>}
    </header>
  );
}
