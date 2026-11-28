import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { requireUser, routeError, HttpError } from '@/lib/server-auth';
import { uuid } from '@/lib/security';
import { decryptToken } from '@/lib/shopify-crypto';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

const action = z.object({ requestId: uuid }).and(z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'), shiftId: uuid, customerName: z.string().max(200),
    discount: z.number().min(0).max(100),
    items: z.array(z.object({
      lineType: z.literal('product'), productId: uuid, quantity: z.number().int().positive(),
      discount: z.number().min(0).optional(),
    })).min(1).max(250),
  }),
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('refund') }),
]));

export async function POST(request: Request) {
  try {
    const user = await requireUser(['admin', 'manager'], true, true);
    const input = action.parse(await request.json());
    const db = createServiceClient();
    const session = await createClient();
    if (input.action === 'start') {
      const { error } = await session.rpc('begin_pos_card_attempt', {
        p_shift: input.shiftId, p_request: input.requestId, p_items: input.items,
        p_customer: input.customerName, p_discount: input.discount,
      });
      if (error?.code === '42501') throw new HttpError(403, 'POS add-on required');
      if (error?.code === 'P0001') throw new HttpError(409, error.message);
      if (error) throw error;
    }
    const { data: attempt, error } = await db.from('pos_card_attempts').select('*')
      .eq('tenant_id', user.tenant_id).eq('id', input.requestId).maybeSingle();
    if (error) throw error;
    if (!attempt) throw new HttpError(404, 'Card payment not found');
    if (attempt.status === 'posted') {
      const { data, error: receiptError } = await session.rpc('complete_pos_card_sale', { p_request: attempt.id });
      if (receiptError) throw receiptError;
      return NextResponse.json(data);
    }
    if (['cancelled', 'refunded'].includes(attempt.status)) return NextResponse.json({ status: attempt.status });
    const { data: terminal, error: terminalError } = await db.from('pos_terminal_credentials')
      .select('reader_id,encrypted_key,livemode').eq('register_id', attempt.register_id).eq('tenant_id', user.tenant_id).maybeSingle();
    if (terminalError) throw terminalError;
    if (!terminal) throw new HttpError(409, 'Connect the register’s Stripe Terminal reader.');
    const stripe = new Stripe(decryptToken(terminal.encrypted_key));
    const recordState = async (intentId: string, status: string) => {
      const { data, error } = await db.rpc('record_pos_card_state', {
        p_tenant: user.tenant_id, p_request: attempt.id, p_intent: intentId, p_status: status,
      });
      if (error) throw error;
      return data;
    };

    if (input.action === 'refund' || attempt.status === 'refund_pending') {
      if (input.action !== 'refund' && !attempt.refund_id) return NextResponse.json({ status: 'refund_pending' });
      const { data: intentId, error: claimError } = await db.rpc('claim_pos_refund', { p_tenant: user.tenant_id, p_request: attempt.id });
      if (claimError) throw claimError;
      if (!intentId) throw new HttpError(409, 'Refunds from here are available for paid transactions awaiting inventory posting.');
      const refund = attempt.refund_id ? await stripe.refunds.retrieve(attempt.refund_id)
        : await stripe.refunds.create({ payment_intent: intentId }, { idempotencyKey: `invexiqs-pos-refund-${attempt.id}` });
      const { error: refundError } = await db.rpc('record_pos_refund', {
        p_tenant: user.tenant_id, p_request: attempt.id, p_refund: refund.id, p_succeeded: refund.status === 'succeeded',
      });
      if (refundError) throw refundError;
      return NextResponse.json({
        status: refund.status === 'succeeded' ? 'refunded' : 'refund_pending',
        message: refund.status === 'failed' || refund.status === 'canceled'
          ? 'Stripe could not complete the refund. Contact support with the transaction reference.' : undefined,
      });
    }

    const cents = Math.round(Number(attempt.quote.total) * 100);
    if (!attempt.intent_id && input.action === 'status') {
      return NextResponse.json({ status: 'pending', message: 'Resume checkout or cancel the pending transaction.' });
    }
    let intent = attempt.intent_id ? await stripe.paymentIntents.retrieve(attempt.intent_id)
      : await stripe.paymentIntents.create({
        amount: cents, currency: attempt.currency, payment_method_types: ['card_present'], capture_method: 'automatic',
        metadata: { invexiqsCheckout: attempt.id, invexiqsTenant: user.tenant_id },
      }, { idempotencyKey: `invexiqs-pos-intent-${attempt.id}` });
    if (intent.metadata.invexiqsCheckout !== attempt.id || intent.metadata.invexiqsTenant !== user.tenant_id
      || intent.amount !== cents || intent.currency !== attempt.currency || intent.livemode !== terminal.livemode) {
      throw new HttpError(409, 'Stripe returned a payment that does not match this transaction.');
    }
    if (!attempt.intent_id && !(await recordState(intent.id, 'pending'))) throw new HttpError(409, 'Payment state changed. Refresh and check the receipt.');

    if (input.action === 'cancel' && !['succeeded', 'canceled', 'processing'].includes(intent.status)) {
      const reader = await stripe.terminal.readers.retrieve(terminal.reader_id);
      const active = reader.deleted ? null : reader.action?.process_payment_intent?.payment_intent;
      if (!reader.deleted && reader.action?.status === 'in_progress' && (typeof active === 'string' ? active : active?.id) === intent.id) {
        await stripe.terminal.readers.cancelAction(terminal.reader_id);
      }
      intent = await stripe.paymentIntents.cancel(intent.id, {}, { idempotencyKey: `invexiqs-pos-cancel-${attempt.id}` });
    }
    if (intent.status === 'canceled') {
      await recordState(intent.id, 'cancelled');
      return NextResponse.json({ status: 'cancelled' });
    }
    if (intent.status === 'succeeded' && intent.amount_received === cents) {
      const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
      if (!chargeId) throw new HttpError(409, 'Stripe has not supplied the finalized card charge.');
      const charge = await stripe.charges.retrieve(chargeId);
      if (charge.refunded && charge.amount_refunded === cents && await recordState(intent.id, 'refunded')) {
        return NextResponse.json({ status: 'refunded' });
      }
      if (charge.amount_refunded > 0 || charge.disputed) {
        throw new HttpError(409, 'Stripe shows a refund or dispute. Review the payment before posting inventory.');
      }
      await recordState(intent.id, 'paid');
      const { data, error: postError } = await session.rpc('complete_pos_card_sale', { p_request: attempt.id });
      if (postError) throw postError;
      return NextResponse.json(data);
    }
    if (input.action === 'start' && intent.status === 'requires_payment_method') {
      await stripe.terminal.readers.processPaymentIntent(terminal.reader_id, { payment_intent: intent.id },
        { idempotencyKey: `invexiqs-pos-reader-${attempt.id}` });
    }
    return NextResponse.json({
      status: 'pending',
      message: intent.last_payment_error ? 'The reader reported a payment error. Cancel this attempt before trying another payment.' : 'Follow the prompts on the card reader, then check the payment.',
    });
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      return routeError(new HttpError(502, 'Stripe could not complete the request. Check the reader and recheck the existing payment before starting another sale.'));
    }
    return routeError(error);
  }
}
