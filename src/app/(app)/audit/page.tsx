'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Download,
  Activity,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Clock,
} from 'lucide-react';
import { formatDateTime, formatNumber, movementTypeLabel } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import type { StockMovement, MovementType } from '@/types/database';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

interface SnapshotRow {
  product_name: string;
  sku: string;
  total_quantity: number;
}

export default function AuditPage() {
  const { tenantId } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all');
  const [productFilter, setProductFilter] = useState('all');
  const [products, setProducts] = useState<ProductOption[]>([]);

  // Time travel
  const [snapshotDate, setSnapshotDate] = useState('');
  const [snapshot, setSnapshot] = useState<SnapshotRow[]>([]);
  const [snapshotLoading, setSnapshotLoading] = useState(false);

  // Load products for filter dropdown
  useEffect(() => {
    async function loadProducts() {
      if (!tenantId) return;
      const supabase = createClient();
      const { data } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('tenant_id', tenantId)
        .order('name');
      setProducts((data as ProductOption[]) || []);
    }
    loadProducts();
  }, [tenantId]);

  // Load movements
  useEffect(() => {
    async function loadMovements() {
      if (!tenantId) return;
      setLoading(true);
      const supabase = createClient();
      let query = supabase
        .from('stock_movements')
        .select('*, product:products(name, sku), lot:lots(lot_number), user:users(full_name)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (typeFilter !== 'all') query = query.eq('movement_type', typeFilter);
      if (productFilter !== 'all') query = query.eq('product_id', productFilter);
      if (dateFrom) query = query.gte('created_at', dateFrom);
      if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

      const { data } = await query;
      setMovements((data as unknown as StockMovement[]) || []);
      setLoading(false);
    }
    loadMovements();
  }, [tenantId, typeFilter, productFilter, dateFrom, dateTo]);

  // Stats
  const stats = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let today = 0;
    let thisWeek = 0;
    let thisMonth = 0;

    movements.forEach((m) => {
      const d = m.created_at;
      if (d >= startOfToday) today++;
      if (d >= startOfWeek.toISOString()) thisWeek++;
      if (d >= startOfMonth) thisMonth++;
    });

    return { today, thisWeek, thisMonth };
  }, [movements]);

  // Time travel snapshot
  async function generateSnapshot() {
    if (!tenantId || !snapshotDate) return;
    setSnapshotLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('stock_movements')
      .select('product_id, quantity, product:products(name, sku)')
      .eq('tenant_id', tenantId)
      .lte('created_at', snapshotDate + 'T23:59:59');

    const grouped: Record<string, { product_name: string; sku: string; total_quantity: number }> = {};

    (data || []).forEach((m: Record<string, unknown>) => {
      const pid = m.product_id as string;
      const p = m.product as { name: string; sku: string } | null;
      if (!grouped[pid]) {
        grouped[pid] = {
          product_name: p?.name || '',
          sku: p?.sku || '',
          total_quantity: 0,
        };
      }
      grouped[pid].total_quantity += m.quantity as number;
    });

    setSnapshot(Object.values(grouped).sort((a, b) => a.product_name.localeCompare(b.product_name)));
    setSnapshotLoading(false);
  }

  function handleExport() {
    exportToCSV(
      movements.map((m) => ({
        date: formatDateTime(m.created_at),
        user: (m.user as unknown as { full_name: string })?.full_name || '',
        type: movementTypeLabel(m.movement_type),
        product: (m.product as unknown as { name: string })?.name || '',
        lot: (m.lot as unknown as { lot_number: string })?.lot_number || '',
        quantity: m.quantity,
        reference: m.reference_number || '',
        reason: m.reason || '',
      })),
      'audit_trail'
    );
  }

  const movementColors: Record<string, string> = {
    receive: 'text-green-600',
    ship: 'text-blue-600',
    adjust: 'text-amber-600',
    return: 'text-purple-600',
    expire: 'text-red-600',
    recall: 'text-red-700',
  };

  const columns: Column<StockMovement>[] = [
    {
      key: 'created_at',
      label: 'Date',
      render: (row) => <span className="text-xs">{formatDateTime(row.created_at)}</span>,
      sortable: true,
    },
    {
      key: 'user_id',
      label: 'User',
      render: (row) => (row.user as unknown as { full_name: string })?.full_name || '—',
    },
    {
      key: 'movement_type',
      label: 'Type',
      render: (row) => (
        <Badge variant="outline" className={movementColors[row.movement_type]}>
          {movementTypeLabel(row.movement_type)}
        </Badge>
      ),
    },
    {
      key: 'product_id',
      label: 'Product',
      render: (row) => {
        const p = row.product as unknown as { name: string; sku: string } | null;
        return p ? p.name : '—';
      },
    },
    {
      key: 'lot_id',
      label: 'Lot',
      render: (row) => (row.lot as unknown as { lot_number: string })?.lot_number || '—',
    },
    {
      key: 'quantity',
      label: 'Qty',
      render: (row) => (
        <span className={row.quantity > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
          {row.quantity > 0 ? '+' : ''}{row.quantity}
        </span>
      ),
    },
    { key: 'reference_number', label: 'Reference' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description="Comprehensive read-only audit log of all inventory movements"
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        }
      />

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Movements Today"
          value={formatNumber(stats.today)}
          icon={Activity}
        />
        <StatCard
          title="This Week"
          value={formatNumber(stats.thisWeek)}
          icon={CalendarDays}
        />
        <StatCard
          title="This Month"
          value={formatNumber(stats.thisMonth)}
          icon={CalendarRange}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as MovementType | 'all')}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="receive">Received</SelectItem>
              <SelectItem value="ship">Shipped</SelectItem>
              <SelectItem value="adjust">Adjusted</SelectItem>
              <SelectItem value="return">Returned</SelectItem>
              <SelectItem value="expire">Expired</SelectItem>
              <SelectItem value="recall">Recalled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Product</Label>
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        data={movements}
        columns={columns}
        searchKey="reference_number"
        searchPlaceholder="Search by reference..."
        emptyMessage={loading ? 'Loading...' : 'No movements found.'}
      />

      {/* Time Travel Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-5 w-5" />
            Time Travel - Inventory Snapshot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select a date to view a reconstructed inventory snapshot as of that point in time.
            Quantities are calculated by summing all movements up to the selected date.
          </p>
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Snapshot Date</Label>
              <Input
                type="date"
                value={snapshotDate}
                onChange={(e) => setSnapshotDate(e.target.value)}
                className="w-48"
              />
            </div>
            <Button
              onClick={generateSnapshot}
              disabled={!snapshotDate || snapshotLoading}
            >
              <Clock className="h-4 w-4 mr-2" />
              {snapshotLoading ? 'Calculating...' : 'Generate Snapshot'}
            </Button>
          </div>

          {snapshot.length > 0 && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Quantity on Hand</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshot.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{row.product_name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.sku}</TableCell>
                      <TableCell className="text-right">
                        <span className={row.total_quantity < 0 ? 'text-red-600' : ''}>
                          {formatNumber(row.total_quantity)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
