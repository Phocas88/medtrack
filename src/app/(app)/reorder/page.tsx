'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { allRows } from '@/lib/all-rows';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { AlertTriangle, ShoppingCart, Package, TrendingDown } from 'lucide-react';
import { formatNumber, formatCurrency } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type { Product, Supplier } from '@/types/database';

type Projection = { product_id: string; eligible_stock: number; open_demand: number; due_inbound: number; daily_sales: number; lead_days: number };

interface ReorderItem {
  product: Product;
  supplier: Supplier | null;
  currentStock: number;
  openDemand: number;
  inbound: number;
  projectedStock: number;
  reorderPoint: number;
  suggestedQty: number;
  leadTimeDays: number;
  daysOfSupply: number | null;
  selected: boolean;
}

export default function ReorderPage() {
  const { tenantId } = useAuth();
  const [items, setItems] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [planningError, setPlanningError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const draft = useRef<{ id: string; fingerprint: string }>(undefined);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const inputs = await Promise.all([
      allRows<Product>((from, to) => supabase.from('products').select('*')
        .eq('tenant_id', tenantId).eq('is_archived', false).order('id').range(from, to)),
      allRows<Supplier>((from, to) => supabase.from('suppliers').select('*')
        .eq('tenant_id', tenantId).eq('is_archived', false).order('id').range(from, to)),
      allRows<Projection>((from, to) => supabase.rpc('purchase_projection').order('product_id').range(from, to)),
    ]).catch(() => null);
    if (!inputs) { setItems([]); setPlanningError(true); setLoading(false); return; }
    setPlanningError(false);
    const [products, suppliers, projections] = inputs;
    const supplierMap = new Map(suppliers.map(supplier => [supplier.id, supplier]));
    const projection = new Map(projections.map(row => [row.product_id, row]));

    // Build reorder items
    const reorderItems: ReorderItem[] = [];

    for (const product of products) {
      const position = projection.get(product.id);
      if (!position) continue;
      const currentStock = Number(position.eligible_stock);
      const openDemand = Number(position.open_demand);
      const inbound = Number(position.due_inbound);
      const leadTimeDays = Number(position.lead_days);
      const dailyVelocity = Number(position.daily_sales);
      // Open demand and historical run-rate can refer to the same sales. Use the higher figure.
      const horizonDemand = Math.max(openDemand, Math.ceil(dailyVelocity * leadTimeDays));
      const projectedStock = currentStock + inbound - horizonDemand;
      const configuredMinimum = product.par_level_min ?? product.reorder_point ?? product.low_stock_threshold ?? 0;
      const reorderPoint = product.par_level_max == null ? configuredMinimum : Math.min(configuredMinimum, product.par_level_max);
      if (projectedStock > reorderPoint) continue;
      const target = product.par_level_max ?? reorderPoint;
      const suggestedQty = product.par_level_max == null
        ? Math.max(product.reorder_quantity || 0, target - projectedStock)
        : Math.max(0, target - projectedStock);
      if (suggestedQty <= 0) continue;
      const daysOfSupply = dailyVelocity > 0 ? Math.floor(currentStock / dailyVelocity) : null;

      reorderItems.push({
        product,
        supplier: product.supplier_id ? supplierMap.get(product.supplier_id) || null : null,
        currentStock,
        openDemand,
        inbound,
        projectedStock,
        reorderPoint,
        suggestedQty,
        leadTimeDays,
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
      return a.projectedStock - b.projectedStock;
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
    if (!tenantId || generating) return;
    const rows = items.filter(item => item.selected).map(item => ({ product_id: item.product.id, quantity: item.suggestedQty }));
    if (!rows.length) return;
    const fingerprint = JSON.stringify(rows);
    if (draft.current?.fingerprint !== fingerprint) draft.current = { id: crypto.randomUUID(), fingerprint };
    setGenerating(true);
    try {
      const { data, error } = await createClient().rpc('create_projected_draft_pos', {
        p_request: draft.current.id, p_rows: rows,
      });
      if (error) toast.error(error.message);
      else {
        toast.success(`Created ${data} draft purchase order(s). Review and send them in Purchase Orders.`);
        draft.current = undefined;
        setItems(previous => previous.map(item => ({ ...item, selected: false })));
      }
    } catch {
      toast.error('Unable to confirm draft creation. Retry the same selection.');
    } finally {
      setGenerating(false);
    }
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
    { key: 'openDemand', label: 'Open demand', render: row => formatNumber(row.openDemand) },
    { key: 'inbound', label: 'Due within lead time', render: row => formatNumber(row.inbound) },
    { key: 'projectedStock', label: 'Projected stock', render: row => formatNumber(row.projectedStock) },
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
      {planningError && <p role="alert" className="text-destructive">Purchasing projections are unavailable. Refresh to try again.</p>}
      <p className="text-sm text-muted-foreground">Projected stock uses eligible inventory plus sent or partially received POs due within lead time, less the higher of open order demand or recent shipping demand over that window.</p>
      <PageHeader
        title="Reorder Management"
        description="Products below reorder point that need restocking"
        actions={
          <div className="flex gap-2 flex-wrap">

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
