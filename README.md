# Stokora WMS — Warehouse Management System

Warehouse management software for small and midsize distributors, with inventory, bin locations, receiving, and order fulfillment tools.

**Built with:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase (Auth + Postgres + RLS)

**Live:** [stokora.vercel.app](https://stokora.vercel.app)

---

## Features

- **Workspace access** — organization and role-based access. Complete the reviewed tenant-isolation migrations before onboarding customers.
- **White-label** — tenant name in header, Stokora branding on marketing/login
- **Preset system** — Lite, 3PL, and Full configurations with branching dashboards
- **Lot & serial tracking** — FEFO picking, expiration alerts, recall traceability
- **Standalone scanner app** — `/scan` route optimized for handheld devices
- **POS system** — `/pos` route for manual cash and check records. Card payments are unavailable.
- **Customer portal** — self-service order tracking for end customers
- **Onboarding wizard** — auto-redirects new users through 5-step setup
- **IT user management** — admin creates users, assigns roles, resets passwords
- **Billing** — plan information and support contact. Online checkout and the billing portal are paused.
- **Integrations** — Shopify, QuickBooks, Zapier, EasyPost shipping
- **Email notifications** — Resend when configured
- **PDF generation** — invoices, packing slips, purchase orders
- **Inventory records** — lot tracking, stock movement history, and recall lookup
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

For a disposable database, run the migrations in order. Assess applied migration history and backups before changing an existing database:

1. `supabase/migrations/00001_initial_schema.sql`
2. `supabase/migrations/00002_v2_features.sql`
3. `supabase/migrations/00003_cleanup_and_v2_redo.sql`
4. `supabase/migrations/00004_bins_and_scanner.sql`
5. `supabase/migrations/00005_uom_and_multipart.sql`

### Seed Demo Data (Optional)

```bash
npx tsx scripts/seed.ts
```

Run against an isolated, disposable Supabase project only. Public demo seeding is disabled. The live role picker uses existing shared sample accounts via the private server variable `STOKORA_DEMO_LOGINS`. Set it as a JSON object with the keys `cashier`, `customer`, `associate`, and `manager`, each containing that sample account’s email and password. Rotate previously published sample credentials and keep the new values in Vercel.

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
| `WEB3FORMS_ACCESS_KEY` | Server-side form delivery. The current release also accepts the existing `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` deployment variable. |
| `RESEND_API_KEY` | Transactional email |
| `NEXT_PUBLIC_SENTRY_DSN` | Error monitoring |
| `SHOPIFY_API_KEY` | Shopify integration |

---

## Deployment

Vercel builds the production branch. Test a preview before release. The public homepage accepts inquiries through Web3Forms and confirms receipt only after the provider accepts the request. Duplicate detection applies within each running server instance. Self-service organization registration, online subscriptions, and card payments require the reviewed production-readiness release and provider configuration.

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
