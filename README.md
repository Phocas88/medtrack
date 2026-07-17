# Stokora WMS — Warehouse Management System

A full-featured, white-label warehouse management system built for small-to-mid-size distributors across any industry. Multi-tenant, role-based, with lot tracking, FEFO picking, barcode scanning, billing, and integrations.

**Built with:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase (Auth + Postgres + RLS)

**Live:** [stokora.vercel.app](https://stokora.vercel.app)

---

## Features

- **Multi-tenant architecture** — each client sees only their data, enforced by Row Level Security
- **White-label** — tenant name in sidebar, Stokora branding on marketing/login
- **Preset system** — Lite, 3PL, and Full configurations with branching dashboards
- **Lot & serial tracking** — FEFO picking, expiration alerts, recall traceability
- **Standalone scanner app** — `/scan` route optimized for handheld devices
- **POS system** — `/pos` route for point-of-sale with Stripe payments
- **Customer portal** — self-service order tracking for end customers
- **Onboarding wizard** — auto-redirects new users through 5-step setup
- **IT user management** — admin creates users, assigns roles, resets passwords
- **Billing** — Stripe checkout, subscription management, portal
- **Integrations** — Shopify, QuickBooks, Zapier, EasyPost shipping
- **Email notifications** — Resend-powered with mock fallback
- **PDF generation** — invoices, packing slips, purchase orders
- **Compliance** — controlled substances, DSCSA, Prop 65, GS1, recall monitoring
- **Analytics & reports** — ABC analysis, product matrix, CSV exports
- **Error monitoring** — Sentry integration
- **Security** — CSP, HSTS, X-Frame-Options, rate limiting, error boundaries

---

## Quick Start

```bash
git clone https://github.com/Phocas88/medtrack.git stokora-wms
cd stokora-wms
npm install
cp .env.example .env.local
# Edit .env.local with your Supabase credentials
npm run dev
```

### Database Setup

Run migrations in order via Supabase SQL Editor:

1. `supabase/migrations/00001_initial_schema.sql`
2. `supabase/migrations/00002_v2_features.sql`
3. `supabase/migrations/00003_cleanup_and_v2_redo.sql`
4. `supabase/migrations/00004_bins_and_scanner.sql`
5. `supabase/migrations/00005_uom_and_multipart.sql`

### Seed Demo Data (Optional)

```bash
npx tsx scripts/seed.ts
```

Creates a demo tenant with products, suppliers, customers, lots, and movements.
Demo login: `demo@stokora.com` / `demo1234`

---

## Environment Variables

See `.env.example` for all variables. Required:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin operations |

Optional but recommended for production:

| Variable | Purpose |
|----------|---------|
| `STRIPE_SECRET_KEY` | Payment processing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook verification |
| `RESEND_API_KEY` | Transactional email |
| `NEXT_PUBLIC_SENTRY_DSN` | Error monitoring |
| `SHOPIFY_API_KEY` | Shopify integration |

---

## Deployment

Push to GitHub to auto-deploy via Vercel. Add all environment variables in Vercel project settings.

### Health Check

`GET /api/health` — returns service status for database, Stripe, email, and Sentry configuration.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Database | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth |
| Payments | Stripe |
| Email | Resend |
| Shipping | EasyPost |
| Monitoring | Sentry, Vercel Analytics |
| Forms | react-hook-form + zod |
| Testing | Playwright (18 suites) |
| Deployment | Vercel |

---

## License

Private. Not for redistribution without authorization.
