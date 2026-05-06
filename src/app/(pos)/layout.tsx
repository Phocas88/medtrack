'use client';

import { AuthProvider, useAuth } from '@/components/providers/auth-provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LogOut, User } from 'lucide-react';
import { StokoraLogo } from '@/components/ui/stokora-logo';
import { Button } from '@/components/ui/button';

function POSShell({ children }: { children: React.ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/auth/login?redirect=/pos');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950 text-white">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <StokoraLogo theme="dark" />
          <span className="text-sm">Loading register...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Register top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-slate-950 text-white shrink-0">
        <div className="flex items-center gap-3">
          <StokoraLogo theme="dark" size="sm" />
          <span className="text-[10px] text-slate-500 ml-1">POS</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <User className="h-3.5 w-3.5" />
            {user.full_name}
          </div>
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

      {/* Register content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}

export default function POSLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <POSShell>{children}</POSShell>
    </AuthProvider>
  );
}
