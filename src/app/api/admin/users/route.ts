import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Missing Supabase service role env vars');
  return createClient(url, serviceKey);
}

async function getAuthUser() {
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

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 12; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass + '!1';
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { tenant_id, email, full_name, role, access_level } = body;

    if (!tenant_id || !full_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (tenant_id !== authUser.tenant_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const serviceClient = createServiceClient();
    const tempPassword = generateTempPassword();

    // Generate a username-based email if none provided (for floor associates)
    const username = body.username || full_name.toLowerCase().replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '');
    const loginEmail = email || `${username}@${tenant_id.slice(0, 8)}.wms.local`;

    // Create auth user
    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email: loginEmail,
      password: tempPassword,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Create user record in users table
    const { error: userError } = await serviceClient
      .from('users')
      .insert({
        id: authData.user.id,
        tenant_id,
        email: loginEmail,
        full_name,
        role: role || 'staff',
        is_active: true,
      });

    if (userError) {
      // Clean up auth user on failure
      await serviceClient.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
    }

    // Log to audit - user creation
    await serviceClient.from('stock_movements').insert({
      tenant_id,
      product_id: null,
      user_id: authUser.id,
      quantity: 0,
      movement_type: 'adjust',
      reason: `IT: Created user ${full_name} (${loginEmail}) with role ${role || 'staff'}, access: ${access_level || 'full'}`,
      reference_number: `USER-NEW-${authData.user.id.slice(0, 8)}`,
      metadata: {
        action: 'user_create',
        target_user_id: authData.user.id,
        target_user_email: loginEmail,
        has_real_email: !!email,
        role: role || 'staff',
        access_level: access_level || 'full',
      },
    });

    return NextResponse.json({
      user: { id: authData.user.id, email: loginEmail, full_name, role: role || 'staff' },
      temp_password: tempPassword,
      username: !email ? username : undefined,
      login_note: !email ? `No email provided. User logs in with: ${loginEmail} / ${tempPassword}` : undefined,
    }, { status: 201 });
  } catch (err) {
    console.error('Admin create user error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
