# Commercial readiness — implementation progress

This branch is **not approved for production launch**. It contains a substantial implementation and hardening pass against the baseline in STATUS.md. Existing production data/configuration has not been inspected or changed. Passing a local build and tests is not a substitute for applying migrations in staging or verifying providers.

## Implemented in this branch

- Next.js upgraded to 15.5.29; bundled font removes build-time Google Fonts dependency.
- Public acquisition/legal/support pages; safer internal redirects; signup provisioning in the Auth database transaction; active-user enforcement; invitation/reset delivery requests without exposing action links.
- Staff access limited to assigned floor tasks/scanner, as requested. Database policies block raw product/lot costs; scanner views contain no purchasing costs. Managers retain operational access. Managers cannot promote themselves. Cross-tenant foreign-key relationships are checked.
- Billing moved out of client-writable settings. Checkout uses authenticated tenant ownership, server-side price allowlisting, customer reuse and subscription metadata. Webhooks verify signatures, retrieve current provider state, and commit event deduplication with billing changes. Errors remain retriable. Trial/resource limits are enforced in SQL; expired accounts can still reach billing to renew.
- Real transactions and replay protection for receiving, PO receiving, shipping existing/manual orders, returns, kit assembly and cash POS. Cycle-count posting checks for stale stock; ambiguous multi-bin/lotless variances are rejected rather than posted to an arbitrary bin.
- Quarantine destruction updates lot/bin balances; held/rejected stock is excluded from canonical shipping/assembly.
- Transfers track dispatched/in-transit/received quantities, support partial receipts without moving an entire source lot, and retain the physical batch identifier across locations.
- Scanner task starts/completions enforce assignment. Supported bin moves/put-away post with task completion. Picking confirmation remains separate from shipment posting.
- Shared dock scheduling with database double-booking protection.
- Shopify destination/OAuth/HMAC validation, private encrypted credentials, exact shop binding, session handoff and transactional order imports. Order events do not falsely decrement warehouse stock. Product/order collection pagination, retriable failures and uninstall token removal.
- GDPR processing now compiles a private customer/order export and anonymizes scoped records; admin export retrieval and 30-day retention cleanup are supplied. Mandatory topics are declared in the example Shopify configuration.
- Portal membership binding and server-authoritative product pricing/order posting. Client-submitted prices cannot lower order prices.
- Private Supabase document storage, tenant upload policies and short-lived authorized downloads.
- Zapier keys generated cryptographically, stored hashed, rotated server-side, and matched without scanning tenants. Validated transactional actions and polling endpoints replace incompatible inserts/mock activity logs.
- Missing Resend configuration/failed delivery no longer becomes successful delivery. Daily authenticated notification worker, Sentry runtime instrumentation, CI and separate unit/database/browser runners.
- Marketing no longer advertises implemented card checkout, two-way Shopify stock sync, automatic regulatory certification or time-travel auditing. QuickBooks credential collection/fake synchronization and simulated FDA scans are disabled explicitly.

## Release gates still open

These are real unfinished work, not merely environment variables:

1. **Shopify public/embedded app:** implement and verify App Bridge/session-token/Polaris behavior if distributing as an embedded public app. The supplied example explicitly remains non-embedded. Migrate public-app integration paths to the required GraphQL APIs; implement durable jobs, variant/inventory/location mappings, stock/tracking pushback and reconciliation. App Store review has not occurred.
2. **Accounting:** QuickBooks is intentionally unavailable; real Intuit OAuth, refresh, mappings, accounting sync and reconciliation remain to be implemented. Do not sell it as connected.
3. **Other operational screens:** waves/cross-docking still require shared persistent orchestration tied to actual tasks/receipts/fulfillment. Controlled-substance reconciliation and regulatory reporting need durable/compliant workflows. Custom-field definitions still need integration into entity value forms. Some consignment/expiration/work-order operations still use legacy browser writes and need conversion/review.
4. **Serial-specific operations:** PO receipt, returns, transfers and kitting explicitly reject serial workflows without individual serial capture. Shipping currently allocates available serials automatically; physical serial verification is still required for businesses that need it.
5. **Payments/shipping:** card/check POS checkout remains unavailable. Cash works; configure tax correctly and obtain applicable tax advice. EasyPost paid-call concurrency/idempotency, carrier tracking events, label recovery and tenant-specific carrier accounts require further work and real test-account verification.
6. **Security/operations:** complete distributed API throttling, HTML template hardening, authenticated browser coverage, sustained concurrent database tests, backup/restore drill and alerting validation. PostgreSQL tests use PGlite with Supabase Auth stubs; they do not prove PostgREST relationship inference, Supabase Storage behavior, real email templates or hosted Auth behavior.
7. **Provider staging verification:** install/verify a development Shopify app; configure real Stripe test prices and event subscriptions; verify sender domains and recovery emails; use EasyPost test credentials. No real external payment/email/shipping operation has been executed during this work.

