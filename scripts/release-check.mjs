// Reads process environment presence only. Never opens env files or prints values.
const required = [
  'NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_STARTER', 'STRIPE_PRICE_PROFESSIONAL', 'STRIPE_PRICE_ENTERPRISE',
  'SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'SHOPIFY_TOKEN_ENCRYPTION_KEY', 'RESEND_API_KEY', 'NEXT_PUBLIC_APP_DOMAIN',
  'EASYPOST_API_KEY', 'NOTIFICATION_API_KEY', 'CRON_SECRET',
];
const missing = required.filter(name => !process.env[name]);
console.log(JSON.stringify({ configuration: missing.length ? 'incomplete' : 'present-but-not-provider-verified', missing,
  remainingChecks: ['Apply and verify forward migrations in staging', 'Verify Supabase Auth redirects and email delivery',
    'Run authenticated PostgREST and Storage integration tests', 'Verify Stripe test-mode lifecycle',
    'Verify Shopify installation and webhook subscriptions', 'Complete the remaining feature gates in COMMERCIAL_READINESS.md'],
}, null, 2));
process.exitCode = missing.length ? 1 : 0;
