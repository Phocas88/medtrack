# Commercial readiness — implementation progress

This branch is **not approved for production launch**. It contains a substantial implementation and hardening pass against the baseline in STATUS.md. Existing production data/configuration has not been inspected or changed. Passing a local build and tests is not a substitute for applying migrations in staging or verifying providers.

## Implemented in the initial hardening pass

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

## Implemented in the latest upgrade pass

- The authenticated dashboard is now a real tenant-scoped order desk with search, status filters, pagination, customer/line details and fulfillment deep links. Local draft orders can be confirmed or cancelled with optimistic status checks. Imported Shopify orders must be changed in Shopify.
- Shared operational tables now offer column visibility, density controls, keyboard sorting/row access and clamped pagination. Product search covers name/SKU/category and distinguishes load failures from empty stock.
- Staff route matching now distinguishes `/scan` from `/scanner`. General API authorization rejects staff. Restrictive database policies limit staff to scanner/floor resources and safe product/lot views, and scanner task product details now come from the safe view instead of the denied raw product relationship. General financial/order/customer records and peer user profiles are hidden. Private document Storage policies restrict direct access to administrators/managers, including a restrictive boundary against broader permissive policies.
- Distributed database rate limiting protects authenticated user APIs, embedded identities, integration challenges, notification workers and Zapier calls. It fails closed when its database is unavailable.
- EasyPost label purchase claims are locked and bound to an order/rate. A timed-out purchase stays uncertain; recovery reads the original provider shipment and never blindly purchases another label. Purchase completion and order tracking are committed together. The authenticated order desk supplies a rate/purchase/recovery/reprint dialog; entering addresses or parcel changes invalidates prior displayed rates. Signed tracker events read the current provider status; older events cannot overwrite newer delivery state.
- Shipping serialized products requires scanned serials. The server allocates the actual scanned lot, rejects duplicate/unavailable serials and records the shipment on each shipped serial. The UI preview uses those scanned lots.
- Shopify catalog, order, count, location and outbound operations use Admin GraphQL. Nested variant/order-line collections paginate. Externally fulfilled orders are explicitly distinguished, and partially fulfilled imports retain only remaining quantities.
- Shopify webhooks use a durable queue with leases, retry limits, safe error categories and administrator retry controls. Product import stores variant/inventory-item mappings. Opt-in stock publishing targets one Shopify location using total warehouse stock less open commitments; compare-and-set writes and queue revisions prevent silently losing concurrent updates. Shipment posting queues remote fulfillment/tracking, using current remaining fulfillment-order quantities on retries.
- `/shopify` includes App Bridge and current Polaris web components. Session JWTs are verified for signature, algorithm, audience, issuer, destination and lifetime. A one-time top-level linking flow binds a Shopify identity to an existing active Invexiqs manager/admin; third-party cookies are not required after linking. Only the exact validated shop/admin can frame the embedded page. Link approval remains protected against framing. Uninstall/redaction cleans up the new identity/mapping/job state.
- QuickBooks Online now has administrator OAuth, encrypted credentials, serialized refresh, revocation, existing customer/item/tax mappings, immutable invoice snapshots and idempotent invoice export for shipped orders. A stable document number supports reconciliation; unresolved exports over 24 hours old are not blindly recreated. This is **USD unpaid local warehouse-order invoice export**, not full accounting or COGS/purchasing/bank reconciliation. Shopify and paid POS exports are blocked until payment, discount, tax and freight reconciliation are implemented.
- Receiving, lot, GS1 and Prop 65 print labels escape untrusted product text. GS1 printing uses the installed barcode renderer rather than an injected third-party script.
- Notification/PO email text is HTML escaped. Notification retries use per-recipient provider idempotency keys and return failure when delivery fails. The demo page no longer claims fabricated competitor percentages or full feature completeness.
- `npm run test:staging` supplies actual hosted Auth/PostgREST/Storage/role/concurrency acceptance checks, with explicit isolated-project confirmation, redacted output and fixture cleanup. It has not been executed against a hosted project.

## Warehouse launch workflow updates

