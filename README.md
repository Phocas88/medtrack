# MedTrack — Medical Supply Inventory Management

A full-featured inventory management system built for small medical supply distributors. Tracks products, lots, expirations, serial numbers, and provides FEFO picking, recall traceability, and compliance-ready reporting.

**Built with:** Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Supabase (Auth + Postgres + RLS)

---

## Compliance Disclaimer

> **This is an inventory management tool, not an FDA-validated system or DSCSA-compliant traceability platform.** Customers are responsible for their own regulatory compliance. MedTrack supports good inventory practices (lot tracking, FEFO, recall traceability, audit trails) but does not certify compliance with FDA 21 CFR Part 11, DSCSA, cGMP, or any other regulatory framework. If you need validated systems, consult a compliance specialist.

---

## Features

### Core Inventory
- **Product catalog** with SKU, manufacturer, category, cost/price, storage requirements (room temp, refrigerated, frozen)
- **Lot tracking** — every unit tied to a lot number with expiration date, received date, supplier, and bin location
- **Serial number tracking** — optional per-product, individual serial numbers tied to lots
- **Soft delete** — products are archived, never hard-deleted

### Receiving & Shipping
- **Receiving workflow** — log incoming inventory with lot details, auto-generate barcode labels
- **FEFO picking** — First Expired First Out. System suggests which lots to pick, from which bins
- **Expired lot blocking** — expired lots are skipped during picking; override requires logged reason
- **Barcode scanning** — camera-based scanning on mobile devices, plus manual entry fallback

### Expiration & Recall
- **Expiration dashboard** — items expiring in 30/60/90 days with visual indicators throughout the app
- **Configurable alert thresholds** per product
- **Recall lookup** — enter a lot number, instantly see every customer who received units, with quantities and ship dates
- **Recall CSV export** — one-click export of affected customer contact info for recall notifications
- **Lot recall status** — mark lots as recalled, blocking further shipment

### Audit & Compliance
- **Immutable stock movements** — every inventory change logged with timestamp, user, type, reason, and reference
- **Cannot edit or delete movements** — enforced at the database level (triggers + RLS)
- **Audit trail filtering** — by product, lot, user, date range, movement type
- **All reports exportable to CSV** — inventory valuation, stock on hand, expiration, sales by lot, customer history, full audit log

### Multi-tenancy & Auth
- **Email/password auth** via Supabase Auth
- **Multi-tenant** — each company sees only their data, enforced by Row Level Security
- **Role-based access** — admin, manager, staff roles per tenant
- **Team management** — admins can manage users and roles

### UI
- Clean, professional design (inspired by Linear/Notion)
- **Dark mode** support
- **Mobile responsive** throughout
- Sidebar navigation with logical grouping

---

## Project Structure

```
medtrack/
├── scripts/
│   └── seed.ts                    # Demo data seed script
├── supabase/
│   └── migrations/
│       └── 00001_initial_schema.sql  # Full database schema with RLS
├── src/
│   ├── app/
│   │   ├── (app)/                 # Authenticated app routes
│   │   │   ├── dashboard/         # Main dashboard
│   │   │   ├── products/          # Product catalog CRUD
│   │   │   ├── lots/              # Lot list and detail views
│   │   │   ├── receive/           # Receiving workflow
│   │   │   ├── ship/              # Shipping with FEFO picking
│   │   │   ├── customers/         # Customer management
│   │   │   ├── suppliers/         # Supplier management
│   │   │   ├── movements/         # Audit trail / stock movements
│   │   │   ├── reports/           # All reports with CSV export
│   │   │   ├── recall/            # Recall lookup
│   │   │   └── settings/          # Org settings, team management
│   │   ├── auth/                  # Login, signup, callback
│   │   └── api/auth/signup/       # Tenant creation API
│   ├── components/
│   │   ├── layout/                # Sidebar, header, theme provider
│   │   ├── providers/             # Auth context provider
│   │   ├── ui/                    # shadcn/ui + custom components
│   │   └── barcode-scanner.tsx    # Camera barcode scanner
│   ├── hooks/                     # Custom React hooks
│   ├── lib/
│   │   ├── supabase/              # Typed Supabase clients (browser, server, middleware)
│   │   ├── barcode.ts             # Barcode generation and label printing
│   │   ├── csv.ts                 # CSV export utility
│   │   ├── fefo.ts                # FEFO picking algorithm
│   │   └── format.ts              # Date, currency, status formatters
│   └── types/
│       └── database.ts            # TypeScript types matching schema
├── .env.example                   # Required environment variables
└── README.md
```

---

## Setup

### Prerequisites

- Node.js 18+
- npm
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone and Install

