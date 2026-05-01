'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { TransferDialog } from './transfer-dialog';
import type { Transfer, TransferLine, TransferStatus } from '@/types/database';

type TransferWithDetails = Transfer & {
  from_location: { name: string } | null;
  to_location: { name: string } | null;
  lines: TransferLine[];
};

const statusColors: Record<TransferStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline',
  in_transit: 'secondary',
  received: 'default',
  cancelled: 'destructive',
};

export default function TransfersPage() {
  const { tenantId } = useAuth();
  const [transfers, setTransfers] = useState<TransferWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTransfer, setEditTransfer] = useState<TransferWithDetails | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadTransfers = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    let query = supabase
      .from('transfers')
      .select('*, from_location:locations!transfers_from_location_id_fkey(name), to_location:locations!transfers_to_location_id_fkey(name), lines:transfer_lines(*, product:products(name, sku), lot:lots(lot_number))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    setTransfers((data as TransferWithDetails[]) || []);
    setLoading(false);
  }, [tenantId, statusFilter]);

  useEffect(() => {
    loadTransfers();
  }, [loadTransfers]);

  const columns: Column<TransferWithDetails>[] = [
    { key: 'transfer_number', label: 'Transfer #', sortable: true },
    {
      key: 'from_location_id',
      label: 'From',
      render: (row) => row.from_location?.name || '—',
    },
    {
      key: 'to_location_id',
      label: 'To',
      render: (row) => row.to_location?.name || '—',
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <Badge variant={statusColors[row.status]}>
          {row.status.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Badge>
      ),
    },
    {
      key: 'created_at',
      label: 'Date',
      sortable: true,
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'lines',
      label: 'Items',
      render: (row) => (
        <span className="text-sm">{row.lines?.length || 0} item{(row.lines?.length || 0) !== 1 ? 's' : ''}</span>
      ),
    },
  ];

  const filterActions = (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="w-[150px]">
        <SelectValue placeholder="All statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Statuses</SelectItem>
        <SelectItem value="pending">Pending</SelectItem>
        <SelectItem value="in_transit">In Transit</SelectItem>
        <SelectItem value="received">Received</SelectItem>
        <SelectItem value="cancelled">Cancelled</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        description="Manage inter-location inventory transfers"
        actions={
          <Button onClick={() => { setEditTransfer(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Transfer
          </Button>
        }
      />

      <DataTable
        data={transfers}
        columns={columns}
        searchKey="transfer_number"
        searchPlaceholder="Search transfers..."
        onRowClick={(row) => { setEditTransfer(row); setDialogOpen(true); }}
        emptyMessage={loading ? 'Loading...' : 'No transfers found.'}
        actions={filterActions}
      />

      <TransferDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transfer={editTransfer}
        onSaved={loadTransfers}
      />
    </div>
  );
}
