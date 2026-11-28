import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export function validWooCommerceSignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  return timingSafeEqual(createHmac('sha256', secret).update(body).digest(), Buffer.from(signature, 'base64'));
}

const person = z.object({
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  address_1: z.string().max(250).optional(),
  address_2: z.string().max(250).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(80).optional(),
  postcode: z.string().max(30).optional(),
  country: z.string().max(12).optional(),
});

export const paidWooOrder = z.object({
  id: z.number().int().positive().safe(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  billing: person.extend({ email: z.string().max(254).optional() }),
  shipping: person,
  line_items: z.array(z.object({
    sku: z.string().max(200), quantity: z.number().int().min(1).max(1000000),
    total: z.string().regex(/^\d{1,9}(\.\d{1,6})?$/),
  })).min(1).max(250),
}).transform(order => {
  const to = order.shipping.address_1 ? order.shipping : order.billing;
  return {
    id: order.id, currency: order.currency, email: order.billing.email ?? '',
    name: [to.first_name, to.last_name].filter(Boolean).join(' ') || 'WooCommerce Customer',
    address: [to.address_1, to.address_2, to.city, to.state, to.postcode, to.country].filter(Boolean).join(', '),
    lines: order.line_items,
  };
});
