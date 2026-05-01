'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RotateCcw, ShieldAlert } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { QuarantineDialog } from './quarantine-dialog';
import type { QuarantineHold, QuarantineStatus } from '@/types/database';

type HoldRow = QuarantineHold & {
  product_name?: string;
  lot_number?: string;
  held_by_name?: string;
};

function statusBadge(status: QuarantineStatus) {
  const variants: Record<QuarantineStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    held: 'secondary',
    released: 'default',
    rejected: 'destructive',
    destroyed: 'destructive',
  };
  return (
    <Badge variant={variants[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

export default function QuarantinePage() {
  const { tenantId } = useAuth();
  const [holds, setHolds] = useState<HoldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedHold, setSelectedHold] = useState<HoldRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadHolds = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from('quarantine_holds')
      .select('*, product:products(name), lot:lots(lot_number)')
      .eq('tenant_id', tenantId)
      .order('held_at', { ascending: false });

    // Fetch user names for held_by ids
    const heldByIds = Array.from(new Set((data || []).map((r: Record<string, unknown>) => r.held_by).filter(Boolean))) as string[];
    let userMap: Record<string, string> = {};
    if (heldByIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', heldByIds);
      userMap = (users || []).reduce((acc: Record<string, string>, u: { id: string; full_name: string }) => {
        acc[u.id] = u.full_name;
        return acc;
      }, {});
    }

    const mapped: HoldRow[] = (data || []).map((row: Record<string, unknown>) => {
      const product = row.product as { name: string } | null;
      const lot = row.lot as { lot_number: string } | null;
      return {
        ...(row as unknown as QuarantineHold),
        product_name: product?.name || '',
        lot_number: lot?.lot_number || '',
        held_by_name: userMap[(row.held_by as string)] || '',
      };
    });

    setHolds(mapped);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadHolds();
  }, [loadHolds]);

  const filteredHolds = holds.filter((h) => {
    if (statusFilter !== 'all' && h.status !== statusFilter) return false;
    return true;
  });

  const columns: Column<HoldRow>[] = [
    {
      key: 'lot_number',
      label: 'Lot #',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs font-medium">
          {row.lot_number || '--'}
        </span>
      ),
    },
    {
      key: 'product_name',
      label: 'Product',
      sortable: true,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => statusBadge(row.status),
    },
    {
      key: 'reason',
      label: 'Reason',
      render: (row) => (
        <span className="max-w-[200px] truncate block">{row.reason}</span>
      ),
    },
    {
      key: 'quantity',
      label: 'Quantity',
      sortable: true,
    },
    {
      key: 'held_at',
      label: 'Held Date',
      sortable: true,
      render: (row) => formatDate(row.held_at),
    },
    {
      key: 'held_by_name',
      label: 'Held By',
    },
  ];

  function handleRowClick(row: HoldRow) {
    setSelectedHold(row);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quarantine Holds"
        description="Manage items held in quarantine pending inspection or disposition"
        actions={
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {holds.filter((h) => h.status === 'held').length} active holds
            </span>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="held">Held</SelectItem>
            <SelectItem value="released">Released</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="destroyed">Destroyed</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={loadHolds}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <DataTable
        data={filteredHolds}
        columns={columns}
        searchKey="product_name"
        searchPlaceholder="Search by product..."
        onRowClick={handleRowClick}
        emptyMessage={
          loading ? 'Loading quarantine holds...' : 'No quarantine holds found.'
        }
      />

      <QuarantineDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        hold={selectedHold}
        onUpdated={loadHolds}
      />
    </div>
  );
}
