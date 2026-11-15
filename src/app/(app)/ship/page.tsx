'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Truck, Plus, Trash2, AlertTriangle, Check } from 'lucide-react';
import { pickLotsForQuantity } from '@/lib/fefo';
import { formatDate } from '@/lib/format';
import { ExpiryBadge } from '@/components/ui/expiry-badge';
import { InvoiceButton } from './invoice-button';
import type { Customer, Product, Lot, SalesOrder } from '@/types/database';

interface OrderLine {
  product_id: string;
  quantity: number;
  unit_price: number;
}

interface PickSuggestion {
  product: Product;
  picks: { lot: Lot; pickQuantity: number }[];
  hasExpired: boolean;
  fulfilled: boolean;
  requestedQty: number;
}

export default function ShipPage() {
  const { user, tenantId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [existingOrders, setExistingOrders] = useState<{ id: string; order_number: string; customer_id: string; lines: { product_id: string; quantity_ordered: number; quantity_shipped: number; unit_price: number }[] }[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [shipDate, setShipDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');

  const [pickSuggestions, setPickSuggestions] = useState<PickSuggestion[]>([]);
  const [showPicking, setShowPicking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [recentOrders, setRecentOrders] = useState<(SalesOrder & { customer?: Customer })[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();

    supabase.from('customers').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name')
      .then(({ data }) => setCustomers(data || []));

    supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name')
      .then(({ data }) => setProducts(data || []));

    supabase.from('sales_orders').select('id,order_number,customer_id,lines:sales_order_lines(product_id,quantity_ordered,quantity_shipped,unit_price)').eq('tenant_id', tenantId).in('status', ['confirmed', 'picking']).order('created_at').then(({ data }) => setExistingOrders(data || []));
    loadRecentOrders();
  }, [tenantId]);

  async function loadRecentOrders() {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('sales_orders')
      .select('*, customer:customers(id, name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'shipped')
      .order('created_at', { ascending: false })
      .limit(20);
    setRecentOrders((data as (SalesOrder & { customer?: Customer })[]) || []);
  }

  function addLine() {
    setLines([...lines, { product_id: '', quantity: 1, unit_price: 0 }]);
  }

  function updateLine(index: number, field: keyof OrderLine, value: string | number) {
    const updated = [...lines];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    if (field === 'product_id') {
      const prod = products.find((p) => p.id === value);
      if (prod) updated[index].unit_price = prod.price;
    }
    setLines(updated);
  }

  function removeLine(index: number) {
    setLines(lines.filter((_, i) => i !== index));
  }

  async function handlePrepareShipment() {
    if (!customerId) { toast.error('Select a customer'); return; }
    if (lines.length === 0) { toast.error('Add at least one line item'); return; }
    if (lines.some((l) => !l.product_id || l.quantity <= 0)) {
      toast.error('All lines must have a product and positive quantity');
      return;
    }

    const supabase = createClient();
    const suggestions: PickSuggestion[] = [];

    for (const line of lines) {
      const product = products.find((p) => p.id === line.product_id)!;

      const { data: lots } = await supabase
        .from('lots')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('product_id', line.product_id)
        .eq('status', 'active')
        .gt('quantity_on_hand', 0)
        .order('expiration_date', { ascending: true, nullsFirst: false });

      const result = pickLotsForQuantity(lots || [], line.quantity);
      suggestions.push({
        product,
        picks: result.picks,
        hasExpired: result.hasExpired,
        fulfilled: result.fulfilled,
        requestedQty: line.quantity,
      });
    }

    setPickSuggestions(suggestions);
    setShowPicking(true);
  }

  async function handleConfirmShipment() {
    if (!tenantId || !user) return;
    setProcessing(true);
    const supabase = createClient();

    const { data: posted, error } = await supabase.rpc('ship_inventory', {
      p_request_id: requestId,
      p_shipment: { order_id: selectedOrderId || null, customer_id: customerId, ship_date: shipDate, notes, tracking_number: trackingNumber, lines },
    });
    if (error) { toast.error(error.message); setProcessing(false); return; }
    const orderNum = posted.order_number;
    setRequestId(crypto.randomUUID());

    toast.success(`Shipment ${orderNum} created successfully`);
    setShowPicking(false);
    setLines([]);
    setCustomerId('');
    setSelectedOrderId('');
    setExistingOrders(previous => previous.filter(order => order.id !== selectedOrderId));
    setNotes('');
    setTrackingNumber('');
    setPickSuggestions([]);
    setProcessing(false);
    loadRecentOrders();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ship Order"
        description="Create shipments with FEFO picking logic"
      />

      <div className="space-y-2">
        <Label htmlFor="existing-order">Fulfill an existing order</Label>
        <select id="existing-order" className="w-full rounded border p-2" value={selectedOrderId} onChange={event => {
          const id = event.target.value; setSelectedOrderId(id);
          const order = existingOrders.find(candidate => candidate.id === id);
          setCustomerId(order?.customer_id || '');
          setLines(order ? order.lines.filter(line => line.quantity_ordered > line.quantity_shipped).map(line => ({ product_id: line.product_id, quantity: line.quantity_ordered - line.quantity_shipped, unit_price: line.unit_price })) : []);
          setShowPicking(false);
        }}><option value="">Create a new manual shipment</option>{existingOrders.map(order => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select>
        {selectedOrderId && <p className="text-sm text-muted-foreground">Existing order quantities and prices are verified by the server when shipping.</p>}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> New Shipment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ship Date</Label>
              <Input type="date" value={shipDate} onChange={(e) => setShipDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tracking Number</Label>
              <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {lines.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-28">Quantity</TableHead>
                    <TableHead className="w-32">Unit Price</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Select value={line.product_id} onValueChange={(v) => updateLine(i, 'product_id', v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(i, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.unit_price}
                          onChange={(e) => updateLine(i, 'unit_price', parseFloat(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => removeLine(i)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handlePrepareShipment} disabled={lines.length === 0}>
              Prepare Shipment (FEFO Pick)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Shipments */}
      {recentOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Shipments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Ship Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24">Documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono">{order.order_number}</TableCell>
                    <TableCell>{order.customer?.name || '—'}</TableCell>
                    <TableCell>{formatDate(order.ship_date)}</TableCell>
                    <TableCell>
                      <Badge variant="default">Shipped</Badge>
                    </TableCell>
                    <TableCell>
                      <InvoiceButton orderId={order.id} tenantId={order.tenant_id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* FEFO Picking Dialog */}
      <Dialog open={showPicking} onOpenChange={setShowPicking}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>FEFO Pick Suggestions</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {pickSuggestions.map((suggestion, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">
                      {suggestion.product.name} ({suggestion.product.sku})
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Need: {suggestion.requestedQty}
                      </span>
                      {suggestion.fulfilled ? (
                        <Badge variant="default"><Check className="h-3 w-3 mr-1" /> Fulfilled</Badge>
                      ) : (
                        <Badge variant="destructive">Insufficient Stock</Badge>
                      )}
                    </div>
                  </div>

                  {suggestion.hasExpired && (
                    <div className="flex items-center gap-2 text-amber-600 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      Some lots are expired and were skipped
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lot #</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Pick Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestion.picks.map((pick, j) => (
                        <TableRow key={j}>
                          <TableCell className="font-mono">{pick.lot.lot_number}</TableCell>
                          <TableCell>{pick.lot.location || '—'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {formatDate(pick.lot.expiration_date)}
                              <ExpiryBadge date={pick.lot.expiration_date} />
                            </div>
                          </TableCell>
                          <TableCell>{pick.lot.quantity_on_hand}</TableCell>
                          <TableCell className="font-bold">{pick.pickQuantity}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowPicking(false)}>Cancel</Button>
            <Button
              onClick={handleConfirmShipment}
              disabled={processing || pickSuggestions.some((s) => !s.fulfilled)}
            >
              {processing ? 'Processing...' : 'Confirm & Ship'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
