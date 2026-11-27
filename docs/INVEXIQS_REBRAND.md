# Invexiqs WMS implementation report

The rebrand is implemented in the `codex/invexiqs-rebrand` worktree, based on production commit `d8109de4237febedfb1b389da3b297bd726f2461`. No production deployment was made.

## Identity and theme

- `src/lib/brand.ts` holds the brand, product names, tagline, canonical artwork path, and hex colors for metadata, email, print, and social images.
- `src/app/globals.css` defines the exact requested colors, light and dark role tokens, chart colors, accessible coral text and control borders, and the public CTA treatment.
- `tailwind.config.ts` exposes the shared tokens to application components. Existing semantic status colors remain independent.
- `src/components/ui/invexiqs-logo.tsx` supplies the shared responsive brand treatment for navigation, authentication, marketing, POS, scanner, and the customer portal.
- The original 1530 × 422 PNGs are installed unchanged at `public/branding/invexiqs-logo.png` and `public/branding/invexiqs-logo-white.png`. Both match the archived files byte for byte. The shared component uses the transparent file by default and the white-background file for dark scanner and POS headers.
- The SVG at `public/branding/invexiqs-icon.svg`, PNG application and Apple Touch icons in the same directory, and `src/app/favicon.ico` use the X isolated directly from the transparent logo. The favicon contains 16, 32, and 48 px entries. The social card at `src/app/opengraph-image.tsx` uses text and the brand palette.

## Updated areas

The new identity is visible in the marketing site, public navigation and footer, demo, authenticated navigation and UI, account screens, scanner, POS, customer portal, Shopify app surfaces, onboarding and settings copy, analytics charts, support, legal pages, inquiry and outbound email copy, error and loading pages, and printable warehouse and sales documents. Existing tenant names and customer document details continue to come from their records.

The landing page retains the June 2027 date, demo entry points, planned-pricing section, and inquiry form. Product images are crops of existing sample-workspace screenshots with the previous brand header removed. The old public audit URL now points readers to current product documentation and the interactive demo. Both manifest URLs are supported.

## Compatibility and operational notes

- Database schemas, migration files, RPCs, existing API paths, tenant records, access rules, and inventory and financial calculations were retained. Public route access was extended only for public metadata and the existing documentation URL.
- The GitHub repository `Phocas88/medtrack`, package identifier `stokora-wms`, Vercel project, deployment origin fallback, historical migration literals, and legacy Shopify integration identifiers remain for compatibility.
- The `stokora_*` browser storage keys preserve existing preferences and drafts. The `Stokora_AI_Key` environment alias preserves working installations. The `gid://stokora/InventoryUpdate/` prefix preserves integration references. The `@stokora-wms.com` check preserves existing demo authorization behavior.
- The existing transactional sender domain fallback remains in server mail configuration. Email display names and message copy are branded. Public support and privacy addresses use `NEXT_PUBLIC_SUPPORT_EMAIL` and `NEXT_PUBLIC_PRIVACY_EMAIL` when configured, with links to the existing contact flow otherwise.
- The current app origin is used for links until an official domain is configured. Legal company identity and contact-domain ownership were not assumed.
- A real signed-in hosted workflow, physical camera scan, and delivery through live email providers require a configured test account and services. Automated checks use local fixtures and signed-out browser coverage.

## Verification

| Check | Result |
|---|---|
| Production build | Passed. Next.js generated 147 static pages. |
| TypeScript | Passed as part of the final production build and in the standalone check before final visual refinements. |
| Lint | Passed with existing hook-dependency and alternative-text warnings. |
| Unit and database tests | 84 passed. |
| Browser tests | 122 passed against the optimized production build with system Chromium. An earlier development-server run had one transient connection reset. |
| Authentication | A local Supabase fixture exercised manager login, dashboard navigation, the scanner header, and sign-out. Existing browser tests covered registration form rendering and protected redirects. |
| Responsive and asset review | Inspected landing pages at 390, 768, and 1440 px, the login screen, the demo workspace, and fixture-authenticated dashboard and scanner screens. Browser tests verified that the public images decode and both manifests, favicon, Apple icon, and social image are available. |
| Contrast spot checks | Charcoal on Coral 5.51:1, Royal Plum on White 9.99:1, Royal Plum on Lavender 8.91:1, Muted Gray on Lavender 5.07:1, and Lilac on Deep Plum 6.06:1. The control border on white measured 3.81:1. These are representative checks. |
| Legacy references | Audited source and public assets. Remaining old-name references are documented compatibility identifiers and service addresses. |

