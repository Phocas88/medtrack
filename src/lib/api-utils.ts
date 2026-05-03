import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Get authenticated user from cookies. Returns null if not authenticated.
 */
export async function getAuthenticatedUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: dbUser } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return dbUser;
}

/**
 * Standard error response helper
 */
export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Standard success response helper
 */
export function apiSuccess(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Sanitize string input — strips null bytes, trims whitespace
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/\0/g, '')
    .trim()
    .slice(0, 10000); // Max 10k chars
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}
