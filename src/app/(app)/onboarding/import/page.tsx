'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { buildLotLabelContent, printLotLabel } from '@/lib/barcode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { parseSetupCsv, setupColumns, setupCsvHeaders, type SetupImportKind } from '@/lib/setup-csv';
import { createClient } from '@/lib/supabase/client';

const testLabel = {
  productName: 'Invexiqs printer test', sku: 'TEST-SKU', lotNumber: 'TEST-LOT',
  location: 'TEST-BIN', expirationDate: null,
};

const templates = {
  sales_orders: 'order_number,party,sku,quantity,unit_amount\nSO-102,Sample Buyer,BOX-100,5,7.50\n',
  purchase_orders: 'order_number,party,sku,quantity,unit_amount\nPO-102,Sample Supplier,BOX-100,20,3.25\n',
  customers: 'name,contact_name,email,phone,address\nSample Buyer,Jane Doe,jane@example.test,,\n',
  suppliers: 'name,contact_name,email,phone,address\nSample Supplier,Alex Doe,alex@example.test,,\n',
  products: 'sku,name,lot_tracked\nBOX-100,Shipping box,false\n',
  opening: 'sku,bin,quantity,lot,expiration\nBOX-100,STARTER,25,,\n',
};

export default function SetupImportPage() {
  const { tenantId, role, loading } = useAuth();
  if (loading) return <p role="status">Loading import…</p>;
  if (!tenantId || (role !== 'admin' && role !== 'manager')) return <p>Warehouse manager access is required.</p>;
  return <SetupImport key={tenantId} tenantId={tenantId} />;
}

