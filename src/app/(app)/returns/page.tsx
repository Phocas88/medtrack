'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RotateCcw, Plus } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/format';
import { ReturnDialog } from './return-dialog';
import type { Return, ReturnStatus } from '@/types/database';

function statusBadge(status: ReturnStatus) {
  const variants: Record<ReturnStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'outline',
    inspecting: 'secondary',
    completed: 'default',
    cancelled: 'destructive',
  };
  return (
    <Badge variant={variants[status]}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function dispositionLabel(d: string | null): string {
  if (!d) return '--';
  switch (d) {
    case 'restock': return 'Restock';
    case 'quarantine': return 'Quarantine';
    case 'destroy': return 'Destroy';
    case 'return_to_supplier': return 'Return to Supplier';
    default: return d;
  }
}

export default function ReturnsPage() {
  const { tenantId } = useAuth();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadReturns = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('returns')
      .select('*, customer:customers(name), supplier:suppliers(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setReturns((data as Return[]) || []);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadReturns();
  }, [loadReturns]);

  const filteredReturns = returns.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    return true;
  });

  const customerReturns = filteredReturns.filter(
    (r) => r.return_type === 'customer_return'
  );
  const supplierRMAs = filteredReturns.filter(
    (r) => r.return_type === 'supplier_rma'
  );

  const columns: Column<Return>[] = [
    {
      key: 'return_number',
      label: 'Return #',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.return_number}</span>
      ),
    },
    {
      key: 'return_type',
      label: 'Type',
      render: (row) => (
        <Badge variant="outline">
          {row.return_type === 'customer_return' ? 'Customer' : 'Supplier RMA'}
        </Badge>
      ),
    },
    {
      key: 'entity_name',
      label: 'Customer / Supplier',
      render: (row) => {
        const cust = row.customer as unknown as { name: string } | null;
        const supp = row.supplier as unknown as { name: string } | null;
        return cust?.name || supp?.name || '--';
      },
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => statusBadge(row.status),
    },
    {
      key: 'disposition',
      label: 'Disposition',
      render: (row) => dispositionLabel(row.disposition),
    },
    {
      key: 'credit_amount',
      label: 'Credit',
      sortable: true,
      render: (row) => formatCurrency(row.credit_amount),
    },
    {
      key: 'created_at',
      label: 'Date',
      sortable: true,
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Process customer returns and supplier RMAs"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Return
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="inspecting">Inspecting</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="sm" onClick={loadReturns}>
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <Tabs defaultValue="customer">
        <TabsList>
          <TabsTrigger value="customer">
            Customer Returns ({customerReturns.length})
          </TabsTrigger>
          <TabsTrigger value="supplier">
            Supplier RMAs ({supplierRMAs.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="mt-4">
          <DataTable
            data={customerReturns}
            columns={columns}
            searchKey="return_number"
            searchPlaceholder="Search return #..."
            emptyMessage={
              loading ? 'Loading returns...' : 'No customer returns found.'
            }
          />
        </TabsContent>

        <TabsContent value="supplier" className="mt-4">
          <DataTable
            data={supplierRMAs}
            columns={columns}
            searchKey="return_number"
            searchPlaceholder="Search RMA #..."
            emptyMessage={
              loading ? 'Loading RMAs...' : 'No supplier RMAs found.'
            }
          />
        </TabsContent>
      </Tabs>

      <ReturnDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={loadReturns}
      />
    </div>
  );
}
