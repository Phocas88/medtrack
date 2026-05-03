'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User, UserRole } from '@/types/database';

export type EnabledModules = Record<string, boolean>;

interface AuthContextValue {
  user: User | null;
  tenantId: string | null;
  tenantName: string | null;
  role: UserRole | null;
  loading: boolean;
  enabledModules: EnabledModules;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  tenantId: null,
  tenantName: null,
  role: null,
  loading: true,
  enabledModules: {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<EnabledModules>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        const { data } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        setUser(data ?? null);

        // Fetch tenant name + settings for white-label branding and module config
        if (data?.tenant_id) {
          const { data: tenant } = await supabase
            .from('tenants')
            .select('name, settings')
            .eq('id', data.tenant_id)
            .single();
          setTenantName(tenant?.name ?? null);

          // Extract enabled_modules from tenant settings
          const settings = (tenant?.settings as Record<string, unknown>) || {};
          const modules = (settings.enabled_modules as Record<string, boolean>) || {};
          setEnabledModules(modules);
        }
      } catch {
        setUser(null);
        setTenantName(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setLoading(false);
      } else {
        // Re-fetch user record on auth state change
        loadUser();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    setTenantName(null);
    setEnabledModules({});
    router.push('/auth/login');
    router.refresh();
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenantId: user?.tenant_id ?? null,
        tenantName,
        role: user?.role ?? null,
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
