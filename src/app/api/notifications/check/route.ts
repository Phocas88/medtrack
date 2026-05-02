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
    const { allowed } = checkRateLimit(request.headers.get('x-forwarded-for') || 'unknown', 30, 60000);
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    // Auth check: require x-api-key header if NOTIFICATION_API_KEY is set
    const apiKey = process.env.NOTIFICATION_API_KEY;
    if (apiKey) {
      const providedKey = request.headers.get('x-api-key');
      if (providedKey !== apiKey) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const supabase = createServiceClient();

    // Get all active tenants
    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id, name');

    if (tenantErr) {
      console.error('Failed to fetch tenants:', tenantErr);
      return NextResponse.json(
        { error: 'Failed to fetch tenants' },
        { status: 500 }
      );
    }

    let totalCreated = 0;
    const results: { tenantId: string; tenantName: string; created: number }[] = [];

    for (const tenant of tenants ?? []) {
      try {
        const created = await checkAndNotify(supabase, tenant.id);
        totalCreated += created;
        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          created,
        });
      } catch (err) {
        console.error(`Error checking tenant ${tenant.id}:`, err);
        results.push({
          tenantId: tenant.id,
          tenantName: tenant.name,
          created: -1, // indicates error
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalCreated,
      tenants: results,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Notification check error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
