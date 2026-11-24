import { NextResponse } from 'next/server';
import { z } from 'zod';
import { demoRoles } from '@/lib/demo-roles';
import { checkRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

const roleRequest = z.object({ role: z.enum(demoRoles) }).strict();
const login = z.object({ email: z.string().email(), password: z.string().min(1) });
const availableLogins = z.object({ cashier: login, customer: login, associate: login, manager: login });

export async function POST(request: Request) {
  const fail = (error: string, status: number) => NextResponse.json(
    { error }, { status, headers: { 'Cache-Control': 'no-store' } },
  );
  if (request.headers.get('sec-fetch-site') === 'cross-site') return fail('Use the Stokora demo page.', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('Choose a demo role.', 400);
  if (Number(request.headers.get('content-length')) > 1024) return fail('Request is too large.', 413);

  const address = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'local';
  if (!checkRateLimit(`demo:${address}`, 16, 60000).allowed) return fail('Please try again in a moment.', 429);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail('Choose a demo role.', 400);
  }
  const data = roleRequest.safeParse(raw);
  if (!data.success) return fail('Choose a demo role.', 400);

  try {
    const configured = availableLogins.parse(JSON.parse(process.env.STOKORA_DEMO_LOGINS || 'null'));
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword(configured[data.data.role]);
    if (error) return fail('The demo is temporarily unavailable.', 503);
    return NextResponse.json({ status: 'signed_in' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return fail('The demo is temporarily unavailable.', 503);
  }
}
