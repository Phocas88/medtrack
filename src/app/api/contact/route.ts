import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';

const inquiry = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().max(254),
  industry: z.string().trim().max(100).optional(),
  warehouseSize: z.string().trim().max(100).optional(),
  message: z.string().trim().min(10).max(3000),
  interest: z.enum(['demo', 'pilot', 'support']),
  website: z.literal('').optional(),
});

const interestLabels = { demo: 'Product walkthrough', pilot: 'Founding-customer pilot', support: 'General inquiry' };
const duplicateWindow = 10 * 60 * 1000;
const deliveries = new Map<string, { until: number; accepted: Promise<boolean> }>();

async function deliver(data: z.infer<typeof inquiry>, accessKey: string) {
  try {
    const response = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        access_key: accessKey,
        from_name: 'Stokora',
        subject: 'Stokora inquiry: ' + interestLabels[data.interest],
        replyto: data.email,
        name: data.name,
        company: data.company,
        email: data.email,
        industry: data.industry,
        warehouse_size: data.warehouseSize,
        interest: interestLabels[data.interest],
        message: data.message,
      }),
    });
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return z.object({ success: z.literal(true) }).safeParse(result).success;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length')) > 16000) {
    return NextResponse.json({ error: 'Inquiry is too large.' }, { status: 413 });
  }
  let raw: unknown;
  try {
    const body = await request.text();
    if (body.length > 16000) return NextResponse.json({ error: 'Inquiry is too large.' }, { status: 413 });
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid inquiry.' }, { status: 400 });
  }

  const validated = inquiry.safeParse(raw);
  if (!validated.success) return NextResponse.json({ error: 'Check the required fields and your email address.' }, { status: 400 });

  // The legacy Vercel variable holds the same service-issued form key.
  const key = process.env.WEB3FORMS_ACCESS_KEY || process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
  if (!key) return NextResponse.json({ error: 'Inquiry delivery is temporarily unavailable.' }, { status: 503 });

  const address = request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'local';
  const data = validated.data;
  const fingerprint = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const now = Date.now();
  deliveries.forEach((delivery, entry) => {
    if (delivery.until <= now) deliveries.delete(entry);
  });

  let delivery = deliveries.get(fingerprint);
  if (!delivery) {
    if (deliveries.size >= 2000 || !checkRateLimit(`inquiry:${address}`, 8, duplicateWindow).allowed) {
      return NextResponse.json({ error: 'Please try again later.' }, { status: 429 });
    }
    delivery = { until: now + duplicateWindow, accepted: deliver(data, key) };
    deliveries.set(fingerprint, delivery);
  }
  if (!await delivery.accepted) {
    if (deliveries.get(fingerprint) === delivery) deliveries.delete(fingerprint);
    return NextResponse.json({ error: 'Your inquiry could not be delivered. Please try again or use the support email.' }, { status: 503 });
  }

  return NextResponse.json({ status: 'accepted' }, { status: 202 });
}
