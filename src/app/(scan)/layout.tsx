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
          <StokoraLogo theme="dark" className="scale-75" />
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
    <div className="flex flex-col h-screen bg-background">
      {/* Minimal top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-slate-950 text-white shrink-0">
        <div className="flex items-center gap-2">
          <StokoraLogo variant="mark" theme="dark" className="h-5 w-5" />
          <StokoraLogo variant="text" theme="dark" className="text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <OnlineIndicator />
          <span className="text-xs text-slate-400 hidden sm:inline">{user.full_name}</span>
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white h-8 px-2"
            onClick={() => signOut()}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Scanner content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>

      {/* Bottom tab bar — compact for small devices */}
      <nav className="flex items-center border-t bg-background shrink-0 safe-area-pb">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'flex-1 flex flex-col items-center gap-0 py-1.5 text-[10px] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <tab.icon className={cn('h-4 w-4', isActive && 'text-primary')} />
              {tab.label}
            </Link>
          );
        })}
      </nav>
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
