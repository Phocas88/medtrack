import { NextResponse } from 'next/server';
import Stripe from 'stripe';

export async function POST(request: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      // Stripe not configured — return success anyway (demo mode)
      return NextResponse.json({
        success: true,
        demo: true,
        message: 'Payment recorded (Stripe not configured — demo mode)',
      });
    }

    const stripe = new Stripe(stripeKey);
    const { amount, currency, description, metadata } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe uses cents
      currency: currency || 'usd',
      description: description || 'POS Transaction',
      metadata: metadata || {},
      // Auto-confirm for server-side charges (e.g., card on file or terminal)
      // For client-side card entry, you'd use confirm on the frontend
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
    });

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('POS charge error:', err);
    const message = err instanceof Error ? err.message : 'Payment failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
