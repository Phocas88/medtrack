import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUser, routeError, HttpError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { appOrigin, uuid } from '@/lib/security';

export async function POST(request: Request) {
  try {
    const user = await requireUser(['admin'], true);
    const { supplierId, action } = z.object({ supplierId: uuid, action: z.enum(['invite', 'revoke']) }).parse(await request.json());
    const db = createServiceClient();
    const { data: enabled, error: accessError } = await db.rpc('suite_workspace_available', {
      p_tenant: user.tenant_id, p_product: 'purchasing',
    });
    if (accessError) throw accessError;
    if (!enabled) throw new HttpError(403, 'Purchasing add-on required');

    if (action === 'revoke') {
      const { error } = await db.from('supplier_portal_memberships').delete()
        .eq('tenant_id', user.tenant_id).eq('supplier_id', supplierId);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    const { data: supplier, error } = await db.from('suppliers').select('email')
      .eq('id', supplierId).eq('tenant_id', user.tenant_id).eq('is_archived', false).maybeSingle();
    if (error) throw error;
    if (!supplier?.email) throw new HttpError(400, 'Add an email address to this supplier first.');
    const redirectTo = `${appOrigin()}/auth/reset?type=recovery&portal=supplier`;
    const invite = await db.auth.admin.inviteUserByEmail(supplier.email, { redirectTo });
    if (invite.error) {
      if (!['email_exists', 'user_already_exists'].includes(invite.error.code ?? '')) throw invite.error;
      const { error: resetError } = await db.auth.resetPasswordForEmail(supplier.email, { redirectTo });
      if (resetError) throw resetError;
    }
    const { error: saveError } = await db.rpc('grant_supplier_portal_access', {
      p_tenant: user.tenant_id, p_supplier: supplierId,
    });
    if (saveError) throw saveError;
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeError(error);
  }
}