```bash
git clone <your-repo-url> medtrack
cd medtrack
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase project credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Find these in your Supabase Dashboard > Settings > API.

### 3. Run Database Migration

In the Supabase Dashboard:
1. Go to **SQL Editor**
2. Paste the contents of `supabase/migrations/00001_initial_schema.sql`
3. Click **Run**

Or if using the Supabase CLI:
```bash
supabase db push
```

### 4. Seed Demo Data (Optional)

```bash
npm install -D tsx dotenv
npx tsx scripts/seed.ts
```

This creates a demo tenant with:
- 15 medical supply products (gloves, syringes, gauze, vaccines, etc.)
- 4 suppliers, 5 customers
- Multiple lots with various expiration dates
- Stock movements and serial numbers
- Demo login: `demo@medtrack.io` / `demo1234`

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Customization Guide

This template is designed for client customization. Key points:

### Branding
- **App name**: Search for "MedTrack" in `src/components/layout/sidebar.tsx` and `src/app/layout.tsx`
- **Colors**: Edit CSS variables in `src/app/globals.css` (both `:root` and `.dark` sections)
- **Logo**: Replace the Pill icon in `sidebar.tsx` with a custom SVG or image

### Product Categories
- Categories are free-text fields on products. No hardcoded list — clients define their own.
- Storage requirements are typed (`room_temp`, `refrigerated`, `frozen`). Add more in:
  - `supabase/migrations/` (alter the enum)
  - `src/types/database.ts`
  - `src/lib/format.ts` > `storageLabel()`

### Roles & Permissions
- Three roles: `admin`, `manager`, `staff`
- Role-based UI is in individual page components (check `role` from `useAuth()`)
- RLS policies enforce data isolation at the database level
- To add more granular permissions, extend the `user_role` enum and update RLS policies

### Reports
- Reports are in `src/app/(app)/reports/page.tsx`
- Each report is a function that queries Supabase and calls `exportToCSV()`
- Add new reports by adding entries to the `reports` array and a `case` in `runReport()`

### Adding Fields
1. Add column to migration SQL
2. Update TypeScript types in `src/types/database.ts`
3. Update the relevant form dialog and list page
4. Run migration on Supabase

### Customer-Specific Features
- Use the `settings` JSONB field on the `tenants` table for per-client config
- Feature flags, custom thresholds, branding overrides can all live there

---

## Database Schema

12 tables with Row Level Security:

| Table | Purpose |
|-------|---------|
| `tenants` | Companies/organizations |
| `users` | Extends Supabase Auth with tenant + role |
| `products` | Product catalog |
| `suppliers` | Supplier directory |
| `customers` | Customer directory with license tracking |
| `lots` | Inventory lots with expiration and location |
| `serial_numbers` | Individual serial numbers tied to lots |
| `stock_movements` | Immutable audit trail (append-only) |
| `sales_orders` | Sales order headers |
| `sales_order_lines` | Order line items |
| `shipments` | Shipment records |
| `shipment_lines` | Links shipments to specific lots/serials |

Plus 2 views: `product_stock_summary`, `expiring_lots`

### Key Database Features
- **RLS enforced** on every table — users only see their tenant's data
- **Immutable movements** — triggers prevent UPDATE/DELETE on `stock_movements`
- **Auto-updated timestamps** via `updated_at` triggers
- **FEFO-ready indexes** on `lots.expiration_date`

---

## Deployment to Vercel

### Checklist

1. **Supabase Production Setup**
   - [ ] Create a production Supabase project
   - [ ] Run `00001_initial_schema.sql` in the SQL Editor
   - [ ] Configure Auth > Email Templates (confirmation, password reset)
   - [ ] Set Auth > URL Configuration > Site URL to your production domain
   - [ ] Add your production domain to Auth > URL Configuration > Redirect URLs
   - [ ] Review and tighten RLS policies if needed
   - [ ] Enable Point-in-Time Recovery for production backups

2. **Vercel Deployment**
   - [ ] Push code to GitHub
   - [ ] Import project in Vercel
   - [ ] Add environment variables:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
   - [ ] Deploy

3. **Post-Deploy**
   - [ ] Test signup flow end-to-end
   - [ ] Run seed script against production (or set up first tenant manually)
   - [ ] Set up a custom domain
   - [ ] Enable Vercel Analytics (optional)
   - [ ] Set up monitoring/alerts for the Supabase project

4. **For Each Client Deployment**
   - [ ] Fork the repo or create a branch
   - [ ] Update branding (app name, colors, logo)
   - [ ] Create a dedicated Supabase project
   - [ ] Run migrations
   - [ ] Deploy to Vercel with client-specific env vars
   - [ ] Create first admin user via signup flow

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Security | Row Level Security |
| Barcode | jsbarcode, qrcode, @zxing/browser |
| Forms | react-hook-form + zod |
| CSV Export | papaparse |
| Dates | date-fns |
| Deployment | Vercel |

---

## License

Private template. Not for redistribution without authorization.
