export const launchPricing = {
  monthly: 89,
  annual: 948,
  warehouses: 1,
  teamMembers: 5,
} as const;

export const annualMonthlyEquivalent = launchPricing.annual / 12;
export const annualSavings = launchPricing.monthly * 12 - launchPricing.annual;

export const pricingTiers = [
  { name: 'Starter', monthly: launchPricing.monthly, annual: launchPricing.annual, warehouses: 1, seats: 5 },
  { name: 'Growth', monthly: 149, annual: 1548, warehouses: 3, seats: 15 },
  { name: 'Scale', monthly: 249, annual: 2628, warehouses: 10, seats: 30 },
] as const;
