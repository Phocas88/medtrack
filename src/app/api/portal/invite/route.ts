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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerId, tenantId } = body;

    if (!customerId || !tenantId) {
      return NextResponse.json(
        { error: 'Missing required fields: customerId, tenantId' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Look up the customer record to get their email
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, name, email, tenant_id')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      );
    }

    if (!customer.email) {
      return NextResponse.json(
        { error: 'Customer does not have an email address on file' },
        { status: 400 }
      );
    }

    // Check if a Supabase auth user already exists with that email
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('Error listing users:', listError);
      return NextResponse.json(
        { error: 'Failed to check existing users' },
        { status: 500 }
      );
    }

    const existingUser = existingUsers.users.find(
      (u) => u.email?.toLowerCase() === customer.email!.toLowerCase()
    );

    if (existingUser) {
      // User already exists — generate a fresh recovery link anyway
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: customer.email,
      });

      return NextResponse.json({
        success: true,
        message: 'Portal access already enabled',
        alreadyExists: true,
        recoveryLink: linkError ? null : linkData?.properties?.action_link,
      });
    }

    // Create auth user with a random temporary password
    const tempPassword = crypto.randomUUID() + '-Aa1!';
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: customer.email,
      email_confirm: true,
      password: tempPassword,
      user_metadata: {
        full_name: customer.name,
        customer_id: customer.id,
        tenant_id: customer.tenant_id,
        role: 'customer',
      },
    });

    if (createError) {
      console.error('Error creating auth user:', createError);
      return NextResponse.json(
        { error: `Failed to create portal account: ${createError.message}` },
        { status: 500 }
      );
    }

    // Send a password reset / recovery link so customer can set their own password
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: customer.email,
    });

    if (linkError) {
      console.error('Error generating recovery link:', linkError);
      return NextResponse.json({
        success: true,
        message: 'Portal account created but failed to generate recovery link',
        userId: newUser.user.id,
        recoveryLink: null,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Portal invitation sent to ${customer.email}`,
      userId: newUser.user.id,
      recoveryLink: linkData?.properties?.action_link,
    });
  } catch (err) {
    console.error('Portal invite API error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
