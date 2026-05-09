'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Plus,
  ClipboardList,
  Trash2,
  Play,
  CheckCircle2,
  FileText,
  Wrench,
  Package,
  User,
  Car,
  Printer,
} from 'lucide-react';
import { formatCurrency, formatDate, formatRelativeDate } from '@/lib/format';
import { generateWorkOrderInvoicePDF } from '@/lib/pdf';
import type { Customer, Product, ServiceItem, WorkOrderStatus } from '@/types/database';

interface WORow {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_id: string | null;
  status: WorkOrderStatus;
  priority: number;
  description: string | null;
  asset_info: string | null;
  assigned_to: string | null;
  assigned_user?: { full_name: string } | null;
  scheduled_date: string | null;
  parts_total: number;
  labor_total: number;
  grand_total: number;
  created_at: string;
  completed_at: string | null;
}

interface LineItem {
  line_type: 'part' | 'service';
  product_id: string | null;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

const STATUS_CONFIG: Record<WorkOrderStatus, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700' },
  invoiced: { label: 'Invoiced', color: 'bg-purple-100 text-purple-700' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-700' },
};

export default function WorkOrdersPage() {
  const { user, tenantId, role } = useAuth();
  const [orders, setOrders] = useState<WORow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [workers, setWorkers] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('open');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: '', customer_name: '', description: '', asset_info: '',
    assigned_to: '', scheduled_date: '', priority: '5',
  });
  const [lines, setLines] = useState<LineItem[]>([]);

  // Detail dialog
  const [detailOrder, setDetailOrder] = useState<WORow | null>(null);
  const [detailLines, setDetailLines] = useState<LineItem[]>([]);

  const isManager = role === 'admin' || role === 'manager';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [woRes, custRes, prodRes, svcRes, wrkRes] = await Promise.all([
      supabase.from('work_orders').select('*, assigned_user:users!work_orders_assigned_to_fkey(full_name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      supabase.from('customers').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('service_items').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      supabase.from('users').select('id, full_name').eq('tenant_id', tenantId).eq('is_active', true).order('full_name'),
    ]);

    setOrders((woRes.data as WORow[]) || []);
    setCustomers(custRes.data || []);
    setProducts(prodRes.data || []);
    setServices(svcRes.data || []);
    setWorkers(wrkRes.data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filtered by tab
  const filtered = orders.filter((o) => {
    if (tab === 'open') return ['draft', 'scheduled', 'in_progress'].includes(o.status);
    if (tab === 'done') return ['completed', 'invoiced'].includes(o.status);
    return true;
  });

  // Stats
  const openCount = orders.filter((o) => ['draft', 'scheduled', 'in_progress'].includes(o.status)).length;
  const doneCount = orders.filter((o) => ['completed', 'invoiced'].includes(o.status)).length;

  // Add line
  const addPartLine = (productId: string) => {
    const p = products.find((pr) => pr.id === productId);
    if (!p) return;
    setLines((prev) => [...prev, { line_type: 'part', product_id: p.id, service_id: null, description: p.name, quantity: 1, unit_price: p.price }]);
  };

  const addServiceLine = (serviceId: string) => {
    const s = services.find((sv) => sv.id === serviceId);
    if (!s) return;
    setLines((prev) => [...prev, { line_type: 'service', product_id: null, service_id: s.id, description: s.name, quantity: 1, unit_price: s.default_price }]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const partsTotal = lines.filter((l) => l.line_type === 'part').reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const laborTotal = lines.filter((l) => l.line_type === 'service').reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const grandTotal = partsTotal + laborTotal;

  // Create
  const handleCreate = async () => {
    if (!tenantId || !user) return;
    if (!form.customer_name && !form.customer_id) {
      toast.error('Customer name is required');
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const woId = crypto.randomUUID();
    const orderNum = `WO-${Date.now().toString(36).toUpperCase()}`;
    const custName = form.customer_id
      ? customers.find((c) => c.id === form.customer_id)?.name || form.customer_name
      : form.customer_name;

    const { error } = await supabase.from('work_orders').insert({
      id: woId,
      tenant_id: tenantId,
      order_number: orderNum,
      customer_id: form.customer_id || null,
      customer_name: custName,
      status: form.scheduled_date ? 'scheduled' : 'draft',
      priority: parseInt(form.priority) || 5,
      description: form.description || null,
      asset_info: form.asset_info || null,
      assigned_to: form.assigned_to || null,
      scheduled_date: form.scheduled_date || null,
      parts_total: partsTotal,
      labor_total: laborTotal,
      grand_total: grandTotal,
      created_by: user.id,
    });

    if (error) {
      toast.error('Failed to create work order');
      setSaving(false);
      return;
    }

    // Insert lines
    if (lines.length > 0) {
      await supabase.from('work_order_lines').insert(
        lines.map((l) => ({
          tenant_id: tenantId,
          work_order_id: woId,
          line_type: l.line_type,
          product_id: l.product_id,
          service_id: l.service_id,
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.unit_price * l.quantity,
        }))
      );
    }

    setSaving(false);
    toast.success(`Work order ${orderNum} created`);
    setCreateOpen(false);
    setForm({ customer_id: '', customer_name: '', description: '', asset_info: '', assigned_to: '', scheduled_date: '', priority: '5' });
    setLines([]);
    loadData();
  };

  // Status update
  const updateStatus = async (orderId: string, newStatus: WorkOrderStatus) => {
    const supabase = createClient();
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'in_progress') updates.started_at = new Date().toISOString();
    if (newStatus === 'completed') updates.completed_at = new Date().toISOString();

    const { error } = await supabase.from('work_orders').update(updates).eq('id', orderId);

    // If completing, decrement inventory for part lines
    if (newStatus === 'completed' && !error) {
      const { data: woLines } = await supabase.from('work_order_lines').select('*').eq('work_order_id', orderId).eq('line_type', 'part');
      for (const line of woLines || []) {
        if (line.product_id) {
          await supabase.from('stock_movements').insert({
            tenant_id: tenantId!, product_id: line.product_id, user_id: user!.id,
            quantity: -line.quantity, movement_type: 'ship',
            reason: `Work order parts — ${detailOrder?.order_number || orderId}`,
            reference_number: detailOrder?.order_number || orderId,
            metadata: { channel: 'work_order', work_order_id: orderId },
          });
        }
      }
    }

    if (error) toast.error('Failed to update');
    else { toast.success(`Status → ${STATUS_CONFIG[newStatus].label}`); loadData(); setDetailOrder(null); }
  };

  // View detail
  const viewDetail = async (order: WORow) => {
    setDetailOrder(order);
    const supabase = createClient();
    const { data } = await supabase.from('work_order_lines').select('*').eq('work_order_id', order.id);
    setDetailLines((data || []).map((l: Record<string, unknown>) => ({
      line_type: l.line_type as 'part' | 'service',
      product_id: l.product_id as string | null,
      service_id: l.service_id as string | null,
      description: l.description as string,
      quantity: l.quantity as number,
      unit_price: l.unit_price as number,
    })));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Orders"
        description="Service tickets — track jobs from intake to invoice"
        actions={
          isManager ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Work Order
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold">{orders.length}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
        <Card className={openCount > 0 ? 'border-amber-500/30' : ''}><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-amber-600">{openCount}</p><p className="text-xs text-muted-foreground">Open</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-green-600">{doneCount}</p><p className="text-xs text-muted-foreground">Completed</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold">{formatCurrency(orders.reduce((s, o) => s + (o.grand_total || 0), 0))}</p><p className="text-xs text-muted-foreground">Total Value</p></CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="open">Open ({openCount})</TabsTrigger>
          <TabsTrigger value="done">Completed ({doneCount})</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <TabsContent value={tab}>
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                  <p className="font-semibold">No work orders</p>
                  <p className="text-sm text-muted-foreground mt-1">Create one to get started</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer hover:bg-accent/50" onClick={() => viewDetail(o)}>
                        <TableCell>
                          <p className="font-mono text-sm font-medium">{o.order_number}</p>
                          {o.description && <p className="text-xs text-muted-foreground line-clamp-1">{o.description}</p>}
                        </TableCell>
                        <TableCell className="text-sm">{o.customer_name || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{o.asset_info || '—'}</TableCell>
                        <TableCell className="text-sm">{o.assigned_user?.full_name || '—'}</TableCell>
                        <TableCell><Badge className={STATUS_CONFIG[o.status].color}>{STATUS_CONFIG[o.status].label}</Badge></TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(o.grand_total || 0)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatRelativeDate(o.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ═══ Create Dialog ═══ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Work Order</DialogTitle></DialogHeader>
          <div className="space-y-6 py-2">
            {/* Section 1: Customer & Job Info */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><User className="h-4 w-4" /> Customer & Job</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select value={form.customer_id} onValueChange={(v) => {
                    const c = customers.find((cu) => cu.id === v);
                    setForm((p) => ({ ...p, customer_id: v, customer_name: c?.name || '' }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select or type below" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Or type name</Label>
                  <Input value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} placeholder="Walk-in customer" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Car className="h-3 w-3" /> Vehicle / Asset</Label>
                  <Input value={form.asset_info} onChange={(e) => setForm((p) => ({ ...p, asset_info: e.target.value }))} placeholder="e.g., 2019 Honda Civic, Serial #ABC" />
                </div>
                <div className="space-y-2">
                  <Label>Scheduled Date</Label>
                  <Input type="date" value={form.scheduled_date} onChange={(e) => setForm((p) => ({ ...p, scheduled_date: e.target.value }))} />
                </div>
              </div>
              <div className="mt-3 space-y-2">
                <Label>Job Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="What needs to be done" rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <Select value={form.assigned_to} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select tech" /></SelectTrigger>
                    <SelectContent>
                      {workers.map((w) => <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority (1-10)</Label>
                  <Input type="number" min="1" max="10" value={form.priority} onChange={(e) => setForm((p) => ({ ...p, priority: e.target.value }))} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 2: Services (Labor) */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Wrench className="h-4 w-4" /> Services</h3>
              <Select onValueChange={addServiceLine}>
                <SelectTrigger><SelectValue placeholder="Add a service..." /></SelectTrigger>
                <SelectContent>
                  {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} — {formatCurrency(s.default_price)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Section 3: Parts (from inventory) */}
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Package className="h-4 w-4" /> Parts</h3>
              <Select onValueChange={addPartLine}>
                <SelectTrigger><SelectValue placeholder="Add a part from inventory..." /></SelectTrigger>
                <SelectContent>
                  {products.slice(0, 50).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku}) — {formatCurrency(p.price)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Line items */}
            {lines.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Line Items</h3>
                <div className="space-y-1">
                  {lines.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded border bg-muted/30 text-sm">
                      <Badge variant="outline" className="text-[10px] shrink-0">{l.line_type === 'service' ? 'Labor' : 'Part'}</Badge>
                      <span className="flex-1 truncate">{l.description}</span>
                      <Input type="number" min="1" className="w-16 h-7 text-xs text-center" value={l.quantity}
                        onChange={(e) => { const q = parseInt(e.target.value) || 1; setLines((prev) => prev.map((li, idx) => idx === i ? { ...li, quantity: q } : li)); }} />
                      <span className="text-xs text-muted-foreground">@{formatCurrency(l.unit_price)}</span>
                      <span className="font-medium w-16 text-right">{formatCurrency(l.unit_price * l.quantity)}</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive" onClick={() => removeLine(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Separator className="my-3" />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Parts</span><span>{formatCurrency(partsTotal)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Labor</span><span>{formatCurrency(laborTotal)}</span></div>
                  <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatCurrency(grandTotal)}</span></div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create Work Order'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ Detail Dialog ═══ */}
      <Dialog open={!!detailOrder} onOpenChange={() => setDetailOrder(null)}>
        <DialogContent className="max-w-lg">
          {detailOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="font-mono">{detailOrder.order_number}</span>
                  <Badge className={STATUS_CONFIG[detailOrder.status].color}>{STATUS_CONFIG[detailOrder.status].label}</Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-muted-foreground text-xs">Customer</p><p className="font-medium">{detailOrder.customer_name || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Asset</p><p className="font-medium">{detailOrder.asset_info || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Assigned</p><p className="font-medium">{detailOrder.assigned_user?.full_name || '—'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Created</p><p>{formatDate(detailOrder.created_at)}</p></div>
                </div>
                {detailOrder.description && <p className="text-sm bg-muted p-2 rounded">{detailOrder.description}</p>}

                {detailLines.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">LINE ITEMS</p>
                    {detailLines.map((l, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[9px]">{l.line_type === 'service' ? 'Labor' : 'Part'}</Badge>
                          <span>{l.description}</span>
                        </div>
                        <span className="font-medium">{l.quantity} x {formatCurrency(l.unit_price)}</span>
                      </div>
                    ))}
                    <Separator className="my-2" />
                    <div className="flex justify-between font-bold"><span>Total</span><span>{formatCurrency(detailOrder.grand_total)}</span></div>
                  </div>
                )}
              </div>
              <DialogFooter className="flex-wrap gap-2">
                {['completed', 'invoiced'].includes(detailOrder.status) && (
                  <Button variant="outline" onClick={async () => {
                    const supabase = createClient();
                    const { data: tenant } = await supabase.from('tenants').select('name, settings').eq('id', tenantId).single();
                    const s = (tenant?.settings || {}) as Record<string, string>;
                    generateWorkOrderInvoicePDF({
                      companyName: tenant?.name || 'Company',
                      companyAddress: s.address || '',
                      orderNumber: detailOrder.order_number,
                      date: formatDate(detailOrder.created_at),
                      customerName: detailOrder.customer_name || 'Walk-in',
                      assetInfo: detailOrder.asset_info,
                      lines: detailLines.map((l) => ({ description: l.description, lineType: l.line_type, quantity: l.quantity, unitPrice: l.unit_price, lineTotal: l.unit_price * l.quantity })),
                      partsTotal: detailOrder.parts_total || 0,
                      laborTotal: detailOrder.labor_total || 0,
                      tax: detailOrder.grand_total ? detailOrder.grand_total * 0.0825 : 0,
                      grandTotal: detailOrder.grand_total || 0,
                      technicianName: detailOrder.assigned_user?.full_name || null,
                      notes: null,
                    });
                  }}>
                    <Printer className="h-4 w-4 mr-1" /> Print Invoice
                  </Button>
                )}
                {detailOrder.status === 'draft' && (
                  <Button onClick={() => updateStatus(detailOrder.id, 'scheduled')}><Play className="h-4 w-4 mr-1" /> Schedule</Button>
                )}
                {detailOrder.status === 'scheduled' && (
                  <Button onClick={() => updateStatus(detailOrder.id, 'in_progress')}><Play className="h-4 w-4 mr-1" /> Start Work</Button>
                )}
                {detailOrder.status === 'in_progress' && (
                  <Button onClick={() => updateStatus(detailOrder.id, 'completed')} className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-4 w-4 mr-1" /> Complete</Button>
                )}
                {detailOrder.status === 'completed' && (
                  <Button onClick={() => updateStatus(detailOrder.id, 'invoiced')} variant="outline"><FileText className="h-4 w-4 mr-1" /> Mark Invoiced</Button>
                )}
                {['draft', 'scheduled'].includes(detailOrder.status) && (
                  <Button variant="outline" className="text-destructive" onClick={() => updateStatus(detailOrder.id, 'cancelled')}>Cancel</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
