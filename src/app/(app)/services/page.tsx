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
import { Switch } from '@/components/ui/switch';
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
import { toast } from 'sonner';
import { Plus, Wrench, Pencil } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { ServiceItem } from '@/types/database';

export default function ServicesPage() {
  const { tenantId, role } = useAuth();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '', description: '', default_price: '', estimated_minutes: '', is_active: true,
  });

  const isManager = role === 'admin' || role === 'manager';

  const loadServices = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('service_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name');
    setServices(data || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { loadServices(); }, [loadServices]);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', description: '', default_price: '', estimated_minutes: '', is_active: true });
    setDialogOpen(true);
  };

  const openEdit = (s: ServiceItem) => {
    setEditId(s.id);
    setForm({
      name: s.name,
      description: s.description || '',
      default_price: String(s.default_price),
      estimated_minutes: s.estimated_minutes ? String(s.estimated_minutes) : '',
      is_active: s.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!tenantId || !form.name || !form.default_price) {
      toast.error('Name and price are required');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const row = {
      tenant_id: tenantId,
      name: form.name,
      description: form.description || null,
      default_price: parseFloat(form.default_price),
      estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
      is_active: form.is_active,
    };

    if (editId) {
      const { error } = await supabase.from('service_items').update(row).eq('id', editId);
      if (error) toast.error('Failed to update'); else toast.success('Service updated');
    } else {
      const { error } = await supabase.from('service_items').insert(row);
      if (error) toast.error('Failed to create'); else toast.success('Service created');
    }

    setSaving(false);
    setDialogOpen(false);
    loadServices();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services"
        description="Define reusable labor and service items for work orders"
        actions={
          isManager ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" /> Add Service
            </Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : services.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No services defined</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your labor and service items — these get added to work orders
              </p>
              {isManager && (
                <Button onClick={openCreate} variant="outline" className="mt-4">
                  <Plus className="h-4 w-4 mr-2" /> Add First Service
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Est. Time</TableHead>
                  <TableHead>Status</TableHead>
                  {isManager && <TableHead className="w-12"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s) => (
                  <TableRow key={s.id} className={!s.is_active ? 'opacity-50' : ''}>
                    <TableCell>
                      <p className="font-medium text-sm">{s.name}</p>
                      {s.description && <p className="text-xs text-muted-foreground line-clamp-1">{s.description}</p>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(s.default_price)}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {s.estimated_minutes ? `${s.estimated_minutes} min` : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.is_active ? 'default' : 'secondary'}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    {isManager && (
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Service' : 'Add Service'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Service Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g., Mount & Balance, Oil Change, Alignment" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="What's included in this service" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Default Price *</Label>
                <Input type="number" step="0.01" min="0" value={form.default_price} onChange={(e) => setForm((p) => ({ ...p, default_price: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Est. Minutes</Label>
                <Input type="number" min="0" value={form.estimated_minutes} onChange={(e) => setForm((p) => ({ ...p, estimated_minutes: e.target.value }))} placeholder="30" />
              </div>
            </div>
            {editId && (
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
