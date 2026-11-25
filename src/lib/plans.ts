export const plans = [
  { id: 'starter', name: 'Starter', price: 49, activeUsers: 5, audience: 'Single-warehouse teams' },
  { id: 'professional', name: 'Professional', price: 99, activeUsers: 25, audience: 'Growing distribution teams' },
  { id: 'enterprise', name: 'Enterprise', price: 199, activeUsers: 100, audience: 'Larger warehouse operations' },
] as const;

export type PlanId = (typeof plans)[number]['id'];
