import { createClient } from '@/lib/supabase/server';
import type { User } from '@/types/database';

export interface AuthSession {
  authUser: { id: string; email: string };
  user: User;
  tenantId: string;
}

export async function getCurrentUser(): Promise<AuthSession | null> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return null;
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .single();

  if (error || !user) {
    return null;
  }

  return {
    authUser: { id: authUser.id, email: authUser.email! },
    user,
    tenantId: user.tenant_id,
  };
}
