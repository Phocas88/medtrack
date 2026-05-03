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
import { StatCard } from '@/components/ui/stat-card';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Plus,
  Tag,
  Calendar,
  TrendingDown,
  Percent,
  XCircle,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/format';
import type { Product, Promotion, PromotionStatus } from '@/types/database';

const STATUS_BADGES: Record<PromotionStatus, { label: string; className: string }> = {
  scheduled: { label: 'Scheduled', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  active: { label: 'Active', className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300' },
  ended: { label: 'Ended', className: 'bg-gray-100 text-gray-800 dark:bg-gray-950 dark:text-gray-300' },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' },
};

export default function PromotionsPage() {
  const { user, tenantId, role } = useAuth();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    name: '',
    sale_price: '',
    start_date: '',
    end_date: '',
    notes: '',
  });

  const isManager = role === 'admin' || role === 'manager';

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [promoRes, prodRes] = await Promise.all([
      supabase
        .from('promotions')
        .select('*, product:products(name, sku, price, image_url)')
        .eq('tenant_id', tenantId)
        .order('start_date', { ascending: false }),
      supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_archived', false)
        .order('name'),
    ]);

    setPromotions((promoRes.data as Promotion[]) || []);
    setProducts(prodRes.data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-update statuses based on dates
  useEffect(() => {
    if (!tenantId || promotions.length === 0) return;
    const now = new Date();
    const updates: { id: string; status: PromotionStatus }[] = [];

    promotions.forEach((p) => {
      const start = new Date(p.start_date);
      const end = new Date(p.end_date);
      if (p.status === 'scheduled' && now >= start && now <= end) {
        updates.push({ id: p.id, status: 'active' });
      } else if (p.status === 'active' && now > end) {
        updates.push({ id: p.id, status: 'ended' });
      }
    });

    if (updates.length > 0) {
      const supabase = createClient();
      Promise.all(
        updates.map((u) => supabase.from('promotions').update({ status: u.status }).eq('id', u.id))
      ).then(() => loadData());
    }
  }, [promotions, tenantId, loadData]);

  const filtered = promotions.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    return true;
  });

  const activeCount = promotions.filter((p) => p.status === 'active').length;
  const scheduledCount = promotions.filter((p) => p.status === 'scheduled').length;

  // Total markdown loss: sum of (original_price - sale_price) for active promos
  const totalMarkdownLoss = promotions
    .filter((p) => p.status === 'active' || p.status === 'ended')
    .reduce((sum, p) => sum + (p.original_price - p.sale_price), 0);

  const avgDiscount = promotions.length > 0
    ? promotions.reduce((sum, p) => {
        const pct = p.original_price > 0 ? ((p.original_price - p.sale_price) / p.original_price) * 100 : 0;
        return sum + pct;
      }, 0) / promotions.length
    : 0;

  const handleCreate = async () => {
    if (!tenantId || !user || !form.product_id || !form.name || !form.sale_price || !form.start_date || !form.end_date) {
      toast.error('Fill all required fields');
      return;
    }

    const product = products.find((p) => p.id === form.product_id);
    if (!product) return;

    setSaving(true);
    const supabase = createClient();

    const now = new Date();
    const start = new Date(form.start_date);
    const end = new Date(form.end_date);
    let status: PromotionStatus = 'scheduled';
    if (now >= start && now <= end) status = 'active';
    else if (now > end) status = 'ended';

    const { error } = await supabase.from('promotions').insert({
      tenant_id: tenantId,
      product_id: form.product_id,
      name: form.name,
      sale_price: parseFloat(form.sale_price),
      original_price: product.price,
      start_date: form.start_date,
      end_date: form.end_date,
      status,
      notes: form.notes || null,
      created_by: user.id,
    });

    setSaving(false);

    if (error) {
      toast.error('Failed to create promotion');
    } else {
      toast.success('Promotion created');
      setCreateOpen(false);
      setForm({ product_id: '', name: '', sale_price: '', start_date: '', end_date: '', notes: '' });
      loadData();
    }
  };

  const handleCancel = async (promoId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('promotions')
      .update({ status: 'cancelled' })
      .eq('id', promoId);

    if (error) toast.error('Failed to cancel');
    else { toast.success('Promotion cancelled'); loadData(); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Promotions & Sales"
        description="Schedule sales, track markdowns, and monitor promotion performance"
        actions={
          isManager ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Promotion
            </Button>
          ) : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Active Sales" value={activeCount} icon={Tag} className={activeCount > 0 ? 'border-green-500/50' : ''} />
        <StatCard title="Scheduled" value={scheduledCount} icon={Calendar} />
        <StatCard title="Avg Discount" value={`${avgDiscount.toFixed(1)}%`} icon={Percent} />
        <StatCard title="Total Markdown" value={formatCurrency(totalMarkdownLoss)} icon={TrendingDown} description="Price reduction total" />
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="ended">Ended</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Promotions table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No promotions</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first sale to get started</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promotion</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Original</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  {isManager && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const product = p.product as unknown as { name: string; sku: string } | null;
                  const discountPct = p.original_price > 0
                    ? (((p.original_price - p.sale_price) / p.original_price) * 100).toFixed(0)
                    : '0';
                  const badge = STATUS_BADGES[p.status];

                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          {p.notes && <p className="text-xs text-muted-foreground line-clamp-1">{p.notes}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm">{product?.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{product?.sku}</p>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground line-through">
                        {formatCurrency(p.original_price)}
                      </TableCell>
                      <TableCell className="text-right font-bold text-green-600">
                        {formatCurrency(p.sale_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                          -{discountPct}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <p>{formatDate(p.start_date)}</p>
                          <p className="text-muted-foreground">to {formatDate(p.end_date)}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={badge.className}>{badge.label}</Badge>
                      </TableCell>
                      {isManager && (
                        <TableCell>
                          {(p.status === 'active' || p.status === 'scheduled') && (
                            <Button variant="ghost" size="sm" onClick={() => handleCancel(p.id)} className="h-8 w-8 p-0">
                              <XCircle className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Promotion Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Promotion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Product *</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm((p) => ({ ...p, product_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map((prod) => (
                    <SelectItem key={prod.id} value={prod.id}>
                      {prod.name} ({prod.sku}) — {formatCurrency(prod.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Promotion Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Summer Sale, BOGO, Clearance"
              />
            </div>
            <div className="space-y-2">
              <Label>Sale Price *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.sale_price}
                onChange={(e) => setForm((p) => ({ ...p, sale_price: e.target.value }))}
                placeholder="0.00"
              />
              {form.product_id && form.sale_price && (
                <p className="text-xs text-muted-foreground">
                  Original: {formatCurrency(products.find((p) => p.id === form.product_id)?.price || 0)} — Discount:{' '}
                  {(() => {
                    const orig = products.find((p) => p.id === form.product_id)?.price || 0;
                    const sale = parseFloat(form.sale_price) || 0;
                    return orig > 0 ? `${(((orig - sale) / orig) * 100).toFixed(1)}%` : '0%';
                  })()}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date *</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date *</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Optional notes about this promotion"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Creating...' : 'Create Promotion'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
