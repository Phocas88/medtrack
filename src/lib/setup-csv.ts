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

export const setupColumns = {
  products: { required: ['sku', 'name'], optional: ['lot_tracked'] },
  opening: { required: ['sku', 'bin', 'quantity'], optional: ['lot', 'expiration'] },
};

const normalizeHeading = (heading: string) => heading.trim().toLowerCase();

export function setupCsvHeaders(text: string) {
  return Papa.parse<string[]>(text, { preview: 1, skipEmptyLines: 'greedy' })
    .data[0]?.map(normalizeHeading) ?? [];
}

export function parseSetupCsv(text: string, kind: SetupImportKind, mapping: Record<string, string> = {}) {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true, skipEmptyLines: 'greedy', transformHeader: normalizeHeading,
  });
  const errors = parsed.errors.map(error => `Row ${(error.row ?? 0) + 2}: ${error.message}`);
  const { required, optional } = setupColumns[kind];
  const columns = [...required, ...optional].map(field => [field, mapping[field] ?? field] as const);
  const headers = setupCsvHeaders(text);
  if (headers.some((header, index) => header && headers.indexOf(header) !== index)) {
    errors.push('Rename duplicate column headings before importing.');
  }
  for (const field of required) {
    const source = mapping[field] ?? field;
    if (!source || !headers.includes(source)) errors.push(`Map a CSV column to ${field}.`);
  }
  const selected = columns.map(([, source]) => source).filter(source => source && headers.includes(source));
  if (new Set(selected).size !== selected.length) errors.push('Use each CSV column for only one field.');
  if (parsed.data.length < 1 || parsed.data.length > 250) errors.push('Import 1–250 rows at a time.');
  const seen = new Set<string>();
  const rows = parsed.data.slice(0, 250).map((raw, index): SetupRow => {
    const values = Object.fromEntries(columns.map(([field, source]) => {
      const value = source ? raw[source] : undefined;
      return [field, typeof value === 'string' ? value.trim() : undefined];
    }));
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
