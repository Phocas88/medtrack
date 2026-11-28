'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User, UserRole } from '@/types/database';
import { workspaceLogoUrl } from '@/lib/workspace-logo';
import type { TenantPreset } from '@/lib/presets';

export type EnabledModules = Record<string, boolean>;

interface AuthContextValue {
  user: User | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantLogoUrl: string | null;
  setTenantLogoUrl: (url: string | null) => void;
  accountEmail: string | null;
  role: UserRole | null;
  preset: TenantPreset;
  loading: boolean;
  enabledModules: EnabledModules;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  tenantId: null,
  tenantName: null,
  tenantLogoUrl: null,
  setTenantLogoUrl: () => {},
  accountEmail: null,
  role: null,
  preset: 'full',
  loading: true,
  enabledModules: {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [tenantLogoUrl, setTenantLogoUrl] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<EnabledModules>({});
  const [preset, setPreset] = useState<TenantPreset>('full');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let requestId = 0;

    async function loadUser() {
      const current = ++requestId;
      try {
        const response = await fetch('/api/workspace/profile', { cache: 'no-store' });
        const profile = await response.json();
        if (current !== requestId) return;
        setAccountEmail(profile.email ?? null);
        if (!response.ok) {
          setUser(null);
          setTenantName(null);
          setTenantLogoUrl(null);
          setEnabledModules({});
          setPreset('full');
          return;
        }
        setUser(profile.user);
        setTenantName(profile.tenant?.name ?? null);
        const settings = (profile.tenant?.settings ?? {}) as Record<string, unknown>;
        setTenantLogoUrl(workspaceLogoUrl(settings.logo_url));
        setEnabledModules((settings.enabled_modules as EnabledModules) ?? {});
        setPreset((settings.preset as TenantPreset) ?? 'full');
      } catch {
        if (current === requestId) {
          setUser(null);
          setTenantName(null);
          setTenantLogoUrl(null);
        }
      } finally {
        if (current === requestId) setLoading(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      clearTimeout(refreshTimer);
      if (!session) {
        requestId++;
        setUser(null);
        setTenantName(null);
        setTenantLogoUrl(null);
        setAccountEmail(null);
        setEnabledModules({});
        setPreset('full');
        setLoading(false);
      } else {
        // Supabase holds the auth lock while it dispatches this callback.
        refreshTimer = setTimeout(() => { void loadUser(); }, 0);
      }
    });

    return () => {
      requestId++;
      clearTimeout(refreshTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setTenantName(null);
    setTenantLogoUrl(null);
    setEnabledModules({});
    setPreset('full');
    router.push('/auth/login');
    router.refresh();
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenantId: user?.tenant_id ?? null,
        tenantName,
        tenantLogoUrl,
        setTenantLogoUrl,
        accountEmail,
        role: user?.role ?? null,
        preset,
        loading,
        enabledModules,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
