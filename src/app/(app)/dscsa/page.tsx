'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable, type Column } from '@/components/ui/data-table';
import { StatCard } from '@/components/ui/stat-card';
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
import { FileText, ShieldCheck, AlertTriangle, Download, Plus } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';
import type { Document, Lot } from '@/types/database';

type DscsaDocType = 'TI' | 'TH' | 'TS';

const dscsaDocLabels: Record<DscsaDocType, string> = {
  TI: 'Transaction Information',
  TH: 'Transaction History',
  TS: 'Transaction Statement',
};

interface DscsaDocument extends Document {
  lot?: { lot_number: string; product?: { name: string; sku: string } };
}

export default function DscsaPage() {
  const { user, tenantId } = useAuth();
  const [documents, setDocuments] = useState<DscsaDocument[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [filterLot, setFilterLot] = useState<string>('all');
  const [filterDirection, setFilterDirection] = useState<string>('all');
  const [filterPartner, setFilterPartner] = useState('');

  // Form state
  const [formLotId, setFormLotId] = useState('');
  const [formDocType, setFormDocType] = useState<DscsaDocType>('TI');
  const [formDirection, setFormDirection] = useState<string>('upstream');
  const [formPartner, setFormPartner] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const loadDocuments = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    // Load DSCSA documents (stored in documents table with entity_type='lot' and title prefix)
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('entity_type', 'lot')
      .in('doc_type', ['other'])
      .like('title', 'DSCSA%')
      .order('created_at', { ascending: false });

    // Enrich with lot info
    const docs = (data || []) as DscsaDocument[];

    if (docs.length > 0) {
      const lotIds = Array.from(new Set(docs.map((d) => d.entity_id)));
      const { data: lotData } = await supabase
        .from('lots')
        .select('id, lot_number, product:products(name, sku)')
        .eq('tenant_id', tenantId)
        .in('id', lotIds);

      const lotMap = new Map((lotData || []).map((l) => [l.id, l]));
      docs.forEach((d) => {
        const lot = lotMap.get(d.entity_id);
        if (lot) {
          d.lot = lot as unknown as DscsaDocument['lot'];
        }
      });
    }

    setDocuments(docs);
    setLoading(false);
  }, [tenantId]);

  const loadLots = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('lots')
      .select('id, lot_number, product:products(name, sku)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('lot_number');
    setLots((data as unknown as Lot[]) || []);
  }, [tenantId]);

  useEffect(() => {
    loadDocuments();
    loadLots();
  }, [loadDocuments, loadLots]);

  // Parse metadata from notes field (direction, partner stored as JSON in notes)
  function parseMeta(doc: DscsaDocument): { dscsaType: DscsaDocType; direction: string; partner: string; refNumber: string } {
    try {
      const meta = JSON.parse(doc.notes || '{}');
      return {
        dscsaType: meta.dscsa_type || 'TI',
        direction: meta.direction || '—',
        partner: meta.trading_partner || '—',
        refNumber: meta.reference_number || '—',
      };
    } catch {
      return { dscsaType: 'TI', direction: '—', partner: '—', refNumber: '—' };
    }
  }

  // Compute verification status per lot
  function getVerificationStatus(): { total: number; verified: number; incomplete: number } {
    const lotDocs = new Map<string, Set<string>>();
    documents.forEach((doc) => {
      const meta = parseMeta(doc);
      if (!lotDocs.has(doc.entity_id)) lotDocs.set(doc.entity_id, new Set());
      lotDocs.get(doc.entity_id)!.add(meta.dscsaType);
    });

    let verified = 0;
    let incomplete = 0;
    lotDocs.forEach((types) => {
      if (types.has('TI') && types.has('TH') && types.has('TS')) {
        verified++;
      } else {
        incomplete++;
      }
    });

    return { total: lotDocs.size, verified, incomplete };
  }

  // Filter documents
  const filteredDocs = documents.filter((doc) => {
    const meta = parseMeta(doc);
    if (filterLot !== 'all' && doc.entity_id !== filterLot) return false;
    if (filterDirection !== 'all' && meta.direction !== filterDirection) return false;
    if (filterPartner && !meta.partner.toLowerCase().includes(filterPartner.toLowerCase())) return false;
    return true;
  });

  function resetForm() {
    setFormLotId('');
    setFormDocType('TI');
    setFormDirection('upstream');
    setFormPartner('');
    setFormDate('');
    setFormReference('');
    setFormNotes('');
  }

  async function handleCreate() {
    if (!tenantId || !user) return;
    if (!formLotId || !formPartner) {
      toast.error('Lot and trading partner are required');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const metaNotes = JSON.stringify({
      dscsa_type: formDocType,
      direction: formDirection,
      trading_partner: formPartner,
      reference_number: formReference,
      user_notes: formNotes,
    });

    const { error } = await supabase.from('documents').insert({
      tenant_id: tenantId,
      title: `DSCSA ${dscsaDocLabels[formDocType]}`,
      doc_type: 'other' as const,
      entity_type: 'lot',
      entity_id: formLotId,
      file_name: null,
      file_url: null,
      expiration_date: null,
      notes: metaNotes,
      uploaded_by: user.id,
    });

    setSaving(false);

    if (error) {
      toast.error('Failed to create DSCSA document');
      return;
    }

    toast.success('DSCSA document created');
    setDialogOpen(false);
    resetForm();
    loadDocuments();
  }

  function handleExport() {
    exportToCSV(
      filteredDocs.map((doc) => {
        const meta = parseMeta(doc);
        return {
          lot_number: doc.lot?.lot_number || '',
          product: doc.lot?.product?.name || '',
          sku: doc.lot?.product?.sku || '',
          document_type: dscsaDocLabels[meta.dscsaType] || meta.dscsaType,
          direction: meta.direction,
          trading_partner: meta.partner,
          reference_number: meta.refNumber,
          document_date: formatDate(doc.created_at),
        };
      }),
      'dscsa_transactions'
    );
  }

  // Lot-level verification view
  function getLotVerification(): Array<{
    lot_id: string;
    lot_number: string;
    product: string;
    has_ti: boolean;
    has_th: boolean;
    has_ts: boolean;
    complete: boolean;
  }> {
    const lotMap = new Map<string, { lot_number: string; product: string; types: Set<string> }>();
    documents.forEach((doc) => {
      const meta = parseMeta(doc);
      if (!lotMap.has(doc.entity_id)) {
        lotMap.set(doc.entity_id, {
          lot_number: doc.lot?.lot_number || doc.entity_id,
          product: doc.lot?.product?.name || '—',
          types: new Set(),
        });
      }
      lotMap.get(doc.entity_id)!.types.add(meta.dscsaType);
    });

    return Array.from(lotMap.entries()).map(([lot_id, info]) => ({
      lot_id,
      lot_number: info.lot_number,
      product: info.product,
      has_ti: info.types.has('TI'),
      has_th: info.types.has('TH'),
      has_ts: info.types.has('TS'),
      complete: info.types.has('TI') && info.types.has('TH') && info.types.has('TS'),
    }));
  }

  const verification = getVerificationStatus();
  const lotVerification = getLotVerification();

  const columns: Column<DscsaDocument>[] = [
    {
      key: 'entity_id',
      label: 'Lot',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.lot?.lot_number || row.entity_id}</div>
          <div className="text-xs text-muted-foreground">{row.lot?.product?.name || ''}</div>
        </div>
      ),
    },
    {
      key: 'title',
      label: 'Document Type',
      sortable: true,
      render: (row) => {
        const meta = parseMeta(row);
        return (
          <Badge variant="outline">
            {meta.dscsaType} - {dscsaDocLabels[meta.dscsaType] || meta.dscsaType}
          </Badge>
        );
      },
    },
    {
      key: 'notes',
      label: 'Direction',
      render: (row) => {
        const meta = parseMeta(row);
        return (
          <Badge variant={meta.direction === 'upstream' ? 'secondary' : 'default'}>
            {meta.direction}
          </Badge>
        );
      },
    },
    {
      key: 'doc_type',
      label: 'Trading Partner',
      render: (row) => parseMeta(row).partner,
    },
    {
      key: 'file_name',
      label: 'Reference',
      render: (row) => parseMeta(row).refNumber,
    },
    {
      key: 'created_at',
      label: 'Date',
      sortable: true,
      render: (row) => formatDate(row.created_at),
    },
  ];

  const verificationColumns: Column<ReturnType<typeof getLotVerification>[number]>[] = [
    { key: 'lot_number', label: 'Lot Number', sortable: true },
    { key: 'product', label: 'Product', sortable: true },
    {
      key: 'has_ti',
      label: 'TI',
      render: (row) => (
        <Badge variant={row.has_ti ? 'default' : 'destructive'} className={row.has_ti ? 'bg-green-100 text-green-800 border-green-200' : ''}>
          {row.has_ti ? 'Yes' : 'Missing'}
        </Badge>
      ),
    },
    {
      key: 'has_th',
      label: 'TH',
      render: (row) => (
        <Badge variant={row.has_th ? 'default' : 'destructive'} className={row.has_th ? 'bg-green-100 text-green-800 border-green-200' : ''}>
          {row.has_th ? 'Yes' : 'Missing'}
        </Badge>
      ),
    },
    {
      key: 'has_ts',
      label: 'TS',
      render: (row) => (
        <Badge variant={row.has_ts ? 'default' : 'destructive'} className={row.has_ts ? 'bg-green-100 text-green-800 border-green-200' : ''}>
          {row.has_ts ? 'Yes' : 'Missing'}
        </Badge>
      ),
    },
    {
      key: 'complete',
      label: 'Status',
      render: (row) => (
        <Badge variant={row.complete ? 'default' : 'destructive'} className={row.complete ? 'bg-green-100 text-green-800 border-green-200' : ''}>
          {row.complete ? 'Complete' : 'Incomplete'}
        </Badge>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="DSCSA Transaction History" />
        <div className="text-muted-foreground">Loading DSCSA documents...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="DSCSA Transaction History"
        description="Drug Supply Chain Security Act T3 document tracking"
        actions={
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" /> Export CSV
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Add Document
            </Button>
          </div>
        }
      />

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Documents" value={documents.length} icon={FileText} />
        <StatCard title="Lots Tracked" value={verification.total} icon={FileText} />
        <StatCard
          title="Fully Verified"
          value={verification.verified}
          icon={ShieldCheck}
          description="All 3 T3 documents present"
        />
        <StatCard
          title="Incomplete"
          value={verification.incomplete}
          icon={AlertTriangle}
          description="Missing one or more T3 docs"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-1">
          <Label className="text-xs">Lot</Label>
          <Select value={filterLot} onValueChange={setFilterLot}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Lots</SelectItem>
              {lots.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {(l as unknown as { lot_number: string }).lot_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Direction</Label>
          <Select value={filterDirection} onValueChange={setFilterDirection}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Directions</SelectItem>
              <SelectItem value="upstream">Upstream</SelectItem>
              <SelectItem value="downstream">Downstream</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Trading Partner</Label>
          <Input
            value={filterPartner}
            onChange={(e) => setFilterPartner(e.target.value)}
            placeholder="Search partner..."
            className="w-48"
          />
        </div>
      </div>

      {/* Transaction Documents Table */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Transaction Documents</h2>
        <DataTable
          data={filteredDocs}
          columns={columns}
          searchKey="title"
          searchPlaceholder="Search documents..."
          emptyMessage="No DSCSA documents found."
        />
      </div>

      {/* Verification Status Table */}
      {lotVerification.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">T3 Verification Status by Lot</h2>
          <DataTable
            data={lotVerification}
            columns={verificationColumns}
            searchKey="lot_number"
            searchPlaceholder="Search lot..."
            emptyMessage="No lots tracked."
          />
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add DSCSA Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Lot *</Label>
              <Select value={formLotId} onValueChange={setFormLotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select lot..." />
                </SelectTrigger>
                <SelectContent>
                  {lots.map((l) => {
                    const lot = l as unknown as { id: string; lot_number: string; product?: { name: string; sku: string } };
                    return (
                      <SelectItem key={lot.id} value={lot.id}>
                        {lot.lot_number} {lot.product ? `- ${lot.product.sku}` : ''}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document Type *</Label>
                <Select value={formDocType} onValueChange={(v) => setFormDocType(v as DscsaDocType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TI">TI - Transaction Information</SelectItem>
                    <SelectItem value="TH">TH - Transaction History</SelectItem>
                    <SelectItem value="TS">TS - Transaction Statement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Direction *</Label>
                <Select value={formDirection} onValueChange={setFormDirection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upstream">Upstream</SelectItem>
                    <SelectItem value="downstream">Downstream</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Trading Partner *</Label>
              <Input
                value={formPartner}
                onChange={(e) => setFormPartner(e.target.value)}
                placeholder="Partner name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Document Date</Label>
                <Input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Reference Number</Label>
                <Input
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                  placeholder="Ref #"
                />
              </div>
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
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? 'Saving...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