function SetupImport({ tenantId }: { tenantId: string }) {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerResult, setScannerResult] = useState('');
  const [printError, setPrintError] = useState('');
  const [kind, setKind] = useState<SetupImportKind>('products');
  const orderImport = kind === 'sales_orders' || kind === 'purchase_orders';
  const [csv, setCsv] = useState('');
  const [mappings, setMappings] = useState<Partial<Record<SetupImportKind, Record<string, string>>>>({});
  const [preview, setPreview] = useState<ReturnType<typeof parseSetupCsv>>();
  const [warehouses, setWarehouses] = useState<{id: string; name: string}[]>([]);
  const [warehouse, setWarehouse] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imported, setImported] = useState<number>();
  const request = useRef<string | undefined>(undefined);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`invexiqs:setup-mappings:${tenantId}`);
      if (saved) setMappings(JSON.parse(saved));
    } catch { /* Keep import available when browser storage is disabled. */ }
  }, [tenantId]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('kind') === 'opening') setKind('opening');
    const controller = new AbortController();
    void createClient().from('locations').select('id,name').eq('tenant_id', tenantId).eq('is_active', true)
      .order('name').abortSignal(controller.signal).then(({ data, error }) => {
        if (controller.signal.aborted) return;
        if (error) setError(error.message);
        else { setWarehouses(data ?? []); setWarehouse(data?.[0]?.id ?? ''); }
      });
    return () => controller.abort();
  }, [tenantId]);

  function updateCsv(value: string) {
    setCsv(value); setPreview(undefined); setImported(undefined); setError('');
    request.current = undefined;
  }

  const headers = [...new Set(setupCsvHeaders(csv).filter(Boolean))];
  const columns = [...setupColumns[kind].required, ...setupColumns[kind].optional];
  const effectiveMapping = Object.fromEntries(columns.map(field => {
    const saved = mappings[kind]?.[field];
    return [field, saved === '' || (saved && headers.includes(saved)) ? saved : field];
  }));

  async function review() {
    setBusy(true);
    setError('');
    try {
      const result = parseSetupCsv(csv, kind, effectiveMapping);
      if (!result.errors.length && kind === 'products') {
        const { data, error: failure } = await createClient().from('products').select('sku')
          .eq('tenant_id', tenantId).in('sku', result.rows.map(row => row.sku));
        if (failure) throw failure;
        const existing = new Set((data ?? []).map(row => row.sku));
        result.rows.forEach((row, index) => {
          if (existing.has(row.sku)) result.errors.push(`Row ${index + 2}: SKU ${row.sku} already exists.`);
        });
      }
      setPreview(result);
      request.current ??= crypto.randomUUID();
    } catch { setError('Could not check the CSV against your product catalog. Try again.'); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!preview?.rows.length || preview.errors.length || !request.current || busy) return;
    setBusy(true);
    setError('');
    try {
      const db = createClient();
      const { data, error: failure } = orderImport
        ? await db.rpc('import_cutover_order_drafts', { p_request: request.current, p_rows: preview.rows, p_kind: kind })
        : kind === 'customers' || kind === 'suppliers'
        ? await db.rpc('import_setup_contacts', { p_request: request.current, p_rows: preview.rows, p_kind: kind })
        : await db.rpc('import_setup_inventory', {
        p_request: request.current, p_location: kind === 'opening' ? warehouse : null,
        p_rows: preview.rows, p_kind: kind,
      });
      if (failure) { setError(failure.message); return; }
      setImported(data);
    } catch { setError('Could not confirm whether the import completed. Retry this preview before changing the CSV.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Import warehouse setup data" />
      <Link href="/dashboard" className="text-sm text-primary underline">Back to setup checklist</Link>
      <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="hardware-test">
        <h2 id="hardware-test" className="font-semibold">Check your scanner and label printer</h2>
        <p className="text-sm text-muted-foreground">Print the sample label on 4 × 2 inch stock, then scan it to verify the barcode. You can use a camera or a USB/Bluetooth scanner in manual-entry mode.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => {
            setPrintError(printLotLabel(testLabel) ? '' : 'Allow pop-ups to open the test label.');
          }}>Print test label</Button>
          <Button type="button" variant="outline" onClick={() => {
            setScannerResult(''); setScannerOpen(true);
          }}>Test scanner</Button>
        </div>
        {printError && <p role="alert" className="text-sm text-destructive">{printError}</p>}
        {scannerOpen && <BarcodeScanner onClose={() => setScannerOpen(false)} onScan={value => {
          if (value === buildLotLabelContent(testLabel)) {
            setScannerResult('Test label read successfully.');
            setScannerOpen(false);
          } else setScannerResult('Barcode read successfully. Scan the Invexiqs test label to verify the printer too.');
        }} />}
        {scannerResult && <p role="status" className="text-sm">{scannerResult}</p>}
      </section>
      <fieldset disabled={busy} className="space-y-4 rounded-lg border bg-card p-4">
        <label className="block text-sm">What are you importing?
          <select className="ml-2 rounded border bg-background p-2" value={kind} onChange={event => {
            setKind(event.target.value as SetupImportKind); updateCsv('');
          }}>
            <option value="products">Product catalog</option>
            <option value="opening">Opening balances</option>
            <option value="customers">Customers</option>
            <option value="suppliers">Suppliers</option>
            <option value="sales_orders">Open sales order drafts</option>
            <option value="purchase_orders">Open purchase order drafts</option>
          </select>
        </label>
        {kind === 'opening' && (
          <label className="block text-sm">Warehouse
            <select className="ml-2 rounded border bg-background p-2" value={warehouse} onChange={e => {
              setWarehouse(e.target.value); setImported(undefined); request.current = crypto.randomUUID();
            }}>
              <option value="">Select a warehouse</option>
              {warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        )}
        <p className="text-sm text-muted-foreground">{orderImport ? 'Import products and contacts first. Enter only remaining quantities. Each order imports as a draft for review, without posting stock or sending a document.' : kind === 'opening'
          ? 'Import your products first. Use an active bin code and one row per SKU and lot. Lot-tracked items need a lot number. For serialized items, use Receiving.'
          : kind === 'products' ? 'Use a unique SKU and a product name for each row. The optional lot_tracked column accepts true or false.' : 'Use a unique company name. Contact name, email, phone, and address are optional.'}</p>
        <a className="text-sm text-primary underline" download={`invexiqs-${kind}.csv`}
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(templates[kind])}`}>Download sample CSV</a>
        <label className="block text-sm">Upload CSV<Input key={kind} type="file" accept=".csv,text/csv" onChange={async e => {
          const file = e.target.files?.[0];
          if (file && file.size > 1024 * 1024) { updateCsv(''); setError('Choose a CSV smaller than 1 MB.'); return; }
          if (file) {
            try { updateCsv(await file.text()); }
            catch { updateCsv(''); setError('Could not read this CSV.'); }
          }
        }} /></label>
        <label className="block text-sm">CSV contents
          <textarea className="mt-1 min-h-36 w-full rounded border border-input bg-background p-2 font-mono text-sm"
            value={csv} maxLength={1048576} onChange={e => updateCsv(e.target.value)} />
        </label>
        {headers.length > 0 && (
          <fieldset className="grid gap-3 rounded border p-3 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Match CSV columns</legend>
            {columns.map(field => {
              const chosen = effectiveMapping[field];
              return <label key={field} className="text-sm">
                {field.replaceAll('_', ' ')}{setupColumns[kind].required.includes(field) ? ' (required)' : ''}
                <select className="mt-1 block w-full rounded border bg-background p-2"
                  value={headers.includes(chosen) ? chosen : ''} onChange={event => {
                    const next = { ...mappings, [kind]: { ...mappings[kind], [field]: event.target.value } };
                    setMappings(next);
                    updateCsv(csv);
                    try { localStorage.setItem(`invexiqs:setup-mappings:${tenantId}`, JSON.stringify(next)); }
                    catch { /* The current mapping still applies in this session. */ }
                  }}>
                  <option value="">Choose a column</option>
                  {headers.map(header => <option key={header} value={header}>{header}</option>)}
                </select>
              </label>;
            })}
          </fieldset>
        )}
        <Button type="button" variant="outline" disabled={!csv.trim()} onClick={() => void review()}>Preview CSV</Button>
        {preview && (
          <div className="space-y-2" aria-label="Import preview">
            <p className="text-sm">{preview.rows.length} rows in preview</p>
            <ul className="max-h-48 overflow-auto text-sm">{preview.rows.map((row, i) => (
              <li key={i} className="break-words">{row.order_number ? `${row.order_number} · ${row.party} · ${row.sku} · ${row.quantity} units at ${row.unit_amount}` : `${row.sku ? `${row.sku} · ` : ''}${row.name ?? `${row.quantity} in ${row.bin}`}`}{row.lot ? ` · Lot ${row.lot}` : ''}</li>
            ))}</ul>
            {!!preview.errors.length && <ul role="alert" className="max-h-48 overflow-auto text-sm text-destructive">
              {preview.errors.map((message, i) => <li key={i}>{message}</li>)}</ul>}
            <Button type="button" disabled={!!preview.errors.length || imported !== undefined || (kind === 'opening' && !warehouse)}
              onClick={() => void save()}>Import {preview.rows.length} rows</Button>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {imported !== undefined && <p role="status" className="text-sm">{imported} {orderImport ? 'draft orders created' : 'rows imported'}.</p>}
      </fieldset>
    </div>
  );
}
