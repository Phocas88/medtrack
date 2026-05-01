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
import { CountDialog } from './count-dialog';
import type { CycleCount, CycleCountLine, CountStatus } from '@/types/database';

type CountWithDetails = CycleCount & {
  location: { name: string } | null;
  lines: CycleCountLine[];
};

const statusColors: Record<CountStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  planned: 'outline',
  in_progress: 'secondary',
  pending_review: 'secondary',
  approved: 'default',
  cancelled: 'destructive',
};

export default function CycleCountsPage() {
  const { tenantId } = useAuth();
  const [counts, setCounts] = useState<CountWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCount, setEditCount] = useState<CountWithDetails | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadCounts = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    let query = supabase
      .from('cycle_counts')
      .select('*, location:locations(name), lines:cycle_count_lines(*, product:products(name, sku), lot:lots(lot_number))')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    setCounts((data as CountWithDetails[]) || []);
    setLoading(false);
  }, [tenantId, statusFilter]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  function varianceSummary(lines: CycleCountLine[]): string {
    if (!lines || lines.length === 0) return '—';
    const counted = lines.filter((l) => l.counted_quantity !== null);
    if (counted.length === 0) return 'Not started';
    const variances = counted.filter((l) => l.variance !== null && l.variance !== 0);
    const totalVar = variances.reduce((sum, l) => sum + Math.abs(l.variance || 0), 0);
    if (variances.length === 0) return 'No variance';
    return `${variances.length} line${variances.length !== 1 ? 's' : ''}, ${totalVar} unit${totalVar !== 1 ? 's' : ''}`;
  }

  const columns: Column<CountWithDetails>[] = [
    { key: 'count_number', label: 'Count #', sortable: true },
    {
      key: 'location_id',
      label: 'Location',
      render: (row) => row.location?.name || '—',
    },
    {
      key: 'count_type',
      label: 'Type',
      render: (row) => <span className="capitalize">{row.count_type}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <Badge variant={statusColors[row.status]}>
          {row.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </Badge>
      ),
    },
    {
      key: 'planned_date',
      label: 'Planned Date',
      sortable: true,
      render: (row) => formatDate(row.planned_date),
    },
    {
      key: 'lines',
      label: 'Variance',
      render: (row) => {
        const summary = varianceSummary(row.lines);
        const hasVariance = summary !== 'No variance' && summary !== 'Not started' && summary !== '—';
        return (
          <span className={hasVariance ? 'text-destructive font-medium text-sm' : 'text-sm text-muted-foreground'}>
            {summary}
          </span>
        );
      },
    },
  ];

  const filterActions = (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className="w-[160px]">
        <SelectValue placeholder="All statuses" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Statuses</SelectItem>
        <SelectItem value="planned">Planned</SelectItem>
        <SelectItem value="in_progress">In Progress</SelectItem>
        <SelectItem value="pending_review">Pending Review</SelectItem>
        <SelectItem value="approved">Approved</SelectItem>
        <SelectItem value="cancelled">Cancelled</SelectItem>
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cycle Counts"
        description="Manage inventory cycle counts and adjustments"
        actions={
          <Button onClick={() => { setEditCount(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Count
          </Button>
        }
      />

      <DataTable
        data={counts}
        columns={columns}
        searchKey="count_number"
        searchPlaceholder="Search cycle counts..."
        onRowClick={(row) => { setEditCount(row); setDialogOpen(true); }}
        emptyMessage={loading ? 'Loading...' : 'No cycle counts found.'}
        actions={filterActions}
      />

      <CountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        cycleCount={editCount}
        onSaved={loadCounts}
      />
    </div>
  );
}
