import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { uuid } from '@/lib/security';
import { HttpError, requireUser, routeError } from '@/lib/server-auth';
import { encryptToken } from '@/lib/shopify-crypto';
import { createServiceClient } from '@/lib/supabase/service';

const config = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('connect'), registerId: uuid,
    key: z.string().trim().regex(/^rk_(test|live)_[a-zA-Z0-9]+$/),
    readerId: z.string().trim().regex(/^tmr_[a-zA-Z0-9]+$/),
  }),
  z.object({ action: z.literal('disconnect'), registerId: uuid }),
]);

export async function POST(request: Request) {
  try {
    const user = await requireUser(['admin'], true);
    const input = config.parse(await request.json());
    const db = createServiceClient();
    const { data: enabled, error } = await db.rpc('suite_workspace_available', { p_tenant: user.tenant_id, p_product: 'pos' });
    if (error) throw error;
    if (!enabled) throw new HttpError(403, 'POS add-on required');
    let reader: Stripe.Terminal.Reader | undefined;
    if (input.action === 'connect') {
      try {
        const candidate = await new Stripe(input.key).terminal.readers.retrieve(input.readerId);
        if (!candidate.deleted) reader = candidate;
      } catch {
        throw new HttpError(422, 'Verify the reader ID and the restricted Stripe key permissions.');
      }
      if (!reader) throw new HttpError(404, 'The reader is unavailable.');
      if (reader.livemode !== input.key.startsWith('rk_live_')) throw new HttpError(422, 'Reader and account modes must match.');
    }
    const { error: saveError } = await db.rpc('configure_pos_terminal', {
      p_tenant: user.tenant_id, p_register: input.registerId, p_reader: reader?.id ?? null,
      p_key: input.action === 'connect' ? encryptToken(input.key) : null, p_live: reader?.livemode ?? null,
    });
    if (saveError?.code === 'P0001') throw new HttpError(409, saveError.message);
    if (saveError) throw saveError;
    return NextResponse.json({ connected: !!reader });
  } catch (error) { return routeError(error); }
}
