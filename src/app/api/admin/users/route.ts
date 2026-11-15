import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { requireUser, routeError, HttpError } from '@/lib/server-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { appOrigin } from '@/lib/security';
export async function POST(request: Request) {
  try {
    const actor = await requireUser(['admin'], true);
    const input = z.object({ full_name: z.string().trim().min(2).max(200), email: z.union([z.string().email(), z.literal('')]).optional(), role: z.enum(['admin','manager','staff']).default('staff'), access_level: z.enum(['full','scanner_only']).default('full') }).parse(await request.json());
    const db = createServiceClient();
    const tempPassword = randomBytes(24).toString('base64url');
    const email = input.email || `${randomBytes(8).toString('hex')}@${actor.tenant_id.slice(0,8)}.wms.local`;
    const result = await db.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
    if (result.error || !result.data.user) throw new HttpError(409, 'Account could not be created. Check whether this email is already registered.');
    const { error } = await db.from('users').insert({ id: result.data.user.id, tenant_id: actor.tenant_id, email, full_name: input.full_name, role: input.role, access_level: input.role === 'staff' ? 'scanner_only' : input.access_level, is_active: true });
    if (error) {
      await db.auth.admin.deleteUser(result.data.user.id);
      throw error;
    }
    if (input.email) {
      const { error: deliveryError } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${appOrigin()}/auth/reset?type=recovery` });
      if (deliveryError) throw new HttpError(502, 'Account created, but the password setup email failed. Use the administrator reset action to retry.');
    }
    return NextResponse.json({ user: { id: result.data.user.id, email, full_name: input.full_name, role: input.role },
      ...(input.email ? { invitation_sent: true } : { temp_password: tempPassword, login_note: `Use ${email} to sign in. Save the temporary password securely.` }),
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
