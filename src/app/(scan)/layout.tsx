'use client';

import { AuthProvider, useAuth } from '@/components/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Package, LogOut, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ScannerShell({ children }: { children: React.ReactNode }) {
  const { user, tenantName, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login?redirect=/scan');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-white">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <Package className="h-10 w-10" />
          <span className="text-sm">Loading scanner...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Minimal top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-slate-950 text-white shrink-0">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          <span className="font-semibold text-sm">{tenantName || 'Phocas WMS'}</span>
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

      {/* Scanner content - full remaining height */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
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