## Safe migration and rollout procedure

1. Create a database backup and an isolated Supabase staging project. Confirm its actual schema against the repository and account for any manual production changes.
2. For an existing database, apply **only the new forward migrations 00006–00020**, in order, after confirming which migrations already ran. **Do not replay 00000 or 00003 against an existing customer database**; they are destructive historical migrations.
3. Validate tenant counts, active administrators, existing billing identifiers and Shopify connections. Legacy plaintext Shopify tokens are not migrated into the private credential store: reconnect those stores. Legacy Zapier keys are revoked by the new hashed-key flow. QuickBooks secrets are removed from browser-readable settings.
4. Provision provider configuration in the hosting dashboard. `npm run readiness` prints missing variable names only; it does not read env files or reveal values. Presence is not proof that credentials work.
5. Configure Supabase Site URL/allowed redirects for login, `/auth/callback`, and `/auth/reset?type=recovery`. Verify default invitation/recovery templates or configure token-hash links to the callback. Exercise both new and existing users, expired links and users already signed in.
6. Configure the private `tenant-documents` bucket/policies through migration 00010. Test real upload/download and cross-tenant denial using hosted Storage.
7. Set Stripe Checkout prices and Billing Portal products, point the webhook to `/api/stripe/webhook`, and verify subscribe/change/cancel/payment-failure/retry in test mode. Reconcile legacy subscriptions lacking metadata.
8. Copy `shopify.app.example.toml` to an actual Partner app configuration, set its client ID/domain, register subscriptions, and verify installation, replay and privacy processing in a development store. Do not submit the example as an embedded-ready app.
9. Configure `CRON_SECRET`, `NOTIFICATION_API_KEY`, Resend sender/domain and Sentry. The Vercel schedule is daily at 07:00 UTC. Missing configuration fails closed.
10. Run the staging acceptance matrix below, fix all remaining release gates, then promote a reviewed deployment. This branch does not automatically apply database migrations or deploy production.

## Staging acceptance matrix

- Visitor → signup → confirmation → onboarding → product/customer → receive → ship → invoice.
- Subscribe → duplicate checkout prevention → plan changes → cancellation → failed payment → renewal; webhook duplicates/out-of-order delivery.
- Two tenants, three roles, disabled/scanner-only users; direct PostgREST cost/privilege/relationship attempts.
- Two operators competing for the last units; replay after network failure; quarantined/expired/serialized stock.
- PO partial receipt → assigned put-away → bin balance; counts changed after planning; return directions; component shortage rollback; partial transfers.
- Portal invite → password setup → catalog without costs → authoritative customer pricing → existing-order fulfillment.
- Private document download with another tenant's ID/path.
- Shopify install/reinstall/uninstall, unmapped SKU failures, paginated import, duplicate/update events, privacy request download/redaction.
- Cash sale with tampered client price, insufficient cash/stock, configured tax and duplicate submission.
- Notification provider outage/retry, missing worker secrets, GDPR export retention, monitoring alerts.

## Verification record

At the latest completed checks: **54 unit/PostgreSQL tests** and **110 Chromium/HTTP tests** passed. TypeScript and the production build are checked separately. Browser tests use fake local credentials and exercise public/unauthenticated behavior; database tests cover transactional and authorization logic. No claim of successful live-provider or authenticated staging acceptance is made.
