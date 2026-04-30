import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('Missing Supabase service role environment variables');
  }

  return createClient(url, serviceKey);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, email, fullName, companyName } = body;

    if (!userId || !email || !fullName || !companyName) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, email, fullName, companyName' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Create tenant
    const slug = slugify(companyName) + '-' + Date.now().toString(36);
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({
        name: companyName,
        slug,
        settings: {},
      })
      .select()
      .single();

    if (tenantError) {
      console.error('Tenant creation error:', tenantError);
      return NextResponse.json(
        { error: 'Failed to create organization' },
        { status: 500 }
      );
    }

    // Create user record linked to tenant
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        tenant_id: tenant.id,
        email,
        full_name: fullName,
        role: 'admin',
        is_active: true,
      });

    if (userError) {
      console.error('User record creation error:', userError);
      // Clean up the tenant we just created
      await supabase.from('tenants').delete().eq('id', tenant.id);
      return NextResponse.json(
        { error: 'Failed to create user record' },
        { status: 500 }
      );
    }

    return NextResponse.json({ tenant }, { status: 201 });
  } catch (err) {
    console.error('Signup API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
