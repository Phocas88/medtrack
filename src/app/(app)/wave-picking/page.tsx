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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Layers, Plus, Printer, Download, ClipboardList, CheckCircle2, Package } from 'lucide-react';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type { SalesOrder, SalesOrderLine, Product, Bin, BinInventory, Lot, User as DbUser } from '@/types/database';

type OrderWithDetails = Omit<SalesOrder, 'customer' | 'lines'> & {
  customer?: { id: string; name: string };
  lines?: (SalesOrderLine & { product?: Product })[];
};

interface PickLine {
  product_id: string;
  product_name: string;
  sku: string;
  quantity_needed: number;
  bin_code: string;
  bin_id: string;
  lot_number: string;
  lot_id: string;
  expiration_date: string | null;
  aisle_sequence: number;
  order_number: string;
}

interface Wave {
  id: string;
  wave_number: string;
  created_at: string;
  order_ids: string[];
  order_numbers: string[];
  pick_lines: PickLine[];
  assigned_to: string | null;
  assigned_name: string | null;
  status: 'active' | 'completed';
  completed_picks: number;
  total_picks: number;
}

const WAVES_STORAGE_KEY = 'trackflow_waves';

function getStoredWaves(): Wave[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WAVES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function storeWaves(waves: Wave[]) {
  localStorage.setItem(WAVES_STORAGE_KEY, JSON.stringify(waves));
}

function parseBinCode(code: string): number {
  // Parse bin code like "A-01-03" into aisle sequence for sort
  const parts = code.split('-');
  let seq = 0;
  if (parts[0]) seq += (parts[0].charCodeAt(0) - 64) * 10000; // A=10000, B=20000...
  if (parts[1]) seq += parseInt(parts[1], 10) * 100;
  if (parts[2]) seq += parseInt(parts[2], 10);
  return isNaN(seq) ? 0 : seq;
}

function printPickList(wave: Wave) {
  const rows = [...wave.pick_lines]
    .sort((a, b) => a.aisle_sequence - b.aisle_sequence)
    .map((line, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${line.product_name}</td>
        <td class="mono">${line.sku}</td>
        <td class="center">${line.quantity_needed}</td>
        <td class="mono">${line.bin_code}</td>
        <td class="mono">${line.lot_number}</td>
        <td>${line.expiration_date || '—'}</td>
        <td>${line.order_number}</td>
        <td class="center"><span class="checkbox"></span></td>
      </tr>
    `).join('');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Pick List - ${wave.wave_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; padding: 40px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .meta { font-size: 13px; color: #6b7280; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  thead th { background: #f9fafb; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; padding: 8px 10px; text-align: left; border-bottom: 2px solid #e5e7eb; }
  thead th.center { text-align: center; }
  tbody td { padding: 8px 10px; font-size: 13px; border-bottom: 1px solid #f3f4f6; color: #374151; }
  tbody td.center { text-align: center; }
  tbody td.mono { font-family: 'SF Mono', 'Fira Code', monospace; font-size: 12px; }
  .checkbox { display: inline-block; width: 16px; height: 16px; border: 2px solid #d1d5db; border-radius: 3px; }
  .summary { margin-top: 16px; font-size: 13px; color: #4b5563; }
  @media print { body { padding: 20px; } @page { margin: 0.5in; } }
</style>
</head><body>
  <h1>Pick List: ${wave.wave_number}</h1>
  <div class="meta">
    Orders: ${wave.order_numbers.join(', ')} |
    Total Picks: ${wave.total_picks} |
    Assigned: ${wave.assigned_name || 'Unassigned'} |
    Created: ${new Date(wave.created_at).toLocaleDateString()}
  </div>
  <table>
    <thead><tr>
      <th class="center">#</th><th>Product</th><th>SKU</th><th class="center">Qty</th>
      <th>Bin</th><th>Lot</th><th>Expires</th><th>Order</th><th class="center">Picked</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="summary">Sorted by walking path (aisle-rack-shelf). Picker signature: _______________</div>
</body></html>`;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Please allow pop-ups to print documents.');
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

export default function WavePickingPage() {
  const { tenantId, user } = useAuth();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [waves, setWaves] = useState<Wave[]>([]);
  const [users, setUsers] = useState<DbUser[]>([]);
  const [assignedUserId, setAssignedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bins, setBins] = useState<(Bin & { inventory?: BinInventory[] })[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [ordersRes, usersRes, binsRes, lotsRes] = await Promise.all([
      supabase
        .from('sales_orders')
        .select('*, customer:customers(id, name), lines:sales_order_lines(*, product:products(*))')
        .eq('tenant_id', tenantId)
        .in('status', ['confirmed', 'draft'])
        .order('created_at', { ascending: false }),
      supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
      supabase
        .from('bins')
        .select('*, inventory:bin_inventory(*)')
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
      supabase
        .from('lots')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
    ]);

    if (ordersRes.data) setOrders(ordersRes.data as OrderWithDetails[]);
    if (usersRes.data) setUsers(usersRes.data);
    if (binsRes.data) setBins(binsRes.data as (Bin & { inventory?: BinInventory[] })[]);
    if (lotsRes.data) setLots(lotsRes.data);

    setWaves(getStoredWaves());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const generatePickLines = (selectedOrders: OrderWithDetails[]): PickLine[] => {
    const pickLines: PickLine[] = [];

    for (const order of selectedOrders) {
      if (!order.lines) continue;
      for (const line of order.lines) {
        const remaining = line.quantity_ordered - line.quantity_shipped;
        if (remaining <= 0) continue;

        // Find primary bin for product
        const productBins = bins.filter(b =>
          b.bin_type === 'primary' &&
          b.inventory?.some(inv => inv.product_id === line.product_id && inv.quantity > 0)
        );
        const bin = productBins[0] || bins.find(b =>
          b.inventory?.some(inv => inv.product_id === line.product_id && inv.quantity > 0)
        );

        // FEFO lot selection
        const productLots = lots
          .filter(l => l.product_id === line.product_id && l.quantity_on_hand > 0)
          .sort((a, b) => {
            if (a.expiration_date && b.expiration_date) {
              return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
            }
            if (a.expiration_date && !b.expiration_date) return -1;
            if (!a.expiration_date && b.expiration_date) return 1;
            return new Date(a.received_date).getTime() - new Date(b.received_date).getTime();
          });

        let remainingQty = remaining;
        for (const lot of productLots) {
          if (remainingQty <= 0) break;
          const pickQty = Math.min(remainingQty, lot.quantity_on_hand);
          const binCode = bin?.bin_code || 'UNASSIGNED';

          pickLines.push({
            product_id: line.product_id,
            product_name: line.product?.name || 'Unknown',
            sku: line.product?.sku || '',
            quantity_needed: pickQty,
            bin_code: binCode,
            bin_id: bin?.id || '',
            lot_number: lot.lot_number,
            lot_id: lot.id,
            expiration_date: lot.expiration_date,
            aisle_sequence: parseBinCode(binCode),
            order_number: order.order_number,
          });
          remainingQty -= pickQty;
        }

        // If no lots found, still create a pick line
        if (productLots.length === 0) {
          const binCode = bin?.bin_code || 'UNASSIGNED';
          pickLines.push({
            product_id: line.product_id,
            product_name: line.product?.name || 'Unknown',
            sku: line.product?.sku || '',
            quantity_needed: remaining,
            bin_code: binCode,
            bin_id: bin?.id || '',
            lot_number: 'N/A',
            lot_id: '',
            expiration_date: null,
            aisle_sequence: parseBinCode(binCode),
            order_number: order.order_number,
          });
        }
      }
    }

    // Sort by aisle sequence for efficient walking
    return pickLines.sort((a, b) => a.aisle_sequence - b.aisle_sequence);
  };

  const createWave = async () => {
    if (selectedOrderIds.size === 0) {
      toast.error('Select at least one order');
      return;
    }
    setCreating(true);

    const selectedOrders = orders.filter(o => selectedOrderIds.has(o.id));
    const pickLines = generatePickLines(selectedOrders);

    if (pickLines.length === 0) {
      toast.error('No items to pick from selected orders');
      setCreating(false);
      return;
    }

    const existingWaves = getStoredWaves();
    const waveNum = `WAVE-${String(existingWaves.length + 1).padStart(4, '0')}`;
    const assignedUser = users.find(u => u.id === assignedUserId);

    const wave: Wave = {
      id: crypto.randomUUID(),
      wave_number: waveNum,
      created_at: new Date().toISOString(),
      order_ids: selectedOrders.map(o => o.id),
      order_numbers: selectedOrders.map(o => o.order_number),
      pick_lines: pickLines,
      assigned_to: assignedUserId || null,
      assigned_name: assignedUser?.full_name || null,
      status: 'active',
      completed_picks: 0,
      total_picks: pickLines.length,
    };

    // Create scan_tasks for each pick line
    if (tenantId) {
      const supabase = createClient();
      const tasks = pickLines.map((line, idx) => ({
        tenant_id: tenantId,
        task_type: 'pick' as const,
        status: 'pending' as const,
        priority: idx + 1,
        title: `Pick ${line.quantity_needed}x ${line.product_name} from ${line.bin_code}`,
        instructions: `Order: ${line.order_number} | Lot: ${line.lot_number} | Wave: ${waveNum}`,
        assigned_to: assignedUserId || null,
        assigned_by: user?.id || null,
        assigned_at: assignedUserId ? new Date().toISOString() : null,
        product_id: line.product_id,
        lot_id: line.lot_id || null,
        source_bin_id: line.bin_id || null,
        requested_quantity: line.quantity_needed,
      }));

      const { error } = await supabase.from('scan_tasks').insert(tasks);
      if (error) {
        console.error('Error creating pick tasks:', error);
        toast.error('Wave created but failed to generate pick tasks');
      }

      // Update order statuses to 'picking'
      for (const orderId of wave.order_ids) {
        await supabase
          .from('sales_orders')
          .update({ status: 'picking' })
          .eq('id', orderId);
      }
    }

    const updatedWaves = [...existingWaves, wave];
    storeWaves(updatedWaves);
    setWaves(updatedWaves);
    setSelectedOrderIds(new Set());
    setAssignedUserId('');
    setCreating(false);
    toast.success(`${waveNum} created with ${pickLines.length} picks`);
    loadData();
  };

  const completeWave = (waveId: string) => {
    const updated = waves.map(w =>
      w.id === waveId ? { ...w, status: 'completed' as const, completed_picks: w.total_picks } : w
    );
    storeWaves(updated);
    setWaves(updated);
    toast.success('Wave marked as completed');
  };

  const updateWaveProgress = (waveId: string) => {
    const updated = waves.map(w =>
      w.id === waveId ? { ...w, completed_picks: Math.min(w.completed_picks + 1, w.total_picks) } : w
    );
    storeWaves(updated);
    setWaves(updated);
  };

  const activeWaves = waves.filter(w => w.status === 'active');
  const completedWaves = waves.filter(w => w.status === 'completed');

  const filteredOrders = orders.filter(o => {
    if (!search) return true;
    const s = search.toLowerCase();
    return o.order_number.toLowerCase().includes(s) ||
           o.customer?.name?.toLowerCase().includes(s);
  });

  // Exclude orders already in active waves
  const activeWaveOrderIds = new Set(activeWaves.flatMap(w => w.order_ids));
  const availableOrders = filteredOrders.filter(o => !activeWaveOrderIds.has(o.id));

  const totalItemsSelected = availableOrders
    .filter(o => selectedOrderIds.has(o.id))
    .reduce((sum, o) => sum + (o.lines?.reduce((s, l) => s + (l.quantity_ordered - l.quantity_shipped), 0) || 0), 0);

  if (loading) {
    return (
      <div className="flex-1 space-y-6 p-6">
        <PageHeader title="Wave Picking" description="Batch order picking management" />
        <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      <PageHeader title="Wave Picking" description="Group orders into waves for efficient batch picking" />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Active Waves" value={activeWaves.length} icon={Layers} />
        <StatCard title="Pending Orders" value={availableOrders.length} icon={ClipboardList} />
        <StatCard title="Completed Today" value={completedWaves.filter(w => new Date(w.created_at).toDateString() === new Date().toDateString()).length} icon={CheckCircle2} />
        <StatCard title="Total Picks Active" value={formatNumber(activeWaves.reduce((s, w) => s + w.total_picks - w.completed_picks, 0))} icon={Package} />
      </div>

      <Tabs defaultValue="create">
        <TabsList>
          <TabsTrigger value="create">Create Wave</TabsTrigger>
          <TabsTrigger value="active">Active Waves ({activeWaves.length})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({completedWaves.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="create" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Select Orders for Wave</CardTitle>
              <CardDescription>Choose pending sales orders to group into a picking wave</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Input
                  placeholder="Search orders..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="max-w-sm"
                />
                <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Assign picker..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex-1" />
                <div className="text-sm text-muted-foreground">
                  {selectedOrderIds.size} orders selected ({totalItemsSelected} items)
                </div>
                <Button onClick={createWave} disabled={selectedOrderIds.size === 0 || creating}>
                  <Plus className="mr-2 h-4 w-4" />
                  {creating ? 'Creating...' : 'Create Wave'}
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={availableOrders.length > 0 && availableOrders.every(o => selectedOrderIds.has(o.id))}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedOrderIds(new Set(availableOrders.map(o => o.id)));
                            } else {
                              setSelectedOrderIds(new Set());
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Qty to Pick</TableHead>
                      <TableHead>Ship Date</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {availableOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No pending orders available for wave picking
                        </TableCell>
                      </TableRow>
                    ) : (
                      availableOrders.map(order => {
                        const itemCount = order.lines?.length || 0;
                        const qtyToPick = order.lines?.reduce((s, l) => s + Math.max(0, l.quantity_ordered - l.quantity_shipped), 0) || 0;
                        return (
                          <TableRow key={order.id} className="cursor-pointer" onClick={() => toggleOrder(order.id)}>
                            <TableCell>
                              <Checkbox
                                checked={selectedOrderIds.has(order.id)}
                                onCheckedChange={() => toggleOrder(order.id)}
                              />
                            </TableCell>
                            <TableCell className="font-mono font-medium">{order.order_number}</TableCell>
                            <TableCell>{order.customer?.name || '—'}</TableCell>
                            <TableCell>
                              <Badge variant={order.status === 'confirmed' ? 'default' : 'secondary'}>
                                {order.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{itemCount}</TableCell>
                            <TableCell className="text-right font-medium">{qtyToPick}</TableCell>
                            <TableCell>{formatDate(order.ship_date)}</TableCell>
                            <TableCell>{formatDate(order.created_at)}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          {activeWaves.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No active waves. Create one from the Create Wave tab.
              </CardContent>
            </Card>
          ) : (
            activeWaves.map(wave => (
              <Card key={wave.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{wave.wave_number}</CardTitle>
                      <CardDescription>
                        Orders: {wave.order_numbers.join(', ')} | Assigned: {wave.assigned_name || 'Unassigned'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => printPickList(wave)}>
                        <Printer className="mr-2 h-4 w-4" />
                        Print Pick List
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => updateWaveProgress(wave.id)}>
                        +1 Pick
                      </Button>
                      <Button size="sm" onClick={() => completeWave(wave.id)}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Complete Wave
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex items-center gap-6 text-sm">
                    <span>Total Picks: <strong>{wave.total_picks}</strong></span>
                    <span>Completed: <strong>{wave.completed_picks}</strong></span>
                    <span>Remaining: <strong>{wave.total_picks - wave.completed_picks}</strong></span>
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${wave.total_picks > 0 ? (wave.completed_picks / wave.total_picks) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                    <span className="font-medium">{wave.total_picks > 0 ? Math.round((wave.completed_picks / wave.total_picks) * 100) : 0}%</span>
                  </div>

                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Bin</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead>Order</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {wave.pick_lines.map((line, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{idx + 1}</TableCell>
                            <TableCell className="font-medium">{line.product_name}</TableCell>
                            <TableCell className="font-mono text-sm">{line.sku}</TableCell>
                            <TableCell className="text-right font-medium">{line.quantity_needed}</TableCell>
                            <TableCell className="font-mono text-sm">{line.bin_code}</TableCell>
                            <TableCell className="font-mono text-sm">{line.lot_number}</TableCell>
                            <TableCell>{formatDate(line.expiration_date)}</TableCell>
                            <TableCell className="font-mono text-sm">{line.order_number}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={completedWaves.length === 0}
              onClick={() => {
                exportToCSV(
                  completedWaves.map(w => ({
                    wave_number: w.wave_number,
                    created_at: w.created_at,
                    orders: w.order_numbers.join('; '),
                    assigned_to: w.assigned_name || 'Unassigned',
                    total_picks: w.total_picks,
                    status: w.status,
                  })),
                  'completed_waves'
                );
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          {completedWaves.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No completed waves yet.
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wave #</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead className="text-right">Total Picks</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedWaves.map(wave => (
                    <TableRow key={wave.id}>
                      <TableCell className="font-mono font-medium">{wave.wave_number}</TableCell>
                      <TableCell>{wave.order_numbers.join(', ')}</TableCell>
                      <TableCell>{wave.assigned_name || 'Unassigned'}</TableCell>
                      <TableCell className="text-right">{wave.total_picks}</TableCell>
                      <TableCell>
                        <Badge variant="default" className="bg-green-600">Completed</Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(wave.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
