import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const checks: Record<string, string> = { status: 'ok', timestamp: new Date().toISOString() };

  // Check Supabase connectivity
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      const supabase = createClient(url, key);
      const { error } = await supabase.from('tenants').select('id').limit(1);
      checks.database = error ? 'error' : 'connected';
    } else {
      checks.database = 'not_configured';
    }
  } catch {
    checks.database = 'error';
  }

  checks.stripe = process.env.STRIPE_SECRET_KEY ? 'configured' : 'not_configured';
  checks.email = process.env.RESEND_API_KEY ? 'configured' : 'not_configured';
  checks.sentry = process.env.NEXT_PUBLIC_SENTRY_DSN ? 'configured' : 'not_configured';

  const allHealthy = checks.database === 'connected';
  return NextResponse.json(checks, { status: allHealthy ? 200 : 503 });
}
