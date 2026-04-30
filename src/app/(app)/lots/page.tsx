'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ExpiryBadge } from '@/components/ui/expiry-badge';
import { LotStatusBadge } from '@/components/ui/lot-status-badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate, formatCurrency } from '@/lib/format';
import { LotDetailDialog } from './lot-detail-dialog';
import type { Lot, LotStatus } from '@/types/database';

export default function LotsPage() {
  const { tenantId } = useAuth();
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<LotStatus | 'all'>('active');
  const [selectedLot, setSelectedLot] = useState<Lot | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  async function loadLots() {
    if (!tenantId) return;
    const supabase = createClient();
    let query = supabase
      .from('lots')
      .select('*, product:products(name, sku, unit_of_measure), supplier:suppliers(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    setLots((data as unknown as Lot[]) || []);
    setLoading(false);
  }

  useEffect(() => { loadLots(); }, [tenantId, statusFilter]);

  const columns: Column<Lot>[] = [
    { key: 'lot_number', label: 'Lot #', sortable: true },
    {
      key: 'product_id',
      label: 'Product',
      render: (row) => {
        const p = row.product as unknown as { name: string; sku: string } | null;
        return p ? `${p.name} (${p.sku})` : '—';
      },
      sortable: true,
    },
    { key: 'quantity_on_hand', label: 'Qty', sortable: true },
    {
      key: 'expiration_date',
      label: 'Expiration',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span>{formatDate(row.expiration_date)}</span>
          <ExpiryBadge date={row.expiration_date} />
        </div>
      ),
      sortable: true,
    },
    { key: 'location', label: 'Location', sortable: true },
    {
      key: 'received_date',
      label: 'Received',
      render: (row) => formatDate(row.received_date),
      sortable: true,
    },
    {
      key: 'cost_at_receipt',
      label: 'Unit Cost',
      render: (row) => formatCurrency(row.cost_at_receipt),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <LotStatusBadge status={row.status} />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lots"
        description="View and manage inventory lots"
        actions={
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as LotStatus | 'all')}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="recalled">Recalled</SelectItem>
              <SelectItem value="depleted">Depleted</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <DataTable
        data={lots}
        columns={columns}
        searchKey="lot_number"
        searchPlaceholder="Search by lot number..."
        onRowClick={(row) => { setSelectedLot(row); setDetailOpen(true); }}
        emptyMessage={loading ? 'Loading...' : 'No lots found.'}
      />

      <LotDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lot={selectedLot}
        onUpdated={loadLots}
      />
    </div>
  );
}
