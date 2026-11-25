import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkAndNotify } from '@/lib/notifications';
import { checkRateLimit } from '@/lib/rate-limit';

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase service role environment variables');
  }

  return createClient(url, serviceKey);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.NOTIFICATION_API_KEY;
    if (!apiKey || request.headers.get('x-api-key') !== apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const address = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'local';
    if (!checkRateLimit('notifications:' + address, 30, 60000).allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const supabase = createServiceClient();

    // Get all active tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id');

    if (tenantErr) {
      console.error('Failed to fetch tenants:', tenantErr);
      return NextResponse.json(
        { error: 'Failed to fetch tenants' },
        { status: 500 }
      );
    }

    let totalCreated = 0;
    let failures = 0;

    for (const tenant of tenants ?? []) {
      try {
        const created = await checkAndNotify(supabase, tenant.id);
        totalCreated += created;
      } catch {
        failures++;
      }
    }

    return NextResponse.json({
      success: failures === 0,
      totalCreated,
      failures,
      checkedAt: new Date().toISOString(),
    }, { status: failures ? 502 : 200 });
  } catch (err) {
    console.error('Notification check error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
