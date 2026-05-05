'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { AlertTriangle, ShoppingCart, Package, TrendingDown, Zap } from 'lucide-react';
import { formatNumber, formatCurrency } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type { Product, Supplier } from '@/types/database';

interface ReorderItem {
  product: Product;
  supplier: Supplier | null;
  currentStock: number;
  reorderPoint: number;
  suggestedQty: number;
  leadTimeDays: number;
  daysOfSupply: number | null;
  selected: boolean;
}

export default function ReorderPage() {
  const { user, tenantId } = useAuth();
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    // Get all active products
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false);

    if (!products) { setLoading(false); return; }

    // Get suppliers
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId);

    const supplierMap = new Map((suppliers || []).map((s) => [s.id, s]));

    // Get active lots for stock calculation
    const { data: lots } = await supabase
      .from('lots')
      .select('product_id, quantity_on_hand')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const stockMap = new Map<string, number>();
    (lots || []).forEach((l) => {
      stockMap.set(l.product_id, (stockMap.get(l.product_id) || 0) + l.quantity_on_hand);
    });

    // Get recent outbound movements for velocity (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: movements } = await supabase
      .from('stock_movements')
      .select('product_id, quantity')
      .eq('tenant_id', tenantId)
      .eq('movement_type', 'ship')
      .gte('created_at', ninetyDaysAgo.toISOString());

    const velocityMap = new Map<string, number>();
    (movements || []).forEach((m) => {
      const absQty = Math.abs(m.quantity);
      velocityMap.set(m.product_id, (velocityMap.get(m.product_id) || 0) + absQty);
    });

    // Build reorder items
    const reorderItems: ReorderItem[] = [];

    for (const product of products) {
      const currentStock = stockMap.get(product.id) || 0;
      const reorderPoint = product.reorder_point ?? product.low_stock_threshold;

      if (currentStock > reorderPoint) continue;

      const suggestedQty = product.reorder_quantity
        || (product.par_level_max ? Math.max(0, product.par_level_max - currentStock) : reorderPoint * 2);

      const totalShipped = velocityMap.get(product.id) || 0;
      const dailyVelocity = totalShipped / 90;
      const daysOfSupply = dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : null;

      reorderItems.push({
        product,
        supplier: product.supplier_id ? supplierMap.get(product.supplier_id) || null : null,
        currentStock,
        reorderPoint,
        suggestedQty,
        leadTimeDays: product.lead_time_days || 0,
        daysOfSupply,
        selected: false,
      });
    }

    // Sort by urgency: lowest days of supply first, then by stock ratio
    reorderItems.sort((a, b) => {
      if (a.daysOfSupply !== null && b.daysOfSupply !== null) {
        return a.daysOfSupply - b.daysOfSupply;
      }
      if (a.daysOfSupply !== null) return -1;
      if (b.daysOfSupply !== null) return 1;
      return (a.currentStock / a.reorderPoint) - (b.currentStock / b.reorderPoint);
    });

    setItems(reorderItems);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleItem(index: number) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  }

  function selectAll() {
    const allSelected = items.every((i) => i.selected);
    setItems((prev) => prev.map((item) => ({ ...item, selected: !allSelected })));
  }

  async function generatePOs() {
    if (!tenantId || !user) return;
    const selected = items.filter((i) => i.selected);
    if (selected.length === 0) {
      toast.error('Select at least one item');
      return;
    }

    setGenerating(true);
    const supabase = createClient();

    // Group by supplier
    const bySupplier = new Map<string, ReorderItem[]>();
    const noSupplier: ReorderItem[] = [];

    for (const item of selected) {
      if (item.supplier) {
        const existing = bySupplier.get(item.supplier.id) || [];
        existing.push(item);
        bySupplier.set(item.supplier.id, existing);
      } else {
        noSupplier.push(item);
      }
    }

    if (noSupplier.length > 0) {
      toast.error(`${noSupplier.length} item(s) have no supplier assigned. Assign suppliers first.`);
      setGenerating(false);
      return;
    }

    let created = 0;
    for (const [supplierId, supplierItems] of Array.from(bySupplier.entries())) {
      const poNumber = `PO-${Date.now()}-${created + 1}`;
      const totalAmount = supplierItems.reduce(
        (sum, item) => sum + item.suggestedQty * item.product.cost,
        0
      );

      const { data: po, error } = await supabase
        .from('purchase_orders')
        .insert({
          tenant_id: tenantId,
          po_number: poNumber,
          supplier_id: supplierId,
          status: 'draft',
          order_date: new Date().toISOString().split('T')[0],
          total_amount: totalAmount,
          created_by: user.id,
        })
        .select()
        .single();

      if (error || !po) {
        toast.error(`Failed to create PO for supplier`);
        continue;
      }

      // Add lines
      await supabase.from('po_lines').insert(
        supplierItems.map((item) => ({
          tenant_id: tenantId,
          po_id: po.id,
          product_id: item.product.id,
          quantity_ordered: item.suggestedQty,
          quantity_received: 0,
          unit_cost: item.product.cost,
        }))
      );

      created++;
    }

    toast.success(`Created ${created} draft purchase order(s)`);
    setGenerating(false);
    // Deselect all
    setItems((prev) => prev.map((item) => ({ ...item, selected: false })));
  }

  // Auto-generate POs for ALL items and send to vendors
  async function autoGenerateAndSend() {
    if (!tenantId || !user || items.length === 0) return;
    setGenerating(true);

    // Select all items
    const allItems = items.filter((i) => i.supplier);
    if (allItems.length === 0) {
      toast.error('No items with assigned suppliers');
      setGenerating(false);
      return;
    }

    const supabase = createClient();

    // Group by supplier
    const bySupplier = new Map<string, ReorderItem[]>();
    for (const item of allItems) {
      const sid = item.supplier!.id;
      const existing = bySupplier.get(sid) || [];
      existing.push(item);
      bySupplier.set(sid, existing);
    }

    let created = 0;
    let sent = 0;

    for (const [supplierId, supplierItems] of Array.from(bySupplier.entries())) {
      const poNumber = `PO-AUTO-${Date.now().toString(36).toUpperCase()}-${created + 1}`;
      const totalAmount = supplierItems.reduce((sum, item) => sum + item.suggestedQty * item.product.cost, 0);

      const { data: po, error } = await supabase
        .from('purchase_orders')
        .insert({
          tenant_id: tenantId,
          po_number: poNumber,
          supplier_id: supplierId,
          status: 'draft',
          order_date: new Date().toISOString().split('T')[0],
          expected_date: new Date(Date.now() + (supplierItems[0].leadTimeDays || 7) * 86400000).toISOString().split('T')[0],
          total_amount: totalAmount,
          created_by: user.id,
        })
        .select()
        .single();

      if (error || !po) continue;

      await supabase.from('po_lines').insert(
        supplierItems.map((item) => ({
          tenant_id: tenantId,
          po_id: po.id,
          product_id: item.product.id,
          quantity_ordered: item.suggestedQty,
          quantity_received: 0,
          unit_cost: item.product.cost,
        }))
      );

      created++;

      // Send to vendor
      const sendRes = await fetch('/api/po/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ po_id: po.id }),
      });
      if (sendRes.ok) sent++;
    }

    toast.success(`Created ${created} POs, sent ${sent} to vendors`);
    setGenerating(false);
    setItems((prev) => prev.map((item) => ({ ...item, selected: false })));
  }

  const selectedCount = items.filter((i) => i.selected).length;
  const criticalCount = items.filter((i) => i.currentStock === 0).length;

  const columns: Column<ReorderItem>[] = [
    {
      key: 'select',
      label: '',
      render: (row) => {
        const idx = items.indexOf(row);
        return (
          <Checkbox
            checked={row.selected}
            onCheckedChange={() => toggleItem(idx)}
          />
        );
      },
    },
    {
      key: 'product_name',
      label: 'Product',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.product.name}</div>
          <div className="text-xs text-muted-foreground">{row.product.sku}</div>
        </div>
      ),
    },
    {
      key: 'currentStock',
      label: 'Current Stock',
      sortable: true,
      render: (row) => (
        <span className={row.currentStock === 0 ? 'text-destructive font-bold' : row.currentStock <= row.reorderPoint ? 'text-amber-600 font-medium' : ''}>
          {formatNumber(row.currentStock)} {row.product.unit_of_measure}
        </span>
      ),
    },
    {
      key: 'reorderPoint',
      label: 'Reorder Point',
      sortable: true,
      render: (row) => formatNumber(row.reorderPoint),
    },
    {
      key: 'suggestedQty',
      label: 'Suggested Qty',
      sortable: true,
      render: (row) => (
        <span className="font-medium">{formatNumber(row.suggestedQty)}</span>
      ),
    },
    {
      key: 'supplier_name',
      label: 'Supplier',
      render: (row) => row.supplier?.name || <Badge variant="outline">Unassigned</Badge>,
    },
    {
      key: 'leadTimeDays',
      label: 'Lead Time',
      sortable: true,
      render: (row) => row.leadTimeDays > 0 ? `${row.leadTimeDays}d` : '—',
    },
    {
      key: 'daysOfSupply',
      label: 'Days of Supply',
      sortable: true,
      render: (row) => {
        if (row.daysOfSupply === null) return <span className="text-muted-foreground">N/A</span>;
        if (row.daysOfSupply === 0) return <Badge variant="destructive">0 days</Badge>;
        if (row.daysOfSupply <= 7) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{row.daysOfSupply}d</Badge>;
        return `${row.daysOfSupply}d`;
      },
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Reorder Management" />
        <div className="text-muted-foreground">Analyzing inventory levels...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Reorder Management"
        description="Products below reorder point that need restocking"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="default"
              onClick={autoGenerateAndSend}
              disabled={items.length === 0 || generating}
              className="bg-green-600 hover:bg-green-700"
            >
              <Zap className="mr-2 h-4 w-4" />
              {generating ? 'Processing...' : `Auto-Order All (${items.length})`}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                exportToCSV(
                  items.map((i) => ({
                    Product: i.product.name,
                    SKU: i.product.sku,
                    'Current Stock': i.currentStock,
                    'Reorder Point': i.reorderPoint,
                    'Suggested Qty': i.suggestedQty,
                    Supplier: i.supplier?.name || '',
                    'Lead Time': i.leadTimeDays,
                    'Days of Supply': i.daysOfSupply ?? '',
                  })),
                  'reorder_report'
                )
              }
            >
              Export CSV
            </Button>
            <Button onClick={generatePOs} disabled={selectedCount === 0 || generating}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              {generating ? 'Generating...' : `Generate PO (${selectedCount})`}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Items Below Reorder"
          value={items.length}
          icon={AlertTriangle}
          description="Products needing restock"
        />
        <StatCard
          title="Out of Stock"
          value={criticalCount}
          icon={Package}
          description="Zero inventory"
        />
        <StatCard
          title="Selected for PO"
          value={selectedCount}
          icon={ShoppingCart}
          description="Items to order"
        />
        <StatCard
          title="Estimated Cost"
          value={formatCurrency(
            items.filter((i) => i.selected).reduce((sum, i) => sum + i.suggestedQty * i.product.cost, 0)
          )}
          icon={TrendingDown}
          description="For selected items"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Reorder Items</CardTitle>
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {items.every((i) => i.selected) ? 'Deselect All' : 'Select All'}
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            data={items}
            columns={columns}
            searchKey="product_name"
            searchPlaceholder="Search products..."
            emptyMessage="All products are adequately stocked."
          />
        </CardContent>
      </Card>
    </div>
  );
}
