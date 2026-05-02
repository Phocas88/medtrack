'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { ArrowRightLeft, PackageOpen, Truck, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type { PurchaseOrder, POLine, Product, SalesOrder, SalesOrderLine } from '@/types/database';

type POWithDetails = Omit<PurchaseOrder, 'supplier' | 'lines'> & {
  supplier?: { id: string; name: string };
  lines?: (POLine & { product?: Product })[];
};

type SOWithDetails = Omit<SalesOrder, 'customer' | 'lines'> & {
  customer?: { id: string; name: string };
  lines?: (SalesOrderLine & { product?: Product })[];
};

interface CrossDockMatch {
  po_id: string;
  po_number: string;
  po_line_id: string;
  product_id: string;
  product_name: string;
  sku: string;
  qty_expected: number;
  matching_orders: {
    order_id: string;
    order_number: string;
    customer_name: string;
    qty_needed: number;
  }[];
}

interface ActiveCrossDock {
  id: string;
  created_at: string;
  po_number: string;
  so_number: string;
  product_name: string;
  sku: string;
  quantity: number;
  status: 'received' | 'staged' | 'confirmed';
  reference: string;
}

interface CompletedCrossDock extends ActiveCrossDock {
  completed_at: string;
}

const CROSSDOCK_STORAGE_KEY = 'trackflow_crossdock';
const CROSSDOCK_HISTORY_KEY = 'trackflow_crossdock_history';

