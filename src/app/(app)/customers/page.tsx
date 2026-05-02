'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { formatDate, daysUntilExpiry } from '@/lib/format';
import { CustomerDialog } from './customer-dialog';
import { PortalInviteButton } from './portal-invite-button';
import type { Customer } from '@/types/database';

export default function CustomersPage() {
  const { tenantId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  async function loadCustomers() {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name');
    setCustomers(data || []);
    setLoading(false);
  }

  useEffect(() => { loadCustomers(); }, [tenantId]);

  const columns: Column<Customer>[] = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'contact_name', label: 'Contact', sortable: true },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'license_type', label: 'License Type' },
    { key: 'license_number', label: 'License #' },
    {
      key: 'id' as keyof Customer,
      label: 'Portal',
      render: (row) => (
        <PortalInviteButton
          customerId={row.id}
          customerEmail={row.email}
          customerName={row.name}
        />
      ),
    },
    {
      key: 'license_expiration',
      label: 'License Exp.',
      render: (row) => {
        const days = daysUntilExpiry(row.license_expiration);
        return (
          <div className="flex items-center gap-2">
            {formatDate(row.license_expiration)}
            {days !== null && days <= 30 && days >= 0 && (
              <Badge variant="destructive" className="text-xs">Expires soon</Badge>
            )}
            {days !== null && days < 0 && (
              <Badge variant="destructive" className="text-xs">Expired</Badge>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Manage customer records and licenses"
        actions={
          <Button onClick={() => { setEditCustomer(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Customer
          </Button>
        }
      />

      <DataTable
        data={customers}
        columns={columns}
        searchKey="name"
        searchPlaceholder="Search customers..."
        onRowClick={(row) => { setEditCustomer(row); setDialogOpen(true); }}
        emptyMessage={loading ? 'Loading...' : 'No customers found.'}
      />

      <CustomerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        customer={editCustomer}
        onSaved={loadCustomers}
      />
    </div>
  );
}
