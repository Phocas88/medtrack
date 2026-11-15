# Stokora workspace UI

## Implemented first pass

- Scoped emerald workspace palette with light and dark themes, a dark navigation rail, roomier header, bounded content width and lighter card shadows.
- Shared dashboard introduction and direct receiving, shipping, counting and scanner links across dashboard presets.
- Accessible names for search, account and favorite controls, visible keyboard focus and reduced-motion support.
- `/demo/workspace` provides a public, read-only visual preview with explicitly labeled sample data. Its simplified navigation illustrates the design direction; the authenticated application retains its full role/preset/module navigation.

This is a foundation, not a completed redesign of every application screen. The preview does not connect to tenant data or bypass authentication on its app links.

## Next UI work

1. Inventory: consistent search/filter toolbar, readable density, saved views, column visibility, pagination and useful empty/error/loading states.
2. Orders: unified order detail, fulfillment timeline and clear partial receipt/shipment states, with server errors and retry guidance.
3. Scanner: large touch targets, scan feedback, assigned-task progression and physical serial confirmation.
4. Onboarding/billing: guided warehouse setup, understandable plan limits and recovery from payment/setup failures.
5. Accessibility and acceptance: authenticated screenshots across roles, keyboard navigation, contrast, mobile tables, destructive-action confirmation and real staging data.

Do not replace real operations with decorative controls, fabricated trends or successful-looking provider states. Preserve staff cost restrictions in both UI and database access.

## Launch work remains separate

See `COMMERCIAL_READINESS.md` for the staging acceptance matrix and remaining functional blockers. Complete hosted Supabase/provider acceptance before accepting production customers. A visual refresh does not close those gates.