- Local orders can post selected quantities against scan-verified cartons through migration `00041_partial_local_shipments.sql`. The order stays open until its remaining quantities ship. Migration `00042_carton_carrier_labels.sql` adds EasyPost labels for posted cartons on local orders. The workflow verifies packed contents, posts stock, then lets operators buy or reprint one label per carton before carrier handoff. Carton delivery events update the carton independently. Shopify orders retain the order-level label flow.
- Shopify sync activity distinguishes import, inventory publishing, and fulfillment jobs and shows the last completed job. Real Shopify, EasyPost, and QuickBooks acceptance remains a release gate.
- Setup imports support reusable CSV column mappings in the current browser. Setup also includes a sample lot label and a scanner check that do not post stock movements.
- Warehouse follow-ups now surface existing shift priorities and link to expiring stock, pick-bin replenishment, and integration activity. Shared, tote-verified wave execution remains unavailable.

## Release gates still open

This is **not** a declaration that every requested feature is finished:

1. **Hosted acceptance and provider verification:** no Supabase account connection/shared-browser control is available in this session. Production and staging schema/configuration remain unverified. Real Stripe test lifecycles, sender/recovery email delivery, Intuit sandbox OAuth/invoice tax behavior, EasyPost test purchases/tracking, Shopify development-store schema/scopes and embedded launch/linking must pass before rollout. Shopify App Store review is external and has not occurred. Stripe handles direct SaaS subscriptions; Shopify public-app billing rules/exemptions must be resolved, and native Shopify Billing is not implemented.
2. **Incomplete optional workflows:** waves/cross-docking still use local planning state and need shared transactional orchestration. Controlled-substance reconciliation/regulatory reporting, custom-field entity value forms, and some work-order writes remain unfinished or require conversion/review. Consignment/disposition posting is now transactional; consignment classification still relies on legacy notes and needs an explicit ownership model. Wave picking, cross-docking, controlled-substance reconciliation, custom fields, service work orders and consignment are now excluded from navigation/search and show an explicit unavailable screen on direct access. They are not included as finished workflows in the sellable release. Custom fields are no longer advertised as an included paid-plan feature.
3. **Serial-specific workflows beyond shipping:** PO receipts, returns, transfers and kitting still reject unsupported individual-serial workflows. Receiving and shipping support serial capture; other operations need their own physical-serial forms and posting rules.
4. **Payments/shipping scope:** card/check POS remains unavailable. Cash checkout is implemented. EasyPost now requires an encrypted tenant-connected account, validates carrier-account access and registers a per-account signed webhook. Paid pickup booking is explicitly unavailable; schedule pickups directly with EasyPost. Account/key rotation while preserving old shipment access remains a support operation. Local order partials are supported after migration 00041. Local carton label purchase and reprint are implemented. Shopify partials, carrier label voids, and provider-stage acceptance need further work.
5. **Accounting scope:** exported invoices need accountant review of mappings and taxes. COGS journals, supplier bills, payment allocation, multi-currency and bank reconciliation are not implemented. Changing the connected accounting company requires deliberate reconciliation of saved mappings/exports.
6. **Operations:** perform a backup/restore drill, alert delivery checks and sustained hosted concurrency tests. The five-minute integration cron requires Vercel Pro or another scheduler supporting that frequency. An embedded shell and passing fixture tests do not establish Shopify review readiness.
7. **Sync limitations:** stock publishing is deliberately opt-in, aggregates all Invexiqs locations into one selected Shopify location, and treats Invexiqs as the quantity source. It is eventual synchronization, not instantaneous reservations across systems. Shopify quantity edits are overwritten when publishing is enabled. External fulfillment/provider exceptions need reconciliation; customer notifications are not automatically emitted by fulfillment export.

## Safe migration and rollout procedure

