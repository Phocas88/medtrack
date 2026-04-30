'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { SupplierDialog } from './supplier-dialog';
import type { Supplier } from '@/types/database';

export default function SuppliersPage() {
  const { tenantId } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  async function loadSuppliers() {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('suppliers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name');
    setSuppliers(data || []);
    setLoading(false);
  }

  useEffect(() => { loadSuppliers(); }, [tenantId]);

  const columns: Column<Supplier>[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'contact_name', label: 'Contact' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'account_number', label: 'Account #' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Manage supplier records"
        actions={
          <Button onClick={() => { setEditSupplier(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Supplier
          </Button>
        }
      />
      <DataTable
        data={suppliers}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Search suppliers..."
        onRowClick={(row) => { setEditSupplier(row); setDialogOpen(true); }}
        emptyMessage={loading ? 'Loading...' : 'No suppliers found.'}
      />
      <SupplierDialog open={dialogOpen} onOpenChange={setDialogOpen} supplier={editSupplier} onSaved={loadSuppliers} />
    </div>
  );
}
