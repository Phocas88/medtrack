export const launchPricing = {
  monthly: 89,
  annual: 948,
  warehouses: 1,
  teamMembers: 5,
} as const;

export const annualMonthlyEquivalent = launchPricing.annual / 12;
export const annualSavings = launchPricing.monthly * 12 - launchPricing.annual;
