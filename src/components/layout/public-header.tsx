'use client';

import type { ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { InvexiqsLogo } from '@/components/ui/invexiqs-logo';

const publicNavigation = [
  ['Contact', '/#contact'],
  ['Features', '/#features'],
  ['Integrations', '/#integrations'],
  ['Live demo', '/demo'],
  ['Pricing', '/#pricing'],
  ['Sign in', '/auth/login'],
  ['Solutions', '/#solutions'],
  ['Warehouse AI', '/#warehouse-ai'],
] as const;

export function PublicHeader({ currentPath, controls }: { currentPath?: string; controls?: ReactNode }) {
  return (
    <header className="border-b border-brand-border-gray bg-brand-white text-brand-deep-plum">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3 xl:gap-6 xl:px-8">
        <Link href="/" aria-label="Invexiqs WMS home" className="flex w-36 min-w-0 items-center rounded-sm py-1 sm:w-48">
          <InvexiqsLogo />
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-4 text-sm font-medium text-brand-muted-gray lg:flex xl:gap-5">
          {publicNavigation.map(([label, href]) => (
            <Link key={href} href={href} aria-current={currentPath === href ? 'page' : undefined}
              className="whitespace-nowrap rounded-sm py-2 hover:text-brand-royal-plum hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=page]:font-semibold">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/#contact" className="brand-cta min-h-11 whitespace-nowrap px-3 py-2 text-sm">Request a pilot</Link>
          <Popover.Root>
            <Popover.Trigger aria-label="Menu" className="inline-flex size-11 items-center justify-center rounded-lg border border-brand-control-border hover:bg-brand-lavender focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 lg:hidden">
              <Menu aria-hidden size={21} />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content aria-label="Site menu" align="end" sideOffset={8} collisionPadding={16}
                className="z-50 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-brand-border-gray bg-brand-white p-2 text-brand-deep-plum shadow-lg lg:hidden">
                <nav aria-label="Mobile navigation">
                  {publicNavigation.map(([label, href]) => (
                    <Popover.Close asChild key={href}>
                      <Link href={href} aria-current={currentPath === href ? 'page' : undefined}
                        className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-brand-lavender focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset">
                        {label}
                      </Link>
                    </Popover.Close>
                  ))}
                </nav>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      </div>
      {controls && <div className="border-t border-brand-border-gray">{controls}</div>}
    </header>
  );
}