## Exact repository file inventory

### Created (14)

- `docs/INVEXIQS_REBRAND.md`
- `public/branding/invexiqs-192.png`
- `public/branding/invexiqs-512.png`
- `public/branding/invexiqs-apple.png`
- `public/branding/invexiqs-icon.svg`
- `public/branding/invexiqs-logo-white.png`
- `public/branding/invexiqs-logo.png`
- `src/app/auth/layout.tsx`
- `src/app/manifest.json/route.ts`
- `src/app/manifest.ts`
- `src/app/opengraph-image.tsx`
- `src/components/ui/invexiqs-logo.tsx`
- `src/lib/brand.ts`
- `tests/branding.spec.ts`

### Modified (69)

- `.env.example`
- `.github/workflows/ci.yml`
- `COMMERCIAL_READINESS.md`
- `OPERATIONS.md`
- `README.md`
- `SECURITY.md`
- `STATUS.md`
- `UI_ROADMAP.md`
- `audit-report.html`
- `docs/CLIENT_SETUP_GUIDE.md`
- `public/audit-report.html`
- `public/product/bins.webp`
- `public/product/dashboard.webp`
- `public/product/inventory.webp`
- `public/product/scanner.webp`
- `scripts/seed.ts`
- `shopify.app.example.toml`
- `src/app/(app)/dashboard/lite-dashboard.tsx`
- `src/app/(app)/integrations/shopify/page.tsx`
- `src/app/(app)/inventory-overview/lite-dashboard.tsx`
- `src/app/(app)/loading.tsx`
- `src/app/(app)/metrics/page.tsx`
- `src/app/(app)/products/import-dialog.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/app/(pos)/layout.tsx`
- `src/app/(scan)/layout.tsx`
- `src/app/(scan)/scan/page.tsx`
- `src/app/api/contact/route.ts`
- `src/app/api/notifications/send-email/route.ts`
- `src/app/api/po/send/route.ts`
- `src/app/api/shipping/dropship/route.ts`
- `src/app/api/shipping/pickup/route.ts`
- `src/app/api/shopify/callback/route.ts`
- `src/app/api/shopify/embedded/orders/route.ts`
- `src/app/auth/login/page.tsx`
- `src/app/auth/reset/page.tsx`
- `src/app/auth/signup/page.tsx`
- `src/app/demo/layout.tsx`
- `src/app/demo/page.tsx`
- `src/app/demo/workspace/page.tsx`
- `src/app/favicon.ico`
- `src/app/global-error.tsx`
- `src/app/globals.css`
- `src/app/guide/page.tsx`
- `src/app/inquiry-form.tsx`
- `src/app/layout.tsx`
- `src/app/legal/privacy/page.tsx`
- `src/app/legal/terms/page.tsx`
- `src/app/not-found.tsx`
- `src/app/page.tsx`
- `src/app/portal/layout.tsx`
- `src/app/shopify/embedded-workspace.tsx`
- `src/app/shopify/link/page.tsx`
- `src/app/shopify/page.tsx`
- `src/app/support/page.tsx`
- `src/components/integrations/inventory-publishing.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/public-header.tsx`
- `src/components/layout/sidebar.tsx`
- `src/components/ui/page-header.tsx`
- `src/components/ui/tabs.tsx`
- `src/lib/constants.ts`
- `src/lib/pdf.ts`
- `src/lib/public-site.ts`
- `src/lib/release-scope.ts`
- `src/lib/security.ts`
- `tailwind.config.ts`
- `tests/landing.spec.ts`
- `tests/seo.spec.ts`

### Deleted (4)

- `public/icon.svg`
- `public/manifest.json`
- `public/stokora-logo.png`
- `src/components/ui/stokora-logo.tsx`
