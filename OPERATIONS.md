# Invexiqs rollout and recovery

No production migration or provider write has been executed by the implementation work. A passing build does not establish commercial readiness. Use the remaining gates in `COMMERCIAL_READINESS.md`.

## Before promoting a deployment

1. Use a dedicated Supabase staging project and staging provider accounts. Verify the actual migration history/schema before applying forward migrations. Never replay destructive historical migrations 00000 or 00003 on an existing database.
2. Back up the production database with the provider's supported backup/export tooling and record the recovery point. Supabase Storage object contents require their own backup; a database dump alone does not preserve uploaded documents.
3. Restore into an isolated project before making a production change. Disable outgoing workers and provider credentials in the restored environment until test-mode accounts are configured. Do not accidentally run restored live accounting/payment/shipping credentials.
4. Apply unapplied forward migrations through 00037 to staging in order. Check foreign-key/RLS policies, existing administrator accounts, trial dates, billing identifiers, legacy Shopify reconnection and revoked Zapier keys.
5. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` and the browser suite. Run `npm run test:staging` with the dedicated staging environment configuration described in the readiness report. The runner refuses the project referenced by the current public production deployment. The hosted runner creates test users, tenants, stock, orders and a document, then cleans them up. It never prints credentials or provider error payloads.
6. Exercise real test-mode Stripe checkout/duplicate clicks/plan changes/cancellation/failed payment; Supabase confirmation/invitation/recovery; Shopify install/link/import/publish/fulfillment/uninstall/privacy; Intuit authorization/refresh/revocation/invoice export; tenant-owned EasyPost connection, webhook registration, purchase timeout/recovery/tracker events; and Resend delivery/retry.
7. Confirm cron frequency support. `vercel.json` schedules integrations every five minutes and notifications daily. Hobby plans may reject the integration schedule; use a supported plan or an authenticated external scheduler. Never remove cron authorization to make scheduling work.
8. Review provider mappings, currencies and taxes. QuickBooks export supports unpaid local warehouse-order USD invoices and does not record customer payments or post COGS journals. Shopify publishing replaces one location's available quantity with total Invexiqs availability less open commitments.
9. Verify actual Sentry alert delivery and an independent uptime monitor, then promote a reviewed deployment. Do not enable incomplete modules as part of the release.

## Alert checks

- Alert on repeated `/api/health` 503 responses and application error bursts. A healthy database response is not proof that email, OAuth or payments work.
- Alert on integration jobs in `failed`, or pending work older than 15 minutes. Inspect the administrator integration activity screen. Correct SKU/location/scopes/connectivity before retrying a failed job.
- Alert on `shipping_quotes.purchase_state='uncertain'`. Recovery must retrieve the original EasyPost shipment; never buy a second label to conceal an unresolved first purchase.
- Alert on unresolved accounting exports. Retry the same order/snapshot. A stable provider document number and request ID prevent normal retries from silently generating a different invoice. Exports unresolved for more than 24 hours require accountant reconciliation before another creation attempt.
- Monitor unsent notifications and email-provider errors. Provider idempotency has finite retention; prolonged outages require reviewing provider delivery records before bulk resending.
- Monitor missed scheduler invocations and verify token/configuration rotation without exposing secret values in logs.

## Recovery rules

- Re-run a stock operation using the original request UUID after a lost response; do not generate a new operation ID until the prior outcome is known.
- An integration worker lease expires after two minutes. Another worker can recover it. Revision changes during a stock publish keep the job pending for another pass.
- For a timed-out label purchase, retry recovery on the same shipment/order/rate. A second purchase is intentionally refused while the outcome is uncertain.
- Disconnecting Shopify removes embedded identity links and queued work and disables stock publishing. Reconnection and publishing are explicit actions. Shop redaction also removes mappings and challenges.
- Revoking QuickBooks access preserves exported invoice references and immutable snapshots for reconciliation. Changing companies is blocked until mappings/exports have been deliberately reconciled.
- Restore tests must check tenant isolation, role restrictions, billing state, stock totals, document contents/access and worker configuration before any outgoing work resumes.

## Invexiqs Suite Add-ons

Apply forward migrations 00063 through 00069 in order before serving the updated app. The **Invexiqs Suite** workspace shows each optional subscription and links to the included WMS workflow. Add-on access requires an eligible WMS subscription and a current subscription for that product.

- **Billing** uses a separate Stripe subscription for each add-on through the existing WMS billing customer. Configure the six `STRIPE_PRICE_ADDON_*` variables with approved recurring prices. Keep the existing verified Stripe webhook and enable subscription cancellation in the customer portal. Verify checkout, activation, renewal, failed payment, and cancellation using Stripe test mode.
- **Purchasing** uses Supabase Auth invitations. Allow the supplier recovery redirect under `/auth/reset` in Supabase Auth and verify delivery using the configured sender. Confirm an invited supplier sees only orders from the purchasing account that invited them.
- **Analytics** uses the existing daily scheduler and Resend notification worker. Test a daily CSV snapshot, email delivery, and the recipient’s private report download with a configured sender.
- **Commerce** imports paid WooCommerce orders awaiting fulfillment. Create a connection in the Commerce workspace, configure an active **Order updated** webhook on a test store, and match its SKUs to Invexiqs SKUs. The review queue supports retrying an unmapped order. Shopify keeps its existing integration.
- **POS** uses a store-owned Stripe Terminal account. In a test workspace, connect a supported simulated or physical reader with a restricted test key. The key needs Terminal reader access, PaymentIntent access, charge reads, and refund access. Verify approval, cancellation, replay, refund, and drawer closeout before connecting a live reader.
- **Shipping** uses EasyPost rates for parcel recommendations. The dispatch board records freight shipment manifests, pickup, and delivery. Carrier booking is handled through the carrier.
- **Manufacturing** uses active kit definitions as bills of materials. Work orders record their component quantities at planning time and post actual material, labor, and overhead cost to the finished lot at completion.
