# Stokora workspace UI

## Current direction: operations workbench

- Neutral workspace palette with restrained blue actions, light/dark themes, horizontal desktop navigation and compact page headers. Mobile navigation retains its accessible sheet.
- Compact operations toolbar with direct receiving, shipping and scanner links across dashboard presets. Hero messaging and shortcut cards have been removed.
- Accessible names for search, account and favorite controls, visible keyboard focus and reduced-motion support.
- `/demo/workspace` provides an interactive order-desk preview: status filters, search, selectable order rows and a detail panel. All records are explicitly labeled samples. Its simplified navigation illustrates the design direction; the authenticated application retains its full role/preset/module navigation.

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
