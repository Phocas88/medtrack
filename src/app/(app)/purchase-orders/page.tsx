'use client';

import Link from 'next/link';
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
import { Plus, Download, PackageCheck, Printer, Send } from 'lucide-react';
import { toast } from 'sonner';
import { generatePurchaseOrderPDF } from '@/lib/pdf';
import { formatDate, formatCurrency } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { PODialog } from './po-dialog';
import { ReceivePODialog } from './receive-po-dialog';
import type { PurchaseOrder, POStatus } from '@/types/database';

type POWithDetails = PurchaseOrder & {
  supplier_name: string;
  line_count: number;
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'partial', label: 'Partial' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
];

function statusBadge(status: POStatus) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string; className?: string }> = {
    draft: { variant: 'secondary', label: 'Draft' },
    pending_approval: { variant: 'outline', label: 'Pending Approval', className: 'border-yellow-500 text-yellow-700' },
    approved: { variant: 'default', label: 'Approved' },
    sent: { variant: 'default', label: 'Sent', className: 'bg-blue-600' },
    partial: { variant: 'outline', label: 'Partial', className: 'border-amber-500 text-amber-700' },
    received: { variant: 'default', label: 'Received', className: 'bg-green-600' },
    cancelled: { variant: 'destructive', label: 'Cancelled' },
  };
  const cfg = map[status] || { variant: 'secondary' as const, label: status };
  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
}

