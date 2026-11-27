# Invexiqs integration priorities

## Validate before advertising

- Shopify, EasyPost, and fulfillment tracking. In a development store, import an order, fulfill it in Invexiqs, buy a test label, and confirm that fulfillment and tracking reach Shopify. Verify the integration worker on a scheduler before promising automatic sync.
- QuickBooks Online. Verify that an eligible shipped local order creates one unpaid USD invoice and can be reconciled on retry. Full accounting sync, paid POS and Shopify invoice exports, and COGS posting are separate work.
- Existing Shopify, EasyPost, QuickBooks Online, and Zapier implementations have test coverage. Use provider acceptance results to decide what can be advertised.

## Choose the next connector by pilot demand

- WooCommerce for ecommerce distributors who need web orders and available-stock updates.
- Square for retail stockrooms that need store sales and stock movement visibility.
- Excel and Google Sheets via CSV for self-serve setup. Consider live spreadsheet sync only if customers have an ongoing need.

Reference [the commercial readiness notes](../COMMERCIAL_READINESS.md) for the current connector scope.
