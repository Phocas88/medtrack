import { launchPricing, pricingTiers } from './public-pricing';

export const helpTopics = {
  launch: { label: 'Launch and signup', answer: 'Invexiqs WMS is scheduled for June 2027. We’ll announce the exact date closer to launch. Register now, confirm your email, and sign in to your prelaunch account.', href: '/auth/signup', link: 'Create a prelaunch account' },
  pricing: { label: 'Plans and billing', answer: `Proposed monthly prices per organization are ${pricingTiers.map(plan => `${plan.name} $${plan.monthly}`).join(', ')}. Starter includes one warehouse and up to five team members and costs $${launchPricing.annual} billed annually.`, href: '/#pricing', link: 'Compare pricing and features' },
  features: { label: 'Warehouse features', answer: 'Invexiqs helps teams receive into bins, track lots and stock movements, run cycle counts, and pick and ship orders. See a sample warehouse in the live demo.', href: '/demo', link: 'Explore the live demo' },
  integrations: { label: 'Integrations', answer: 'Invexiqs has connectors for Shopify, EasyPost, QuickBooks Online, and Zapier. The directory explains each connector’s scope and where to request others.', href: '/integrations-directory', link: 'View Integration Directory' },
  setup: { label: 'Setup and imports', answer: 'The setup checklist walks you through creating a warehouse, importing products and opening balances by CSV, and checking your scanner and printer. Warehouse setup opens at launch.', href: '/guide', link: 'Read the warehouse guide' },
  support: { label: 'Contact support', answer: 'Use the support form for account help or questions that need a person.', href: '/support', link: 'Contact Invexiqs support' },
  tools: { label: 'Free warehouse tools', answer: 'Generate SKUs, barcodes, bin labels, and printable purchase orders, or calculate a reorder point without creating an account.', href: '/tools', link: 'Open free tools' },
};