1. Create a database backup and an isolated Supabase staging project. Confirm its actual schema against the repository and account for any manual production changes.
2. For an existing database, apply **only the new forward migrations 00006–00037**, in order, after confirming which migrations already ran. **Do not replay 00000 or 00003 against an existing customer database**; they are destructive historical migrations.
3. Validate tenant counts, active administrators, existing billing identifiers and Shopify connections. Legacy plaintext Shopify tokens are not migrated into the private credential store: reconnect those stores. Legacy Zapier keys are revoked by the new hashed-key flow. QuickBooks secrets are removed from browser-readable settings.
4. Provision provider configuration in the hosting dashboard. `npm run readiness` prints missing variable names only; it does not read env files or reveal values. Presence is not proof that credentials work.
5. Configure Supabase Site URL/allowed redirects for login, `/auth/callback`, and `/auth/reset?type=recovery`. Verify default invitation/recovery templates or configure token-hash links to the callback. Exercise both new and existing users, expired links and users already signed in.
6. Configure the private `tenant-documents` bucket/policies through migration 00010. Test real upload/download and cross-tenant denial using hosted Storage.
7. Set Stripe Checkout prices and Billing Portal products, point the webhook to `/api/stripe/webhook`, and verify subscribe/change/cancel/payment-failure/retry in test mode. Reconcile legacy subscriptions lacking metadata.
8. Copy `shopify.app.example.toml` to an actual Partner app configuration, set its client ID/domain, register subscriptions, and verify installation, replay and privacy processing in a development store. The example points at the embedded shell. Verify App Bridge, identity linking, all granted scopes and provider behavior in a development store before submitting it for review.
9. Configure `CRON_SECRET`, `NOTIFICATION_API_KEY`, Resend sender/domain and Sentry. Notification checks run daily at 07:00 UTC; integration work/reconciliation is scheduled every five minutes (requires a supporting Vercel plan). Missing configuration fails closed.
10. Run the staging acceptance matrix below, fix all remaining release gates, then promote a reviewed deployment. This branch does not automatically apply database migrations or deploy production.

## Staging acceptance matrix

- Visitor → signup → confirmation → onboarding → product/customer → receive → ship → invoice.
- Subscribe → duplicate checkout prevention → plan changes → cancellation → failed payment → renewal; webhook duplicates/out-of-order delivery.
- Two tenants, three roles, disabled/scanner-only users; direct PostgREST cost/privilege/relationship attempts.
- Two operators competing for the last units; replay after network failure; quarantined/expired/serialized stock.
- Carton-verified local partial shipment → retry the same request → ship the remaining units.
- PO partial receipt → assigned put-away → bin balance; counts changed after planning; return directions; component shortage rollback; partial transfers.
- Portal invite → password setup → catalog without costs → authoritative customer pricing → existing-order fulfillment.
- Private document download with another tenant's ID/path.
- Shopify install/reinstall/uninstall, unmapped SKU failures, paginated import, duplicate/update events, privacy request download/redaction.
- Cash sale with tampered client price, insufficient cash/stock, configured tax and duplicate submission.
- Notification provider outage/retry, missing worker secrets, GDPR export retention, monitoring alerts.

## Verification record

At the latest completed checks: **81 unit/PostgreSQL tests** passed. The final browser run passed **120 Chromium/HTTP checks**, including the local analytics routing fix, embedded frame policy, private API guards and preview interactions. TypeScript, lint and the production build also passed; lint retains pre-existing warnings. Browser tests use fake local credentials and exercise public/unauthenticated behavior; database tests cover transactional and authorization logic. No claim of successful live-provider or authenticated staging acceptance is made.

- Consignment consumption/conversion, destruction, donation and recall now post transactionally with replay protection, bin checks and explicit error handling. Recall is a zero-quantity status change. Serialized dispositions still require a dedicated capture workflow; ambiguous partial multi-bin dispositions are rejected.

## Additional configuration for this pass

- QuickBooks: `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, and `QUICKBOOKS_ENVIRONMENT` (`sandbox` by default; explicitly set `production` for a reviewed live rollout). Register `/api/quickbooks/callback` as the Intuit redirect. Credentials share the configured server encryption key; never put them in tenant-readable settings.
- EasyPost: each tenant administrator connects their own account at `/integrations/shipping`. The server validates account access, encrypts the key, and registers `/api/shipping/webhook` with a generated per-account secret. Label costs go to that tenant’s EasyPost account. Legacy platform-funded quotes require reconciliation with their original account before recovery; new purchases do not fall back to a platform key.
- Staging harness: `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, and `STAGING_PROJECT_CONFIRMATION`. Supply them through the execution environment, never through chat or committed files. The confirmation must match the dedicated staging project reference. The harness creates and removes isolated acceptance fixtures.
- Read [OPERATIONS.md](OPERATIONS.md) for release, recovery and monitoring checks. No production migration, charge, shipment, email or accounting write has been executed during this work.
