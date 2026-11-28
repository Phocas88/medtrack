import type { Lot, StockRotation } from '@/types/database';

/**
 * Sort lots by FEFO (First Expired, First Out) logic:
 * 1. Nearest expiration date first
 * 2. Oldest received date as tiebreaker
 * 3. Lots without expiration dates go last
 */
export function sortByFEFO(lots: Lot[]): Lot[] {
  return sortLots(lots, 'FEFO');
}

export function sortLots(lots: Lot[], rotation: StockRotation): Lot[] {
  return [...lots].sort((a, b) => {
    if (rotation === 'FEFO') {
      const expiryOrder = (a.expiration_date ?? '9999-12-31').localeCompare(b.expiration_date ?? '9999-12-31');
      if (expiryOrder) return expiryOrder;
    }
    const receivedOrder = a.received_date.localeCompare(b.received_date);
    return (rotation === 'LIFO' ? -receivedOrder : receivedOrder) || a.id.localeCompare(b.id);
  });
}

/**
 * Pick lots for a given quantity using FEFO.
 * Returns the lots to pick from with quantities, and whether any are expired.
 */
export function pickLotsForQuantity(
  lots: Lot[],
  quantity: number,
  rotation: StockRotation = 'FEFO',
): { picks: { lot: Lot; pickQuantity: number }[]; hasExpired: boolean; fulfilled: boolean } {
  const activeLots = lots.filter(
    (l) => l.status === 'active' && l.quantity_on_hand > 0
  );
  const sorted = sortLots(activeLots, rotation);

  const picks: { lot: Lot; pickQuantity: number }[] = [];
  let remaining = quantity;
  let hasExpired = false;

  const today = new Date().toISOString().slice(0, 10);
  for (const lot of sorted) {
    if (remaining <= 0) break;

    const isExpired = lot.expiration_date
      ? lot.expiration_date < today
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
