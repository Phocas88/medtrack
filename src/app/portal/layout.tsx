'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import { InvexiqsLogo } from '@/components/ui/invexiqs-logo';
import { PortalContext, type CustomerInfo } from './portal-context';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  const isLoginPage = pathname === '/portal/login';

  useEffect(() => {
    if (isLoginPage) {
      setLoading(false);
      return;
    }

    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/portal/login');
        return;
      }

      // Use API route to bypass RLS for customer lookup
      const res = await fetch('/api/portal/lookup');
      if (!res.ok) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      const { customer: customerRecord } = await res.json();
      if (!customerRecord) {
        setAccessDenied(true);
        setLoading(false);
        return;
      }

      setCustomer({
        ...customerRecord,
        address: customerRecord.ship_to_address || null,
      });
      setLoading(false);
    }

    init();
  }, [isLoginPage, router]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/portal/login');
  }

  // Login page renders without the portal chrome
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="text-center space-y-4">
          <div className="flex justify-center"><InvexiqsLogo theme="light" size="lg" /></div>

          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground max-w-md">
            No customer account is associated with your email address. Please contact your supplier to request portal access.
          </p>
          <Button variant="outline" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
    );
  }

  return (
    <PortalContext.Provider value={{ customer: customer!, tenantId: customer!.tenant_id }}>
      <div className="min-h-screen bg-white">
        {/* Header */}
        <header className="sticky top-0 z-50 border-b bg-white">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <InvexiqsLogo theme="light" size="sm" />
              <span className="text-xs text-muted-foreground">Customer Portal</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {customer!.name}
              </span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </PortalContext.Provider>
  );
}
