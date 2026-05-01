'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, ExternalLink } from 'lucide-react';
import { formatDate, daysUntilExpiry } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type { Document, DocType, Product, Customer, Supplier } from '@/types/database';

const docTypeLabels: Record<DocType, string> = {
  coa: 'Certificate of Analysis',
  sds: 'Safety Data Sheet',
  license: 'License',
  dea_registration: 'DEA Registration',
  inspection: 'Inspection Report',
  invoice: 'Invoice',
  photo: 'Photo',
  other: 'Other',
};

const entityTypes = ['product', 'lot', 'customer', 'supplier'] as const;

export default function DocumentsPage() {
  const { user, tenantId } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formDocType, setFormDocType] = useState<DocType>('other');
  const [formEntityType, setFormEntityType] = useState<string>('product');
  const [formEntityId, setFormEntityId] = useState('');
  const [formExpiration, setFormExpiration] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [saving, setSaving] = useState(false);

  // Entity lists for cascading select
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const loadDocuments = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    let query = supabase
      .from('documents')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (filterType !== 'all') {
      query = query.eq('doc_type', filterType);
    }

    const { data } = await query;
    setDocuments(data || []);
    setLoading(false);
  }, [tenantId, filterType]);

  const loadEntities = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [prodRes, custRes, suppRes] = await Promise.all([
      supabase.from('products').select('id, name, sku').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('customers').select('id, name').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('suppliers').select('id, name').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
    ]);

    setProducts((prodRes.data || []) as Product[]);
    setCustomers((custRes.data || []) as Customer[]);
    setSuppliers((suppRes.data || []) as Supplier[]);
  }, [tenantId]);

  useEffect(() => {
    loadDocuments();
    loadEntities();
  }, [loadDocuments, loadEntities]);

  function getEntityOptions() {
    switch (formEntityType) {
      case 'product':
        return products.map((p) => ({ id: p.id, label: `${p.sku} - ${p.name}` }));
      case 'customer':
        return customers.map((c) => ({ id: c.id, label: c.name }));
      case 'supplier':
        return suppliers.map((s) => ({ id: s.id, label: s.name }));
      case 'lot':
        return []; // User enters lot ID directly
      default:
        return [];
    }
  }

  function resetForm() {
    setFormTitle('');
    setFormDocType('other');
    setFormEntityType('product');
    setFormEntityId('');
    setFormExpiration('');
    setFormNotes('');
    setFormFileName('');
  }

  async function handleUpload() {
    if (!tenantId || !user) return;
    if (!formTitle || !formEntityId) {
      toast.error('Title and entity are required');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.from('documents').insert({
      tenant_id: tenantId,
      title: formTitle,
      doc_type: formDocType,
      entity_type: formEntityType,
      entity_id: formEntityId,
      file_name: formFileName || null,
      file_url: formFileName ? `/documents/${formFileName}` : null,
      expiration_date: formExpiration || null,
      notes: formNotes || null,
      uploaded_by: user.id,
    });

    setSaving(false);

    if (error) {
      toast.error('Failed to upload document');
      return;
    }

    toast.success('Document uploaded');
    setDialogOpen(false);
    resetForm();
    loadDocuments();
  }

  function getExpiryBadge(doc: Document) {
    if (!doc.expiration_date) return null;
    const days = daysUntilExpiry(doc.expiration_date);
    if (days === null) return null;
    if (days < 0) return <Badge variant="destructive">Expired</Badge>;
    if (days <= 30) return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Expires in {days}d</Badge>;
    return null;
  }

  const columns: Column<Document>[] = [
    { key: 'title', label: 'Title', sortable: true },
    {
      key: 'doc_type',
      label: 'Type',
      sortable: true,
      render: (row) => docTypeLabels[row.doc_type] || row.doc_type,
    },
    {
      key: 'entity_type',
      label: 'Entity',
      sortable: true,
      render: (row) => (
        <span className="capitalize">{row.entity_type}</span>
      ),
    },
    {
      key: 'file_name',
      label: 'File',
      render: (row) => row.file_name || <span className="text-muted-foreground">No file</span>,
    },
    {
      key: 'expiration_date',
      label: 'Expiration',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          {formatDate(row.expiration_date)}
          {getExpiryBadge(row)}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: 'Uploaded',
      sortable: true,
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'actions',
      label: '',
      render: (row) =>
        row.file_url ? (
          <Button variant="ghost" size="sm" asChild>
            <a href={row.file_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : null,
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Documents" />
        <div className="text-muted-foreground">Loading documents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Documents"
        description="Manage certificates, licenses, and compliance documents"
        actions={
          <div className="flex items-center gap-3">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(docTypeLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() =>
                exportToCSV(
                  documents.map((d) => ({
                    Title: d.title,
                    Type: docTypeLabels[d.doc_type],
                    Entity: d.entity_type,
                    File: d.file_name || '',
                    Expiration: d.expiration_date || '',
                    Uploaded: d.created_at,
                  })),
                  'documents'
                )
              }
            >
              Export CSV
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Upload Document
            </Button>
          </div>
        }
      />

      <DataTable
        data={documents}
        columns={columns}
        searchKey="title"
        searchPlaceholder="Search documents..."
        emptyMessage="No documents found."
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Document title" />
            </div>
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={formDocType} onValueChange={(v) => setFormDocType(v as DocType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(docTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Entity Type</Label>
                <Select
                  value={formEntityType}
                  onValueChange={(v) => {
                    setFormEntityType(v);
                    setFormEntityId('');
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {entityTypes.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Entity *</Label>
                {formEntityType === 'lot' ? (
                  <Input
                    value={formEntityId}
                    onChange={(e) => setFormEntityId(e.target.value)}
                    placeholder="Lot ID"
                  />
                ) : (
                  <Select value={formEntityId} onValueChange={setFormEntityId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {getEntityOptions().map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>File</Label>
              <Input
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setFormFileName(file.name);
                }}
              />
              <p className="text-xs text-muted-foreground">File metadata will be stored. Actual file storage is handled separately.</p>
            </div>
            <div className="space-y-2">
              <Label>Expiration Date</Label>
              <Input
                type="date"
                value={formExpiration}
                onChange={(e) => setFormExpiration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={saving}>
              {saving ? 'Uploading...' : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
