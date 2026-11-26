import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, routeError, HttpError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { appOrigin, uuid } from '@/lib/security';

export async function POST(request: Request) {
  try {
    const user = await requireUser(['admin', 'manager'], true);
    const { customerId } = z.object({ customerId: uuid }).parse(await request.json());
    const db = createServiceClient();
    const { data: customer, error } = await db.from('customers').select('id, email, name').eq('id', customerId).eq('tenant_id', user.tenant_id).single();
    if (error || !customer?.email) throw new HttpError(404, 'Customer with an email address required');
    const { error: inviteError } = await db.auth.admin.inviteUserByEmail(customer.email, {
      redirectTo: `${appOrigin()}/auth/reset?type=recovery`,
      data: { customer_id: customer.id, tenant_id: user.tenant_id },
    });
    if (inviteError) {
      if (!['email_exists', 'user_already_exists'].includes(inviteError.code || '')) throw inviteError;
      const { error: resetError } = await db.auth.resetPasswordForEmail(customer.email, { redirectTo: `${appOrigin()}/auth/reset?type=recovery` });
      if (resetError) throw resetError;
    }
    const { error: membershipError } = await db.rpc('grant_portal_access', { p_tenant_id: user.tenant_id, p_customer_id: customer.id });
    if (membershipError) throw membershipError;
    return NextResponse.json({ success: true, message: 'Invitation email requested' });
  } catch (error) { return routeError(error); }
}
