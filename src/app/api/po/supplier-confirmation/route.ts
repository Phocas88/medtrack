import { createHash } from 'node:crypto';
import { z } from 'zod';
import { enforceRateLimit } from '@/lib/distributed-rate-limit';
import { createServiceClient } from '@/lib/supabase/service';
import { HttpError, routeError } from '@/lib/server-auth';

const token = z.string().regex(/^[a-f0-9]{64}$/);
const reply = z.object({
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(2000),
  lines: z.array(z.object({
    id: z.string().uuid(),
    quantity: z.number().int().min(0).max(2147483647),
    delivery_date: z.union([z.string().date(), z.literal('')]),
  }).strict()).min(1).max(200),
}).strict();

export async function POST(request: Request) {
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'Open the original confirmation link.');
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415, 'Send a JSON request.');
    const ip = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    await enforceRateLimit('supplier-confirmation-ip', ip, 30, 60);
    const input = z.object({ token, reply: reply.optional() }).strict().parse(await request.json());
    const hash = createHash('sha256').update(input.token).digest('hex');
    const db = createServiceClient();
    const result = input.reply
      ? await db.rpc('submit_supplier_confirmation', { p_hash: hash, p_reply: input.reply })
      : await db.rpc('open_supplier_confirmation', { p_hash: hash });
    if (result.error) {
      if (result.error.code === 'P0001') throw new HttpError(400, result.error.message);
      throw result.error;
    }
    if (!result.data) throw new HttpError(404, 'This confirmation link is unavailable or has expired.');
    return Response.json({ confirmation: result.data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return routeError(error);
  }
}
