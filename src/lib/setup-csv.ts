import Papa from 'papaparse';

export type SetupImportKind = 'products' | 'opening';
export type SetupRow = {
  sku: string;
  name?: string;
  lot_tracked?: boolean;
  bin?: string;
  quantity?: number;
  lot?: string;
  expiration?: string;
};

export function parseSetupCsv(text: string, kind: SetupImportKind) {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true, skipEmptyLines: 'greedy', transformHeader: heading => heading.trim().toLowerCase(),
  });
  const errors = parsed.errors.map(error => `Row ${(error.row ?? 0) + 2}: ${error.message}`);
  const mandatory = kind === 'products' ? ['sku', 'name'] : ['sku', 'bin', 'quantity'];
  if (mandatory.some(field => !parsed.meta.fields?.includes(field))) {
    errors.push(`Required columns: ${mandatory.join(', ')}.`);
  }
  if (parsed.data.length < 1 || parsed.data.length > 250) errors.push('Import 1–250 rows at a time.');
  const seen = new Set<string>();
  const rows = parsed.data.slice(0, 250).map((raw, index): SetupRow => {
    const values = Object.fromEntries(Object.entries(raw).filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value.trim()]));
    const row = index + 2;
    const sku = values.sku ?? '';
    if (!sku || sku.length > 100) errors.push(`Row ${row}: enter a SKU of up to 100 characters.`);
    const key = JSON.stringify([sku, kind === 'opening' ? values.lot || 'OPENING' : '']);
    if (seen.has(key)) errors.push(`Row ${row}: duplicate ${kind === 'opening' ? 'SKU and lot' : 'SKU'}.`);
    seen.add(key);
    if (kind === 'products') {
      if (!values.name || values.name.length > 200) errors.push(`Row ${row}: enter a product name of up to 200 characters.`);
      if (values.lot_tracked && !['true', 'false'].includes(values.lot_tracked.toLowerCase())) {
        errors.push(`Row ${row}: lot_tracked must be true or false.`);
      }
      return { sku, name: values.name ?? '', lot_tracked: values.lot_tracked?.toLowerCase() === 'true' };
    }
    const quantity = Number(values.quantity);
    if (!values.bin) errors.push(`Row ${row}: enter a bin code.`);
    if (!/^\d+$/.test(values.quantity ?? '') || quantity <= 0 || quantity > 2147483647) {
      errors.push(`Row ${row}: enter a positive whole quantity.`);
    }
    const expiration = values.expiration;
    if (expiration) {
      const date = new Date(expiration);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== expiration)
        errors.push(`Row ${row}: use a valid expiration date in YYYY-MM-DD format.`);
    }
    return { sku, bin: values.bin ?? '', quantity, lot: values.lot || '', expiration: expiration || '' };
  });
  return { rows, errors };
}