export default function PurchaseOrdersPage() {
  const { tenantId } = useAuth();
  const [orders, setOrders] = useState<POWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [poId, setPoId] = useState<string | null>(null);

  useEffect(() => {
    setPoId(new URLSearchParams(window.location.search).get('po'));
  }, []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPO, setEditPO] = useState<PurchaseOrder | null>(null);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [receivePO, setReceivePO] = useState<PurchaseOrder | null>(null);

  const loadOrders = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(name), lines:po_lines(id, product_id, quantity_ordered, quantity_received, unit_cost, notes, created_at, tenant_id, po_id)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (poId) query = query.eq('id', poId);
    if (!poId && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;

    const enriched: POWithDetails[] = (data || []).map((po) => ({
      ...po,
      supplier_name: po.supplier?.name || 'Unknown',
      line_count: po.lines?.length || 0,
    }));

    setOrders(enriched);
    setLoading(false);
  }, [tenantId, statusFilter, poId]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  function handleRowClick(po: POWithDetails) {
    setEditPO(po as PurchaseOrder);
    setDialogOpen(true);
  }

  function handleCreateNew() {
    setEditPO(null);
    setDialogOpen(true);
  }

  function handleReceive(po: POWithDetails) {
    setReceivePO(po as PurchaseOrder);
    setReceiveDialogOpen(true);
  }

  function handleExport() {
    exportToCSV(
      orders.map((po) => ({
        po_number: po.po_number,
        supplier: po.supplier_name,
        status: po.status,
        order_date: po.order_date,
        expected_date: po.expected_date || '',
        total: po.total_amount,
        items: po.line_count,
      })),
      'purchase-orders',
      [
        { key: 'po_number', label: 'PO #' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'status', label: 'Status' },
        { key: 'order_date', label: 'Order Date' },
        { key: 'expected_date', label: 'Expected Date' },
        { key: 'total', label: 'Total' },
        { key: 'items', label: 'Items' },
      ]
    );
  }

  const columns: Column<POWithDetails>[] = [
    {
      key: 'po_number',
      label: 'PO #',
      sortable: true,
      render: (row) => <span className="font-medium">{row.po_number}</span>,
    },
    {
      key: 'supplier_name',
      label: 'Supplier',
      sortable: true,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => statusBadge(row.status),
    },
    {
      key: 'order_date',
      label: 'Order Date',
      sortable: true,
      render: (row) => formatDate(row.order_date),
    },
    {
      key: 'expected_date',
      label: 'Expected Date',
      sortable: true,
      render: (row) => formatDate(row.expected_date),
    },
    {
      key: 'total_amount',
      label: 'Total',
      sortable: true,
      render: (row) => formatCurrency(row.total_amount),
    },
    {
      key: 'line_count',
      label: 'Items',
      sortable: true,
    },
    {
      key: 'actions',
      label: '',
      render: (row) => {
        const canReceive = ['approved', 'sent', 'partial'].includes(row.status);
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={async (e) => {
                e.stopPropagation();
                const supabase = createClient();
                const { data: poData } = await supabase
                  .from('purchase_orders')
                  .select('*, supplier:suppliers(*), lines:po_lines(*, product:products(name, sku)), location:locations(name), created_user:users!purchase_orders_created_by_fkey(full_name), approved_user:users!purchase_orders_approved_by_fkey(full_name)')
                  .eq('id', row.id)
                  .single();
                const { data: tenant } = await supabase.from('tenants').select('name, settings').eq('id', tenantId).single();
                if (!poData || !tenant) return;
                const s = (tenant.settings || {}) as Record<string, string>;
                generatePurchaseOrderPDF({
                  companyName: tenant.name,
                  companyAddress: s.address || '',
                  poNumber: poData.po_number,
                  poDate: poData.order_date,
                  expectedDate: poData.expected_date,
                  status: poData.status,
                  supplierName: poData.supplier?.name || '',
                  supplierContact: poData.supplier?.contact_name || null,
                  supplierEmail: poData.supplier?.email || null,
                  supplierPhone: poData.supplier?.phone || null,
                  supplierAddress: poData.supplier?.address || null,
                  deliverToLocation: poData.location?.name || null,
                  lines: (poData.lines || []).map((l: { product?: { name: string; sku: string }; quantity_ordered: number; quantity_received: number; unit_cost: number }) => ({
                    productName: l.product?.name || '',
                    sku: l.product?.sku || '',
                    quantityOrdered: l.quantity_ordered,
                    quantityReceived: l.quantity_received,
                    unitCost: l.unit_cost,
                    lineTotal: l.quantity_ordered * l.unit_cost,
                  })),
                  subtotal: poData.total_amount,
                  notes: poData.notes,
                  createdBy: poData.created_user?.full_name || null,
                  approvedBy: poData.approved_user?.full_name || null,
                  approvedDate: poData.approved_at ? new Date(poData.approved_at).toLocaleDateString() : null,
                });
              }}
            >
              <Printer className="h-4 w-4" />
            </Button>
            {['draft', 'approved', 'pending_approval'].includes(row.status) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async (e) => {
                  e.stopPropagation();
                  toast.loading('Sending to vendor...');
                  const res = await fetch('/api/po/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ po_id: row.id }),
                  });
                  toast.dismiss();
                  const data = await res.json();
                  if (res.ok) {
                    toast.success(`PO sent to ${data.sent_to}`);
                    loadOrders();
                  } else {
                    toast.error(data.error || 'Failed to send');
                  }
                }}
              >
                <Send className="h-4 w-4 mr-1" />
                Send
              </Button>
            )}
            {(canReceive || row.status === 'received') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleReceive(row);
                }}
              >
                <PackageCheck className="h-4 w-4 mr-1" />
                {canReceive ? 'Receive' : 'Receiving history'}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        product="purchasing" title="Purchase Orders"
        description="Manage supplier purchase orders and receiving"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
            <Button size="sm" onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-1" /> Create PO
            </Button>
          </div>
        }
      />

      {poId ? (
        <Link href="/purchase-orders" onClick={() => setPoId(null)} className="inline-block text-sm underline">
          View all purchase orders
        </Link>
      ) : (
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">Loading purchase orders...</div>
      ) : (
        <DataTable
          data={orders}
          columns={columns}
          searchKey="po_number"
          searchPlaceholder="Search by PO number..."
          onRowClick={handleRowClick}
          emptyMessage="No purchase orders found."
        />
      )}

      <PODialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        po={editPO}
        onSaved={loadOrders}
      />

      {receivePO && (
        <ReceivePODialog
          open={receiveDialogOpen}
          onOpenChange={setReceiveDialogOpen}
          po={receivePO}
          onSaved={loadOrders}
        />
      )}
    </div>
  );
}
