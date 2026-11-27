import { describe, expect, it } from 'vitest';
import { parseSetupCsv } from '../../src/lib/setup-csv';

describe('self-serve CSV preview', () => {
  it('flags duplicate SKUs before saving products', () => {
    const result = parseSetupCsv('sku,name\nSKU-1,Box\nSKU-1,Tape', 'products');
    expect(result.errors).toContain('Row 3: duplicate SKU.');
  });

  it('maps imported column names and rejects reuse of a source column', () => {
    const csv = 'Item Code,Description\nA-1,Shipping box';
    expect(parseSetupCsv(csv, 'products', { sku: 'item code', name: 'description' })).toEqual({
      rows: [{ sku: 'A-1', name: 'Shipping box', lot_tracked: false }], errors: [],
    });
    expect(parseSetupCsv(csv, 'products', { sku: 'item code', name: 'item code' }).errors)
      .toContain('Use each CSV column for only one field.');
  });

  it('rejects invalid dates, non-integral quantities, and duplicate opening lots', () => {
    const result = parseSetupCsv('sku,bin,quantity,lot,expiration\nA,STARTER,3.5,B1,2026-02-30\nA,OTHER,3,B1,', 'opening');
    expect(result.errors).toEqual([
      'Row 2: enter a positive whole quantity.',
      'Row 2: use a valid expiration date in YYYY-MM-DD format.',
      'Row 3: duplicate SKU and lot.',
    ]);
  });
});
