'use client';

import { AuthProvider, useAuth } from '@/components/providers/auth-provider';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut, Wifi, WifiOff, ClipboardList, Search, BarChart3 } from 'lucide-react';
import { StokoraLogo } from '@/components/ui/stokora-logo';
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
      <div className="flex items-center justify-center h-screen bg-slate-950 text-white">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <StokoraLogo theme="dark" size="sm" />
          <span className="text-sm">Loading scanner...</span>
        </div>
      </div>
    );
  }

  const tabs = [
    { label: 'Find item', href: '/scan/find', icon: Search },
    { label: 'My stats', href: '/scan/stats', icon: BarChart3 },
    { label: 'Tasks', href: '/scan', icon: ClipboardList },
  ];

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="shrink-0 border-b bg-slate-950 text-white">
        <div className="flex items-center justify-between px-4 py-2">
          <StokoraLogo theme="dark" size="sm" />
          <div className="flex items-center gap-3">
            <OnlineIndicator />
            <span className="hidden text-xs text-slate-400 sm:inline">{user.full_name}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-slate-300 hover:text-white"
              aria-label="Sign out"
              onClick={() => signOut()}
            >
              <LogOut aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
        <nav aria-label="Scanner navigation" className="flex items-center border-t border-slate-800 px-2">
          {tabs.map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className={cn(
                'flex min-h-11 flex-1 items-center justify-center gap-2 border-b-2 border-transparent px-2 text-sm font-medium text-slate-300 hover:bg-slate-900',
                pathname === href && 'border-emerald-400 text-white',
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function OnlineIndicator() {
  if (typeof navigator === 'undefined') return null;
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  return online ? (
    <Wifi className="h-4 w-4 text-green-400" />
  ) : (
    <WifiOff className="h-4 w-4 text-red-400" />
  );
}

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ScannerShell>{children}</ScannerShell>
    </AuthProvider>
  );
}
