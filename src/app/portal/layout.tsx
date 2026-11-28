'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import { InvexiqsLogo } from '@/components/ui/invexiqs-logo';
import { PortalContext, type CustomerInfo } from './portal-context';

type PortalAccount =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'error' }
  | { status: 'ready'; customer: CustomerInfo };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [account, setAccount] = useState<PortalAccount>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const isLoginPage = pathname === '/portal/login';

  useEffect(() => {
    setAccount({ status: 'loading' });
    if (isLoginPage) return;

    const controller = new AbortController();
    async function loadAccount() {
      try {
        const { data: { user } } = await createClient().auth.getUser();
        if (controller.signal.aborted) return;
        if (!user) {
          router.replace('/portal/login');
          return;
        }

        const response = await fetch('/api/portal/lookup', { signal: controller.signal, cache: 'no-store' });
        if (controller.signal.aborted) return;
        if (response.status === 403 || response.status === 409) {
          setAccount({ status: 'denied' });
          return;
        }
        if (!response.ok) throw new Error('Could not load customer account');
        const { customer } = await response.json();
        if (controller.signal.aborted) return;
        setAccount(customer
          ? { status: 'ready', customer: { ...customer, address: customer.ship_to_address || null } }
          : { status: 'denied' });
      } catch {
        if (!controller.signal.aborted) setAccount({ status: 'error' });
      }
    }
    void loadAccount();
    return () => controller.abort();
  }, [isLoginPage, router, attempt]);

  async function handleSignOut() {
    setAccount({ status: 'loading' });
    await createClient().auth.signOut();
    router.replace('/portal/login');
  }

  if (isLoginPage) return <>{children}</>;
  if (account.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white" role="status">
        <Loader2 aria-hidden className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading your customer portal</span>
      </div>
    );
  }
  if (account.status === 'denied' || account.status === 'error') {
    const denied = account.status === 'denied';
    return <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="space-y-4 text-center">
        <div className="flex justify-center"><InvexiqsLogo theme="light" size="lg" /></div>
        <h1 className="text-2xl font-bold">{denied ? 'Customer Account Unavailable' : 'Could Not Load Your Customer Account'}</h1>
        <p className="max-w-md text-muted-foreground">{denied ? 'Ask your supplier to verify which account is associated with your email address.' : 'Try loading your account again.'}</p>
        <div className="flex justify-center gap-2">
          {!denied && <Button onClick={() => setAttempt(value => value + 1)}>Retry</Button>}
          <Button variant="outline" onClick={handleSignOut}>Sign Out</Button>
        </div>
      </div>
    </div>;
  }

  const { customer } = account;
  return (
    <PortalContext.Provider value={{ customer, tenantId: customer.tenant_id }}>
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-50 border-b bg-white">
          <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <InvexiqsLogo theme="light" size="sm" />
              <span className="hidden text-xs text-muted-foreground sm:inline">Customer Portal</span>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <span className="hidden text-sm text-muted-foreground sm:inline">{customer.name}</span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut aria-hidden className="mr-2 h-4 w-4" /> Sign Out
              </Button>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </PortalContext.Provider>
  );
}
