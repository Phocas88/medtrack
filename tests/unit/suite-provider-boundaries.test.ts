import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ShippingRate } from '@/lib/shipping';
import { recommendRate, type RoutingRule } from '@/lib/shipping-routing';
import { paidWooOrder, validWooCommerceSignature } from '@/lib/woocommerce';

describe('shipping rate recommendations', () => {
  const quote = (id: string, carrier: string, rate: string, delivery_days: number | null): ShippingRate =>
    ({ id, carrier, service: id, rate, delivery_days, currency: 'USD', est_delivery_date: null });
  const rule = (partial: Partial<RoutingRule>): RoutingRule => ({
    name: 'Standard', priority: 20, country: 'US', carrier: null, min_weight_oz: null, max_weight_oz: null,
    max_delivery_days: null, preference: 'lowest_cost', ...partial,
  });

  it('uses the first matching rule with an eligible rate', () => {
    const rates = [quote('ground', 'UPS', '7.00', 4), quote('express', 'FedEx', '14.50', 1), quote('no-estimate', 'USPS', '5.25', null)];
    const rules = [rule({}), rule({ name: 'Fast Parcels', priority: 5, max_delivery_days: 2, max_weight_oz: 16, preference: 'fastest' })];
    expect(recommendRate(rules, rates, 'us', 12)).toEqual({ rateId: 'express', rule: 'Fast Parcels' });
    expect(recommendRate(rules, rates, 'US', 20)).toEqual({ rateId: 'no-estimate', rule: 'Standard' });
    expect(recommendRate(rules, rates, 'CA', 12)).toBeNull();
  });
});

describe('WooCommerce order webhook', () => {
  it('checks the signed body and extracts the physical order details', () => {
    const order = {
      id: 10, currency: 'USD', billing: { email: 'buyer@example.test' },
      shipping: { first_name: 'Warehouse', last_name: 'Buyer', address_1: '101 Main Street', city: 'Portland' },
      line_items: [{ sku: 'CARTON1', quantity: 2, total: '10.00' }],
    };
    const body = JSON.stringify(order);
    const secret = 'test-woocommerce-secret';
    const signature = createHmac('sha256', secret).update(body).digest('base64');
    expect(validWooCommerceSignature(body, signature, secret)).toBe(true);
    expect(validWooCommerceSignature(body + ' ', signature, secret)).toBe(false);
    expect(validWooCommerceSignature(body, 'malformed', secret)).toBe(false);
    expect(paidWooOrder.parse(order)).toEqual({
      id: 10, currency: 'USD', email: 'buyer@example.test', name: 'Warehouse Buyer', address: '101 Main Street, Portland',
      lines: [{ sku: 'CARTON1', quantity: 2, total: '10.00' }],
    });
  });
});
