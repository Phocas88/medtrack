import type { ShippingRate } from '@/lib/shipping';

export type RoutingRule = {
  name: string;
  priority: number;
  country: string | null;
  min_weight_oz: number | null;
  max_weight_oz: number | null;
  carrier: string | null;
  max_delivery_days: number | null;
  preference: 'lowest_cost' | 'fastest';
};

export function recommendRate(rules: RoutingRule[], rates: ShippingRate[], country: string, ounces: number) {
  for (const rule of [...rules].sort((a, b) => a.priority - b.priority)) {
    if ((rule.country && rule.country !== country.toUpperCase())
      || (rule.min_weight_oz !== null && ounces < rule.min_weight_oz)
      || (rule.max_weight_oz !== null && ounces > rule.max_weight_oz)) continue;

    const eligible = rates.filter(rate =>
      Number.isFinite(Number(rate.rate)) && Number(rate.rate) >= 0
      && (!rule.carrier || rule.carrier.toLowerCase() === rate.carrier.toLowerCase())
      && (rule.max_delivery_days === null || (rate.delivery_days !== null && rate.delivery_days <= rule.max_delivery_days))
      && (rule.preference !== 'fastest' || rate.delivery_days !== null),
    );
    if (!eligible.length) continue;
    const currency = eligible[0].currency ?? 'USD';
    const comparable = eligible.filter(rate => (rate.currency ?? 'USD') === currency);
    comparable.sort((a, b) => {
      const price = Number(a.rate) - Number(b.rate);
      const days = (a.delivery_days ?? Number.MAX_SAFE_INTEGER) - (b.delivery_days ?? Number.MAX_SAFE_INTEGER);
      return rule.preference === 'fastest' ? days || price : price || days;
    });
    return { rateId: comparable[0].id, rule: rule.name };
  }
  return null;
}
