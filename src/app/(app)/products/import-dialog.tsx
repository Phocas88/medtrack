'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, Check, AlertCircle, Download } from 'lucide-react';
import Papa from 'papaparse';

interface ImportRow {
  name: string;
  sku: string;
  category?: string;
  cost?: string;
  price?: string;
  unit_of_measure?: string;
  low_stock_threshold?: string;
  reorder_point?: string;
  aisle?: string;
  section?: string;
  supplier?: string;
  valid: boolean;
  error?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportDialog({ open, onOpenChange, onImported }: Props) {
  const { tenantId } = useAuth();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed: ImportRow[] = (result.data as any[]).map((row: Record<string, string>) => {
          const name = (row.name || row.Name || row.product_name || row['Product Name'] || '').trim();
          const sku = (row.sku || row.SKU || row.item_number || row['Item Number'] || '').trim();

          let valid = true;
          let error = '';
          if (!name) { valid = false; error = 'Missing name'; }
          if (!sku) { valid = false; error = error ? error + ', missing SKU' : 'Missing SKU'; }

          return {
            name,
            sku,
            category: (row.category || row.Category || '').trim() || undefined,
            cost: (row.cost || row.Cost || row.unit_cost || '').trim() || undefined,
            price: (row.price || row.Price || row.unit_price || '').trim() || undefined,
            unit_of_measure: (row.unit_of_measure || row.uom || row.UOM || row.Unit || '').trim() || undefined,
            low_stock_threshold: (row.low_stock_threshold || row.min_qty || row['Min Qty'] || '').trim() || undefined,
            reorder_point: (row.reorder_point || row['Reorder Point'] || '').trim() || undefined,
            aisle: (row.aisle || row.Aisle || '').trim() || undefined,
            section: (row.section || row.Section || '').trim() || undefined,
            supplier: (row.supplier || row.Supplier || row.vendor || row.Vendor || '').trim() || undefined,
            valid,
            error,
          };
        });

        setRows(parsed);
        setDone(false);
        setImportedCount(0);
      },
    });
  };

  const handleImport = async () => {
    if (!tenantId) return;
    const validRows = rows.filter((r) => r.valid);
    if (validRows.length === 0) { toast.error('No valid rows to import'); return; }

    setImporting(true);
    const supabase = createClient();

    // Get existing suppliers for matching
    const { data: suppliers } = await supabase.from('suppliers').select('id, name').eq('tenant_id', tenantId);
    const supplierMap = new Map((suppliers || []).map((s) => [s.name.toLowerCase(), s.id]));

    let imported = 0;
    let skipped = 0;

    for (const row of validRows) {
      // Check if SKU already exists
      const { data: existing } = await supabase
        .from('products').select('id').eq('tenant_id', tenantId).eq('sku', row.sku).limit(1);

      if (existing && existing.length > 0) { skipped++; continue; }

      // Match supplier by name
      let supplierId: string | null = null;
      if (row.supplier) {
        supplierId = supplierMap.get(row.supplier.toLowerCase()) || null;
      }

      const { error } = await supabase.from('products').insert({
        tenant_id: tenantId,
        name: row.name,
        sku: row.sku,
        category: row.category || null,
        cost: parseFloat(row.cost || '0') || 0,
        price: parseFloat(row.price || '0') || 0,
        unit_of_measure: row.unit_of_measure || 'each',
        low_stock_threshold: parseInt(row.low_stock_threshold || '10') || 10,
        reorder_point: row.reorder_point ? parseInt(row.reorder_point) : null,
        aisle: row.aisle || null,
        section: row.section || null,
        supplier_id: supplierId,
        storage_requirement: 'room_temp',
        is_lot_tracked: false,
        is_serial_tracked: false,
        expiry_alert_days: 60,
        lead_time_days: 7,
      });

      if (!error) imported++;
    }

    setImporting(false);
    setDone(true);
    setImportedCount(imported);
    toast.success(`Imported ${imported} products${skipped > 0 ? `, ${skipped} skipped (duplicate SKU)` : ''}`);
    onImported();
  };

  const downloadTemplate = () => {
    const csv = Papa.unparse([
      { name: 'Example Product', sku: 'EX-001', category: 'General', cost: '5.00', price: '9.99', unit_of_measure: 'each', low_stock_threshold: '10', reorder_point: '15', aisle: '1', section: 'A', supplier: 'Acme Supply' },
    ]);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'stokora_product_import_template.csv';
    a.click();
  };

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setRows([]); setDone(false); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Products from CSV</DialogTitle>
        </DialogHeader>

        {rows.length === 0 && !done ? (
          <div className="space-y-4 py-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">Drop a CSV file or click to browse</p>
              <p className="text-sm text-muted-foreground mt-1">
                Columns: name, sku, category, cost, price, unit_of_measure, low_stock_threshold, aisle, section, supplier
              </p>
            </div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />

            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" /> Download Template CSV
            </Button>
          </div>
        ) : done ? (
          <div className="text-center py-8">
            <Check className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-semibold">Import Complete</p>
            <p className="text-muted-foreground mt-1">{importedCount} products added to your catalog</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Badge variant="default" className="bg-green-100 text-green-700">{validCount} valid</Badge>
              {invalidCount > 0 && <Badge variant="destructive">{invalidCount} invalid</Badge>}
              <span className="text-sm text-muted-foreground">{rows.length} total rows</span>
            </div>

            <div className="max-h-72 overflow-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>UOM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((row, i) => (
                    <TableRow key={i} className={!row.valid ? 'bg-red-50' : ''}>
                      <TableCell>
                        {row.valid ? <Check className="h-3 w-3 text-green-500" /> : <AlertCircle className="h-3 w-3 text-red-500" />}
                      </TableCell>
                      <TableCell className="text-sm">{row.name || <span className="text-red-500 italic">missing</span>}</TableCell>
                      <TableCell className="text-sm font-mono">{row.sku || <span className="text-red-500 italic">missing</span>}</TableCell>
                      <TableCell className="text-sm">{row.category || '—'}</TableCell>
                      <TableCell className="text-sm">{row.cost || '—'}</TableCell>
                      <TableCell className="text-sm">{row.price || '—'}</TableCell>
                      <TableCell className="text-sm">{row.unit_of_measure || 'each'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 50 && <p className="text-xs text-muted-foreground text-center py-2">Showing first 50 of {rows.length} rows</p>}
            </div>
          </div>
        )}

        <DialogFooter>
          {rows.length > 0 && !done && (
            <>
              <Button variant="outline" onClick={() => { setRows([]); }}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Choose Different File
              </Button>
              <Button onClick={handleImport} disabled={importing || validCount === 0}>
                {importing ? 'Importing...' : `Import ${validCount} Products`}
              </Button>
            </>
          )}
          {done && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
