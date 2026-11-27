'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, Search, Download, ShieldAlert } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';

interface RecallResult {
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  ship_to_address: string | null;
  quantity: number;
  shipped_at: string;
  shipment_id: string;
  order_number: string;
}

interface LotInfo {
  id: string;
  lot_number: string;
  product_name: string;
  product_sku: string;
  quantity_on_hand: number;
  status: string;
  expiration_date: string | null;
  supplier_name: string | null;
}

export default function RecallPage() {
  const { user, tenantId } = useAuth();
  const [lotNumber, setLotNumber] = useState('');
  const [sku, setSku] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [error, setError] = useState('');
  const [receipts, setReceipts] = useState<{ id: string; reference_number: string | null; created_at: string; quantity: number }[]>([]);
  const [results, setResults] = useState<RecallResult[]>([]);
  const [lotInfo, setLotInfo] = useState<LotInfo | null>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  async function handleSearch() {
    if (!lotNumber.trim() || !tenantId) return;
    setSearching(true);
    setSearched(true);
    setError(''); setLotInfo(null); setResults([]); setReceipts([]);
    const supabase = createClient();

    let lookup = supabase.from('lots')
      .select('*, product:products!inner(name, sku), supplier:suppliers(name)')
      .eq('tenant_id', tenantId).eq('lot_number', lotNumber.trim());
    if (sku.trim()) lookup = lookup.eq('product.sku', sku.trim());
    if (warehouse.trim()) lookup = lookup.eq('location', warehouse.trim());
    const { data: lots, error: lookupError } = await lookup.limit(2);
    if (lookupError || !lots?.length || lots.length > 1) {
      if (lookupError) setError('Unable to load this lot. Try again.');
      else if (lots && lots.length > 1) setError('Multiple lots match. Enter the exact SKU and warehouse name to narrow your search.');
      setSearching(false);
      return;
    }

    const lot = lots[0];
    const product = lot.product as unknown as { name: string; sku: string };
    setLotInfo({
      id: lot.id,
      lot_number: lot.lot_number,
      product_name: product?.name || '',
      product_sku: product?.sku || '',
      quantity_on_hand: lot.quantity_on_hand,
      status: lot.status,
      expiration_date: lot.expiration_date,
      supplier_name: (lot.supplier as {name: string} | null)?.name ?? null,
    });

    const [outbound, inbound] = await Promise.all([
      supabase.from('shipment_lines').select(`
        quantity,
        shipment:shipments(id,shipped_at,order:sales_orders(order_number),customer:customers(name,email,phone,ship_to_address))
      `).eq('tenant_id', tenantId).eq('lot_id', lot.id).order('id').limit(1000),
      supabase.from('stock_movements').select('id,reference_number,created_at,quantity')
        .eq('tenant_id', tenantId).eq('lot_id', lot.id).eq('movement_type','receive').order('created_at').limit(1000),
    ]);
    if (outbound.error || inbound.error) {
      setError('The complete trace could not be loaded. Try again before relying on these results.');
      setLotInfo(null);
      setSearching(false);
      return;
    }
    if (outbound.data.length === 1000 || inbound.data.length === 1000) setError('This lot has at least 1,000 receipt or shipment records. The results shown may be incomplete.');
    setReceipts(inbound.data);
    const shipmentLines = outbound.data;

    const recallResults: RecallResult[] = (shipmentLines || []).map((sl) => {
      const shipment = sl.shipment as unknown as {
        id: string;
        shipped_at: string;
        order: { order_number: string };
        customer: { name: string; email: string | null; phone: string | null; ship_to_address: string | null };
      };
      return {
        customer_name: shipment?.customer?.name || '—',
        customer_email: shipment?.customer?.email,
        customer_phone: shipment?.customer?.phone,
        ship_to_address: shipment?.customer?.ship_to_address,
        quantity: sl.quantity,
        shipped_at: shipment?.shipped_at || '',
        shipment_id: shipment?.id || '',
        order_number: shipment?.order?.order_number || '',
      };
    });

    setResults(recallResults);
    setSearching(false);
  }

  function handleExport() {
    if (results.length === 0) return;
    exportToCSV(
      results.map((r) => ({
        lot_number: lotNumber,
        product: lotInfo?.product_name || '',
        sku: lotInfo?.product_sku || '',
        customer: r.customer_name,
        email: r.customer_email || '',
        phone: r.customer_phone || '',
        address: r.ship_to_address || '',
        quantity_shipped: r.quantity,
        ship_date: formatDateTime(r.shipped_at),
        order_number: r.order_number,
      })),
      `recall_${lotNumber}`
    );
  }

  async function handleMarkRecalled() {
    if (!lotInfo || !tenantId || !user) return;
    const supabase = createClient();

    await supabase.from('lots').update({ status: 'recalled' }).eq('id', lotInfo.id);

    if (lotInfo.quantity_on_hand > 0) {
      const lot = await supabase.from('lots').select('product_id').eq('id', lotInfo.id).single();
      if (lot.data) {
        await supabase.from('stock_movements').insert({
          tenant_id: tenantId,
          product_id: lot.data.product_id,
          lot_id: lotInfo.id,
          user_id: user.id,
          quantity: -lotInfo.quantity_on_hand,
          movement_type: 'recall',
          reason: 'Lot recalled - quarantined',
          reference_number: lotInfo.lot_number,
        });
      }
    }

    setLotInfo({ ...lotInfo, status: 'recalled', quantity_on_hand: 0 });
    toast.success('Lot marked as recalled');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recall Lookup"
        description="Review supplier receipts and customer shipments for a specific lot"
      />

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 max-w-md space-y-2">
              <Label>Lot Number</Label>
              <Input
                value={lotNumber}
                onChange={(e) => setLotNumber(e.target.value)}
                placeholder="Enter lot number to search..."
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <label className="block text-sm">Exact SKU (optional)
              <Input value={sku} onChange={event => setSku(event.target.value)} />
            </label>
            <label className="block text-sm">Warehouse name (optional)
              <Input value={warehouse} onChange={event => setWarehouse(event.target.value)} />
            </label>
            <Button onClick={handleSearch} disabled={searching}>
              <Search className="h-4 w-4 mr-2" /> {searching ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <p role="alert" className="text-destructive">{error}</p>}
      {searched && lotInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Lot Information
              </div>
              <Badge variant={lotInfo.status === 'recalled' ? 'destructive' : 'outline'}>
                {lotInfo.status.toUpperCase()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground">Product:</span> {lotInfo.product_name}</div>
              <div><span className="text-muted-foreground">SKU:</span> {lotInfo.product_sku}</div>
              <div><span className="text-muted-foreground">Lot #:</span> {lotInfo.lot_number}</div>
              <div><span className="text-muted-foreground">Supplier:</span> {lotInfo.supplier_name ?? "—"}</div>
              <div><span className="text-muted-foreground">Remaining Qty:</span> {lotInfo.quantity_on_hand}</div>
              <div><span className="text-muted-foreground">Expiration:</span> {formatDate(lotInfo.expiration_date)}</div>
            </div>

            {lotInfo.status !== 'recalled' && (
              <div className="mt-4">
                <Button variant="destructive" onClick={handleMarkRecalled}>
                  <ShieldAlert className="h-4 w-4 mr-2" /> Mark Lot as Recalled
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {lotInfo && <Card>
        <CardHeader><CardTitle>Inbound receipts</CardTitle></CardHeader>
        <CardContent>
          {receipts.length ? <ul className="space-y-2 text-sm">{receipts.map(receipt =>
            <li key={receipt.id}>{receipt.reference_number || 'Warehouse receipt'} · {formatDateTime(receipt.created_at)} · {receipt.quantity} units</li>)}</ul>
            : <p className="text-sm text-muted-foreground">No receipt movement is linked to this lot.</p>}
        </CardContent>
      </Card>}

      {searched && results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Affected Customers ({results.length})
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" /> Export Recall List
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Qty Shipped</TableHead>
                  <TableHead>Ship Date</TableHead>
                  <TableHead>Order #</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.customer_name}</TableCell>
                    <TableCell>{r.customer_email || '—'}</TableCell>
                    <TableCell>{r.customer_phone || '—'}</TableCell>
                    <TableCell>{r.quantity}</TableCell>
                    <TableCell>{formatDateTime(r.shipped_at)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.order_number}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {searched && !lotInfo && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No lot found with number &ldquo;{lotNumber}&rdquo;
          </CardContent>
        </Card>
      )}

      {searched && lotInfo && results.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No shipments found for this lot. No customers were affected.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
