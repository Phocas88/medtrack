import type { Lot } from '@/types/database';

/**
 * Sort lots by FEFO (First Expired, First Out) logic:
 * 1. Nearest expiration date first
 * 2. Oldest received date as tiebreaker
 * 3. Lots without expiration dates go last
 */
export function sortByFEFO(lots: Lot[]): Lot[] {
  return [...lots].sort((a, b) => {
    // Both have expiration dates
    if (a.expiration_date && b.expiration_date) {
      const expDiff = new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
      if (expDiff !== 0) return expDiff;
      // Tiebreaker: oldest received first
      return new Date(a.received_date).getTime() - new Date(b.received_date).getTime();
    }
    // Only a has expiration — a goes first
    if (a.expiration_date && !b.expiration_date) return -1;
    // Only b has expiration — b goes first
    if (!a.expiration_date && b.expiration_date) return 1;
    // Neither has expiration — sort by received date
    return new Date(a.received_date).getTime() - new Date(b.received_date).getTime();
  });
}

/**
 * Pick lots for a given quantity using FEFO.
 * Returns the lots to pick from with quantities, and whether any are expired.
 */
export function pickLotsForQuantity(
  lots: Lot[],
  quantity: number
): { picks: { lot: Lot; pickQuantity: number }[]; hasExpired: boolean; fulfilled: boolean } {
  const activeLots = lots.filter(
    (l) => l.status === 'active' && l.quantity_on_hand > 0
  );
  const sorted = sortByFEFO(activeLots);

  const picks: { lot: Lot; pickQuantity: number }[] = [];
  let remaining = quantity;
  let hasExpired = false;

  for (const lot of sorted) {
    if (remaining <= 0) break;

    const isExpired = lot.expiration_date
      ? new Date(lot.expiration_date) < new Date()
      : false;

    if (isExpired) {
      hasExpired = true;
      continue; // Skip expired by default
    }

    const pickQty = Math.min(remaining, lot.quantity_on_hand);
    picks.push({ lot, pickQuantity: pickQty });
    remaining -= pickQty;
  }

  return {
    picks,
    hasExpired,
    fulfilled: remaining <= 0,
  };
}
