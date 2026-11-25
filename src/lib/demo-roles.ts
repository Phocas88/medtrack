export const demoRoles = ['cashier', 'customer', 'associate', 'manager'] as const;

export const roleRoutes = {
  cashier: '/pos',
  customer: '/portal',
  associate: '/scan',
  manager: '/dashboard',
} satisfies Record<(typeof demoRoles)[number], string>;
