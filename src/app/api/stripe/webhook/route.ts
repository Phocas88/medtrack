import { NextResponse } from 'next/server';

export function POST(request: Request) {
  if (!request.headers.get('stripe-signature')) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 });
  }
  return NextResponse.json({ error: 'Billing events are unavailable.' }, { status: 503 });
}
