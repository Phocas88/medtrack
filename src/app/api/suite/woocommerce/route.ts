import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { appOrigin, uuid } from '@/lib/security';
import { HttpError, requireUser, routeError } from '@/lib/server-auth';
import { encryptToken } from '@/lib/shopify-crypto';
import { createServiceClient } from '@/lib/supabase/service';

const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect'), name: z.string().trim().min(1).max(80) }),
  z.object({ action: z.literal('disconnect'), id: uuid }),
]);

export async function POST(request: Request) {
  try {
    const user = await requireUser(['admin'], true);
    const action = actions.parse(await request.json());
    const db = createServiceClient();
    const { data: enabled, error } = await db.rpc('suite_workspace_available', { p_tenant: user.tenant_id, p_product: 'commerce' });
    if (error) throw error;
    if (!enabled) throw new HttpError(403, 'Commerce add-on required');
    if (action.action === 'disconnect') {
      const { error: disconnectError } = await db.from('woocommerce_connections').update({ enabled: false })
        .eq('id', action.id).eq('tenant_id', user.tenant_id);
      if (disconnectError) throw disconnectError;
      return NextResponse.json({ success: true });
    }

    const secret = randomBytes(32).toString('hex');
    const { data, error: saveError } = await db.from('woocommerce_connections')
      .insert({ tenant_id: user.tenant_id, name: action.name, encrypted_secret: encryptToken(secret) }).select('id').single();
    if (saveError) throw saveError;
    return NextResponse.json({ url: `${appOrigin()}/api/webhooks/woocommerce/${data.id}`, secret }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return routeError(error); }
}
