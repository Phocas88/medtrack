'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
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
import { Download } from 'lucide-react';
import { formatDateTime, movementTypeLabel } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import type { StockMovement, MovementType } from '@/types/database';

export default function MovementsPage() {
  const { tenantId } = useAuth();
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<MovementType | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  async function loadMovements() {
    if (!tenantId) return;
    const supabase = createClient();
    let query = supabase
      .from('stock_movements')
      .select('*, product:products(name, sku), lot:lots(lot_number), user:users(full_name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (typeFilter !== 'all') query = query.eq('movement_type', typeFilter);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    const { data } = await query;
    setMovements((data as unknown as StockMovement[]) || []);
    setLoading(false);
  }

  useEffect(() => { loadMovements(); }, [tenantId, typeFilter, dateFrom, dateTo]);

  function handleExport() {
    exportToCSV(
      movements.map((m) => ({
        date: formatDateTime(m.created_at),
        type: movementTypeLabel(m.movement_type),
        product: (m.product as unknown as { name: string })?.name || '',
        sku: (m.product as unknown as { sku: string })?.sku || '',
        lot: (m.lot as unknown as { lot_number: string })?.lot_number || '',
        quantity: m.quantity,
        user: (m.user as unknown as { full_name: string })?.full_name || '',
        reason: m.reason || '',
        reference: m.reference_number || '',
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
        return p ? `${p.name}` : '—';
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
    {
      key: 'user_id',
      label: 'User',
      render: (row) => (row.user as unknown as { full_name: string })?.full_name || '—',
    },
    { key: 'reason', label: 'Reason' },
    { key: 'reference_number', label: 'Reference' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Movements"
        description="Immutable audit trail of all inventory changes"
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-4 items-end">
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
          <Label className="text-xs">From</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        </div>
      </div>

      <DataTable
        data={movements}
        columns={columns}
        searchKey="reference_number"
        searchPlaceholder="Search by reference..."
        emptyMessage={loading ? 'Loading...' : 'No movements found.'}
      />
    </div>
  );
}