function getStored<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function store<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export default function CrossDockPage() {
  const { tenantId, user } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [pos, setPOs] = useState<POWithDetails[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [sos, setSOs] = useState<SOWithDetails[]>([]);
  const [matches, setMatches] = useState<CrossDockMatch[]>([]);
  const [activeDocks, setActiveDocks] = useState<ActiveCrossDock[]>([]);
  const [history, setHistory] = useState<CompletedCrossDock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<ActiveCrossDock | null>(null);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [poRes, soRes] = await Promise.all([
      supabase
        .from('purchase_orders')
        .select('*, supplier:suppliers(id, name), lines:purchase_order_lines(*, product:products(*))')
        .eq('tenant_id', tenantId)
        .in('status', ['approved', 'sent'])
        .order('expected_date', { ascending: true }),
      supabase
        .from('sales_orders')
        .select('*, customer:customers(id, name), lines:sales_order_lines(*, product:products(*))')
        .eq('tenant_id', tenantId)
        .in('status', ['confirmed', 'picking'])
        .order('created_at', { ascending: true }),
    ]);

    const poData = (poRes.data || []) as POWithDetails[];
    const soData = (soRes.data || []) as SOWithDetails[];
    setPOs(poData);
    setSOs(soData);

    // Build cross-dock matches: PO lines with matching SO lines
    const crossMatches: CrossDockMatch[] = [];
    for (const po of poData) {
      if (!po.lines) continue;
      for (const poLine of po.lines) {
        const remaining = poLine.quantity_ordered - poLine.quantity_received;
        if (remaining <= 0) continue;

        const matchingOrders: CrossDockMatch['matching_orders'] = [];
        for (const so of soData) {
          if (!so.lines) continue;
          for (const soLine of so.lines) {
            if (soLine.product_id === poLine.product_id) {
              const needed = soLine.quantity_ordered - soLine.quantity_shipped;
              if (needed > 0) {
                matchingOrders.push({
                  order_id: so.id,
                  order_number: so.order_number,
                  customer_name: so.customer?.name || 'Unknown',
                  qty_needed: needed,
                });
              }
            }
          }
        }

        if (matchingOrders.length > 0) {
          crossMatches.push({
            po_id: po.id,
            po_number: po.po_number,
            po_line_id: poLine.id,
            product_id: poLine.product_id,
            product_name: poLine.product?.name || 'Unknown',
            sku: poLine.product?.sku || '',
            qty_expected: remaining,
            matching_orders: matchingOrders,
          });
        }
      }
    }
    setMatches(crossMatches);

    setActiveDocks(getStored<ActiveCrossDock>(CROSSDOCK_STORAGE_KEY));
    setHistory(getStored<CompletedCrossDock>(CROSSDOCK_HISTORY_KEY));
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  const markForCrossDock = (match: CrossDockMatch, order: CrossDockMatch['matching_orders'][0]) => {
    const qty = Math.min(match.qty_expected, order.qty_needed);
    const item: ActiveCrossDock = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      po_number: match.po_number,
      so_number: order.order_number,
      product_name: match.product_name,
      sku: match.sku,
      quantity: qty,
      status: 'received',
      reference: `Cross-dock ${match.po_number} → ${order.order_number}`,
    };

    const updated = [...activeDocks, item];
    store(CROSSDOCK_STORAGE_KEY, updated);
    setActiveDocks(updated);
    toast.success(`Cross-dock created: ${qty}x ${match.product_name}`);
  };

  const advanceStatus = (item: ActiveCrossDock) => {
    if (item.status === 'received') {
      const updated = activeDocks.map(d =>
        d.id === item.id ? { ...d, status: 'staged' as const } : d
      );
      store(CROSSDOCK_STORAGE_KEY, updated);
      setActiveDocks(updated);
      toast.success('Item staged for outbound');
    } else if (item.status === 'staged') {
      setConfirmDialog(item);
    }
  };

  const confirmCrossDock = async () => {
    if (!confirmDialog || !tenantId) return;

    // Create stock movement
    const supabase = createClient();
    await supabase.from('stock_movements').insert({
      tenant_id: tenantId,
      product_id: '', // We don't have direct product_id here, handled via reference
      user_id: user?.id,
      quantity: confirmDialog.quantity,
      movement_type: 'receive',
      reference_number: confirmDialog.reference,
      reason: `Cross-dock ${confirmDialog.po_number} → ${confirmDialog.so_number}`,
      metadata: {
        cross_dock: true,
        po_number: confirmDialog.po_number,
        so_number: confirmDialog.so_number,
      },
    });

    // Move to history
    const completedItem: CompletedCrossDock = {
      ...confirmDialog,
      status: 'confirmed',
      completed_at: new Date().toISOString(),
    };
    const updatedActive = activeDocks.filter(d => d.id !== confirmDialog.id);
    const updatedHistory = [completedItem, ...history];

    store(CROSSDOCK_STORAGE_KEY, updatedActive);
    store(CROSSDOCK_HISTORY_KEY, updatedHistory);
    setActiveDocks(updatedActive);
    setHistory(updatedHistory);
    setConfirmDialog(null);
    toast.success('Cross-dock completed');
  };

  const filteredMatches = matches.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return m.product_name.toLowerCase().includes(s) ||
           m.sku.toLowerCase().includes(s) ||
           m.po_number.toLowerCase().includes(s);
  });

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <PageHeader title="Cross-Docking" description="Receive and route directly to outbound" />
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <PageHeader title="Cross-Docking" description="Receive inbound and route directly to outbound shipping without storage" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Pending Matches" value={matches.length} icon={ArrowRightLeft} />
        <StatCard title="Active Cross-Docks" value={activeDocks.length} icon={PackageOpen} />
        <StatCard title="Completed Today" value={history.filter(h => new Date(h.completed_at).toDateString() === new Date().toDateString()).length} icon={CheckCircle2} />
        <StatCard title="Units in Transit" value={formatNumber(activeDocks.reduce((s, d) => s + d.quantity, 0))} icon={Truck} />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending Inbound ({matches.length})</TabsTrigger>
          <TabsTrigger value="active">Cross-Dock ({activeDocks.length})</TabsTrigger>
          <TabsTrigger value="history">History ({history.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inbound POs with Matching Outbound Orders</CardTitle>
              <CardDescription>Items that can skip put-away and go directly to shipping</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Search by product, SKU, or PO#..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />

              {filteredMatches.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No inbound PO lines match any pending sales orders
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredMatches.map((match, idx) => (
                    <Card key={idx} className="border-l-4 border-l-blue-500">
                      <CardContent className="py-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="font-medium">{match.product_name}</div>
                            <div className="text-sm text-muted-foreground">
                              SKU: {match.sku} | PO: {match.po_number} | Expected: {match.qty_expected} units
                            </div>
                          </div>
                          <Badge variant="outline" className="text-blue-600 border-blue-300">
                            {match.matching_orders.length} matching order{match.matching_orders.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        <div className="rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Sales Order</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead className="text-right">Qty Needed</TableHead>
                                <TableHead className="text-right">Can Cross-Dock</TableHead>
                                <TableHead className="w-32"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {match.matching_orders.map(order => {
                                const canCrossDock = Math.min(match.qty_expected, order.qty_needed);
                                const alreadyDocked = activeDocks.some(d =>
                                  d.po_number === match.po_number && d.so_number === order.order_number && d.sku === match.sku
                                );
                                return (
                                  <TableRow key={order.order_id}>
                                    <TableCell className="font-mono">{order.order_number}</TableCell>
                                    <TableCell>{order.customer_name}</TableCell>
                                    <TableCell className="text-right">{order.qty_needed}</TableCell>
                                    <TableCell className="text-right font-medium">{canCrossDock}</TableCell>
                                    <TableCell>
                                      {alreadyDocked ? (
                                        <Badge variant="secondary">Marked</Badge>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => markForCrossDock(match, order)}
                                        >
                                          Mark for Cross-Dock
                                        </Button>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Cross-Dock Items</CardTitle>
              <CardDescription>Items received at dock, matched to outbound orders. Advance through: Received → Staged → Confirmed</CardDescription>
            </CardHeader>
            <CardContent>
              {activeDocks.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No active cross-dock operations. Mark items from the Pending Inbound tab.
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>PO</TableHead>
                        <TableHead>SO</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-40"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeDocks.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-sm">{item.reference}</TableCell>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                          <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                          <TableCell className="font-mono text-sm">{item.po_number}</TableCell>
                          <TableCell className="font-mono text-sm">{item.so_number}</TableCell>
                          <TableCell>
                            <Badge variant={
                              item.status === 'received' ? 'secondary' :
                              item.status === 'staged' ? 'default' : 'default'
                            } className={
                              item.status === 'staged' ? 'bg-yellow-500 text-white' : ''
                            }>
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(item.created_at)}</TableCell>
                          <TableCell>
                            <Button size="sm" onClick={() => advanceStatus(item)}>
                              {item.status === 'received' ? 'Stage Outbound' : 'Confirm Ship'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={history.length === 0}
              onClick={() => {
                exportToCSV(
                  history.map(h => ({
                    reference: h.reference,
                    product: h.product_name,
                    sku: h.sku,
                    quantity: h.quantity,
                    po_number: h.po_number,
                    so_number: h.so_number,
                    completed_at: h.completed_at,
                  })),
                  'crossdock_history'
                );
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          {history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No completed cross-dock operations yet.
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>PO</TableHead>
                    <TableHead>SO</TableHead>
                    <TableHead>Completed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-sm">{item.reference}</TableCell>
                      <TableCell>{item.product_name}</TableCell>
                      <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                      <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                      <TableCell className="font-mono text-sm">{item.po_number}</TableCell>
                      <TableCell className="font-mono text-sm">{item.so_number}</TableCell>
                      <TableCell>{formatDateTime(item.completed_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirm Cross-Dock Dialog */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Cross-Dock Completion</DialogTitle>
          </DialogHeader>
          {confirmDialog && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Product</span>
                  <span className="font-medium">{confirmDialog.product_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-medium">{confirmDialog.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">From PO</span>
                  <span className="font-mono">{confirmDialog.po_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To SO</span>
                  <span className="font-mono">{confirmDialog.so_number}</span>
                </div>
              </div>
              <div className="flex items-start gap-2 text-sm text-amber-600">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>This will create a stock movement record and mark the cross-dock as complete. Items skip put-away entirely.</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button onClick={confirmCrossDock}>Confirm Cross-Dock</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
