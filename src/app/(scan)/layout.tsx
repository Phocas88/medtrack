'use client';

import { AuthProvider, useAuth } from '@/components/providers/auth-provider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LogOut, Wifi, WifiOff, ClipboardList, Search, BarChart3 } from 'lucide-react';
import { WorkspaceLogo } from '@/components/ui/workspace-logo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function ScannerShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login?redirect=/scan');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-dvh bg-brand-deep-plum text-white">
        <div className="flex flex-col items-center gap-3">
          <WorkspaceLogo />
          <span className="text-sm">Loading scanner...</span>
        </div>
      </div>
    );
  }

  const tabs = [
    { label: 'Tasks', href: '/scan', icon: ClipboardList },
    { label: 'Find Item', href: '/scan/find', icon: Search },
    { label: 'My Stats', href: '/scan/stats', icon: BarChart3 },
  ];

  return (
    <div className="flex h-dvh flex-col bg-muted/40">
      <header className="shrink-0 border-b border-white/10 bg-brand-deep-plum text-white">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <div className="min-w-0"><WorkspaceLogo /></div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <OnlineIndicator />
            <span className="hidden max-w-40 truncate text-xs text-brand-lavender sm:inline">{user.full_name}</span>
            <Button variant="ghost" className="size-11 p-0 text-brand-lavender hover:bg-white/10 hover:text-white"
              aria-label="Sign out" onClick={() => void signOut()}>
              <LogOut aria-hidden className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-hidden">
        {children}
      </main>

      <nav aria-label="Scanner navigation" className="shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2 px-3 py-2">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link key={tab.href} href={tab.href} aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
                )}>
                <tab.icon aria-hidden className="size-[18px]" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function OnlineIndicator() {
  const [online, setOnline] = useState<boolean>();
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  if (online === undefined) return null;
  const Icon = online ? Wifi : WifiOff;
  return <span role="status" className={cn(
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
    online ? 'bg-emerald-950 text-emerald-100' : 'bg-amber-950 text-amber-100',
  )}>
    <Icon aria-hidden className="size-3.5" />{online ? 'Online' : 'Offline'}
  </span>;
}

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ScannerShell>{children}</ScannerShell>
    </AuthProvider>
  );
}
