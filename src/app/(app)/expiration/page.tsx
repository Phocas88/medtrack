'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ExpiryBadge } from '@/components/ui/expiry-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { AlertTriangle, Clock, CalendarX, Trash2, Heart, Download, ShieldAlert, Tag } from 'lucide-react';
import { formatDate, formatCurrency, formatNumber, daysUntilExpiry } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import { toast } from 'sonner';

interface ExpiringLot {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  lot_number: string;
  expiration_date: string;
  quantity_on_hand: number;
  cost_at_receipt: number;
  status: string;
  days_remaining: number;
}

interface DestructionRecord {
  id: string;
  product_name: string;
  lot_number: string;
  quantity: number;
  method: string;
  witness_name: string;
  destruction_date: string;
  notes: string | null;
  created_at: string;
}

interface DonationRecord {
  id: string;
  product_name: string;
  lot_number: string;
  quantity: number;
  recipient: string;
  donation_date: string;
  tax_value: number;
  notes: string | null;
  created_at: string;
}

export default function ExpirationPage() {
  const { user, tenantId } = useAuth();
  const [lots, setLots] = useState<ExpiringLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [daysFilter, setDaysFilter] = useState('30');

  // Destruction dialog
  const [destroyDialogOpen, setDestroyDialogOpen] = useState(false);
  const [destroyLot, setDestroyLot] = useState<ExpiringLot | null>(null);
  const [destroyQty, setDestroyQty] = useState('');
  const [destroyMethod, setDestroyMethod] = useState('');
  const [destroyWitness, setDestroyWitness] = useState('');
  const [destroyDate, setDestroyDate] = useState(new Date().toISOString().split('T')[0]);
  const [destroyNotes, setDestroyNotes] = useState('');

  // Donation dialog
  const [donateDialogOpen, setDonateDialogOpen] = useState(false);
  const [donateLot, setDonateLot] = useState<ExpiringLot | null>(null);
  const [donateQty, setDonateQty] = useState('');
  const [donateRecipient, setDonateRecipient] = useState('');
  const [donateDate, setDonateDate] = useState(new Date().toISOString().split('T')[0]);
  const [donateTaxValue, setDonateTaxValue] = useState('');
  const [donateNotes, setDonateNotes] = useState('');

  // Destruction/Donation logs
  const [destructions, setDestructions] = useState<DestructionRecord[]>([]);
  const [donations, setDonations] = useState<DonationRecord[]>([]);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const supabase = createClient();

    // Load lots with expiration dates
    const { data: lotData } = await supabase
      .from('lots')
      .select('*, product:products(name, sku, unit_price)')
      .eq('tenant_id', tenantId)
      .not('expiration_date', 'is', null)
      .in('status', ['active', 'quarantined'])
      .order('expiration_date', { ascending: true });

    const mapped: ExpiringLot[] = (lotData || []).map((row: Record<string, unknown>) => {
      const product = row.product as { name: string; sku: string; unit_price?: number } | null;
      const days = daysUntilExpiry(row.expiration_date as string);
      return {
        id: row.id as string,
        product_id: row.product_id as string,
        product_name: product?.name || '',
        product_sku: product?.sku || '',
        lot_number: row.lot_number as string,
        expiration_date: row.expiration_date as string,
        quantity_on_hand: row.quantity_on_hand as number,
        cost_at_receipt: row.cost_at_receipt as number,
        status: row.status as string,
        days_remaining: days ?? 0,
      };
    });

    setLots(mapped);

    // Load destruction log from stock_movements
    const { data: destroyData } = await supabase
      .from('stock_movements')
      .select('*, product:products(name), lot:lots(lot_number)')
      .eq('tenant_id', tenantId)
      .eq('movement_type', 'adjust')
      .ilike('reference_number', '%destruction%')
      .order('created_at', { ascending: false })
      .limit(200);

    const mappedDestructions: DestructionRecord[] = (destroyData || []).map((row: Record<string, unknown>) => {
      const product = row.product as { name: string } | null;
      const lot = row.lot as { lot_number: string } | null;
      const reason = (row.reason as string) || '';
      // Parse structured reason: "Destruction: method | witness | notes"
      const parts = reason.replace('Destruction: ', '').split(' | ');
      return {
        id: row.id as string,
        product_name: product?.name || '',
        lot_number: lot?.lot_number || '',
        quantity: Math.abs(row.quantity as number),
        method: parts[0] || '',
        witness_name: parts[1] || '',
        destruction_date: (row.created_at as string).split('T')[0],
        notes: parts[2] || null,
        created_at: row.created_at as string,
      };
    });
    setDestructions(mappedDestructions);

    // Load donation log from stock_movements
    const { data: donateData } = await supabase
      .from('stock_movements')
      .select('*, product:products(name), lot:lots(lot_number)')
      .eq('tenant_id', tenantId)
      .eq('movement_type', 'adjust')
      .ilike('reference_number', '%donation%')
      .order('created_at', { ascending: false })
      .limit(200);

    const mappedDonations: DonationRecord[] = (donateData || []).map((row: Record<string, unknown>) => {
      const product = row.product as { name: string } | null;
      const lot = row.lot as { lot_number: string } | null;
      const reason = (row.reason as string) || '';
      // Parse structured reason: "Donation: recipient | tax_value | notes"
      const parts = reason.replace('Donation: ', '').split(' | ');
      return {
        id: row.id as string,
        product_name: product?.name || '',
        lot_number: lot?.lot_number || '',
        quantity: Math.abs(row.quantity as number),
        recipient: parts[0] || '',
        donation_date: (row.created_at as string).split('T')[0],
        tax_value: parseFloat(parts[1]) || 0,
        notes: parts[2] || null,
        created_at: row.created_at as string,
      };
    });
    setDonations(mappedDonations);

    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats
  const expiring30 = lots.filter((l) => l.days_remaining >= 0 && l.days_remaining <= 30).length;
  const expiring60 = lots.filter((l) => l.days_remaining >= 0 && l.days_remaining <= 60).length;
  const expiring90 = lots.filter((l) => l.days_remaining >= 0 && l.days_remaining <= 90).length;
  const totalExpired = lots.filter((l) => l.days_remaining < 0).length;

  // Filtered lots for "Expiring Soon" tab
  const daysN = parseInt(daysFilter);
  const expiringSoonLots = lots.filter((l) => l.days_remaining >= 0 && l.days_remaining <= daysN);

  // Short-dated: lots expiring in 30-90 days with discount pricing
  const shortDatedLots = lots.filter((l) => l.days_remaining >= 30 && l.days_remaining <= 90);

  // Quarantine action
  async function handleQuarantine(lot: ExpiringLot) {
    if (!tenantId) return;
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('lots')
      .update({ status: 'quarantined' })
      .eq('id', lot.id);

    if (error) {
      toast.error('Failed to quarantine lot');
    } else {
      toast.success(`Lot ${lot.lot_number} quarantined`);
    }
    setSaving(false);
    loadData();
  }

  // Open destruction dialog
  function openDestroyDialog(lot: ExpiringLot) {
    setDestroyLot(lot);
    setDestroyQty(String(lot.quantity_on_hand));
    setDestroyMethod('');
    setDestroyWitness('');
    setDestroyDate(new Date().toISOString().split('T')[0]);
    setDestroyNotes('');
    setDestroyDialogOpen(true);
  }

  async function handleDestruction() {
    if (!tenantId || !user || !destroyLot) return;
    const qty = parseInt(destroyQty);
    if (!qty || qty <= 0 || qty > destroyLot.quantity_on_hand) {
      toast.error('Invalid quantity');
      return;
    }
    if (!destroyMethod) {
      toast.error('Destruction method is required');
      return;
    }
    if (!destroyWitness) {
      toast.error('Witness name is required');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Decrement lot
    const newQty = destroyLot.quantity_on_hand - qty;
    await supabase
      .from('lots')
      .update({
        quantity_on_hand: newQty,
        status: newQty <= 0 ? 'depleted' : destroyLot.status,
      })
      .eq('id', destroyLot.id);

    // Record movement with structured reason
    const reason = `Destruction: ${destroyMethod} | ${destroyWitness} | ${destroyNotes}`;
    await supabase.from('stock_movements').insert({
      tenant_id: tenantId,
      product_id: destroyLot.product_id,
      lot_id: destroyLot.id,
      user_id: user.id,
      quantity: -qty,
      movement_type: 'adjust',
      reason,
      reference_number: `destruction-${destroyLot.lot_number}-${destroyDate}`,
    });

    toast.success(`Destruction logged: ${qty} units of lot ${destroyLot.lot_number}`);
    setSaving(false);
    setDestroyDialogOpen(false);
    loadData();
  }

  // Open donation dialog
  function openDonateDialog(lot: ExpiringLot) {
    setDonateLot(lot);
    setDonateQty(String(lot.quantity_on_hand));
    setDonateRecipient('');
    setDonateDate(new Date().toISOString().split('T')[0]);
    setDonateTaxValue('');
    setDonateNotes('');
    setDonateDialogOpen(true);
  }

  async function handleDonation() {
    if (!tenantId || !user || !donateLot) return;
    const qty = parseInt(donateQty);
    if (!qty || qty <= 0 || qty > donateLot.quantity_on_hand) {
      toast.error('Invalid quantity');
      return;
    }
    if (!donateRecipient) {
      toast.error('Recipient is required');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // Decrement lot
    const newQty = donateLot.quantity_on_hand - qty;
    await supabase
      .from('lots')
      .update({
        quantity_on_hand: newQty,
        status: newQty <= 0 ? 'depleted' : donateLot.status,
      })
      .eq('id', donateLot.id);

    // Record movement with structured reason
    const taxVal = parseFloat(donateTaxValue) || 0;
    const reason = `Donation: ${donateRecipient} | ${taxVal} | ${donateNotes}`;
    await supabase.from('stock_movements').insert({
      tenant_id: tenantId,
      product_id: donateLot.product_id,
      lot_id: donateLot.id,
      user_id: user.id,
      quantity: -qty,
      movement_type: 'adjust',
      reason,
      reference_number: `donation-${donateLot.lot_number}-${donateDate}`,
    });

    toast.success(`Donation logged: ${qty} units to ${donateRecipient}`);
    setSaving(false);
    setDonateDialogOpen(false);
    loadData();
  }

  // Export helpers
  function exportDestructions() {
    if (destructions.length === 0) { toast.error('No data to export'); return; }
    exportToCSV(destructions, 'destruction_log', [
      { key: 'product_name', label: 'Product' },
      { key: 'lot_number', label: 'Lot #' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'method', label: 'Method' },
      { key: 'witness_name', label: 'Witness' },
      { key: 'destruction_date', label: 'Date' },
      { key: 'notes', label: 'Notes' },
    ]);
    toast.success('Destruction log exported');
  }

  function exportDonations() {
    if (donations.length === 0) { toast.error('No data to export'); return; }
    exportToCSV(donations, 'donation_log', [
      { key: 'product_name', label: 'Product' },
      { key: 'lot_number', label: 'Lot #' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'recipient', label: 'Recipient' },
      { key: 'donation_date', label: 'Date' },
      { key: 'tax_value', label: 'Tax Value' },
      { key: 'notes', label: 'Notes' },
    ]);
    toast.success('Donation log exported');
  }

  // Column definitions
  const expiringColumns: Column<ExpiringLot>[] = [
    {
      key: 'product_name',
      label: 'Product',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.product_name}</div>
          <div className="text-xs text-muted-foreground">{row.product_sku}</div>
        </div>
      ),
    },
    {
      key: 'lot_number',
      label: 'Lot #',
      sortable: true,
      render: (row) => <span className="font-mono text-xs font-medium">{row.lot_number}</span>,
    },
    {
      key: 'expiration_date',
      label: 'Expiration',
      sortable: true,
      render: (row) => formatDate(row.expiration_date),
    },
    {
      key: 'days_remaining',
      label: 'Days Left',
      sortable: true,
      render: (row) => <ExpiryBadge date={row.expiration_date} showDays />,
    },
    {
      key: 'quantity_on_hand',
      label: 'Quantity',
      sortable: true,
      render: (row) => formatNumber(row.quantity_on_hand),
    },
    {
      key: 'actions' as keyof ExpiringLot,
      label: 'Actions',
      render: (row) => (
        <div className="flex gap-1">
          {row.status !== 'quarantined' && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleQuarantine(row); }}
              disabled={saving}
            >
              <ShieldAlert className="mr-1 h-3 w-3" />
              Quarantine
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); openDestroyDialog(row); }}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Destroy
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => { e.stopPropagation(); openDonateDialog(row); }}
          >
            <Heart className="mr-1 h-3 w-3" />
            Donate
          </Button>
        </div>
      ),
    },
  ];

  const shortDatedColumns: Column<ExpiringLot>[] = [
    {
      key: 'product_name',
      label: 'Product',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.product_name}</div>
          <div className="text-xs text-muted-foreground">{row.product_sku}</div>
        </div>
      ),
    },
    {
      key: 'lot_number',
      label: 'Lot #',
      render: (row) => <span className="font-mono text-xs font-medium">{row.lot_number}</span>,
    },
    {
      key: 'expiration_date',
      label: 'Expiration',
      sortable: true,
      render: (row) => formatDate(row.expiration_date),
    },
    {
      key: 'days_remaining',
      label: 'Days Left',
      sortable: true,
      render: (row) => <ExpiryBadge date={row.expiration_date} showDays />,
    },
    {
      key: 'quantity_on_hand',
      label: 'Quantity',
      render: (row) => formatNumber(row.quantity_on_hand),
    },
    {
      key: 'cost_at_receipt',
      label: 'Original Price',
      render: (row) => formatCurrency(row.cost_at_receipt),
    },
    {
      key: 'status' as keyof ExpiringLot,
      label: '20% Discount',
      render: (row) => formatCurrency(row.cost_at_receipt * 0.2),
    },
    {
      key: 'id' as keyof ExpiringLot,
      label: 'Discounted Price',
      render: (row) => (
        <span className="font-semibold text-green-600 dark:text-green-400">
          {formatCurrency(row.cost_at_receipt * 0.8)}
        </span>
      ),
    },
  ];

  const destructionColumns: Column<DestructionRecord>[] = [
    { key: 'product_name', label: 'Product', sortable: true },
    {
      key: 'lot_number',
      label: 'Lot #',
      render: (row) => <span className="font-mono text-xs font-medium">{row.lot_number}</span>,
    },
    {
      key: 'quantity',
      label: 'Quantity',
      sortable: true,
      render: (row) => formatNumber(row.quantity),
    },
    { key: 'method', label: 'Method' },
    { key: 'witness_name', label: 'Witness' },
    {
      key: 'destruction_date',
      label: 'Date',
      sortable: true,
      render: (row) => formatDate(row.destruction_date),
    },
    { key: 'notes', label: 'Notes', render: (row) => row.notes || '--' },
  ];

  const donationColumns: Column<DonationRecord>[] = [
    { key: 'product_name', label: 'Product', sortable: true },
    {
      key: 'lot_number',
      label: 'Lot #',
      render: (row) => <span className="font-mono text-xs font-medium">{row.lot_number}</span>,
    },
    {
      key: 'quantity',
      label: 'Quantity',
      sortable: true,
      render: (row) => formatNumber(row.quantity),
    },
    { key: 'recipient', label: 'Recipient', sortable: true },
    {
      key: 'donation_date',
      label: 'Date',
      sortable: true,
      render: (row) => formatDate(row.donation_date),
    },
    {
      key: 'tax_value',
      label: 'Tax Value',
      render: (row) => formatCurrency(row.tax_value),
    },
    { key: 'notes', label: 'Notes', render: (row) => row.notes || '--' },
  ];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Expiration Management" />
        <div className="text-muted-foreground">Loading expiration data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Expiration Management"
        description="Monitor expiring inventory, manage short-dated stock, and track destructions and donations"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Expiring in 30 Days" value={formatNumber(expiring30)} icon={AlertTriangle} />
        <StatCard title="Expiring in 60 Days" value={formatNumber(expiring60)} icon={Clock} />
        <StatCard title="Expiring in 90 Days" value={formatNumber(expiring90)} icon={CalendarX} />
        <StatCard title="Total Expired" value={formatNumber(totalExpired)} icon={Trash2} />
      </div>

      <Tabs defaultValue="expiring">
        <TabsList>
          <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
          <TabsTrigger value="short-dated">Short-Dated</TabsTrigger>
          <TabsTrigger value="destruction">Destruction Log</TabsTrigger>
          <TabsTrigger value="donations">Donations</TabsTrigger>
        </TabsList>

        <TabsContent value="expiring" className="space-y-4">
          <div className="flex items-center gap-3">
            <Label>Show expiring within:</Label>
            <Select value={daysFilter} onValueChange={setDaysFilter}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {expiringSoonLots.length} lot{expiringSoonLots.length !== 1 ? 's' : ''} found
            </span>
          </div>

          <DataTable
            data={expiringSoonLots}
            columns={expiringColumns}
            searchKey="product_name"
            searchPlaceholder="Search expiring lots..."
            emptyMessage="No lots expiring within the selected range."
          />
        </TabsContent>

        <TabsContent value="short-dated" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Short-Dated Discount Pricing (20% Off)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={shortDatedLots}
                columns={shortDatedColumns}
                searchKey="product_name"
                searchPlaceholder="Search short-dated products..."
                emptyMessage="No short-dated lots (30-90 days to expiry)."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="destruction" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={exportDestructions} disabled={destructions.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <DataTable
            data={destructions}
            columns={destructionColumns}
            searchKey="product_name"
            searchPlaceholder="Search destruction records..."
            emptyMessage="No destruction records found."
          />
        </TabsContent>

        <TabsContent value="donations" className="space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={exportDonations} disabled={donations.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <DataTable
            data={donations}
            columns={donationColumns}
            searchKey="product_name"
            searchPlaceholder="Search donation records..."
            emptyMessage="No donation records found."
          />
        </TabsContent>
      </Tabs>

      {/* Destruction Dialog */}
      <Dialog open={destroyDialogOpen} onOpenChange={setDestroyDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Destruction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {destroyLot && (
              <div className="text-sm text-muted-foreground">
                {destroyLot.product_name} - Lot {destroyLot.lot_number} (Available: {formatNumber(destroyLot.quantity_on_hand)})
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  max={destroyLot?.quantity_on_hand}
                  value={destroyQty}
                  onChange={(e) => setDestroyQty(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={destroyDate}
                  onChange={(e) => setDestroyDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Destruction Method *</Label>
              <Select value={destroyMethod} onValueChange={setDestroyMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incineration">Incineration</SelectItem>
                  <SelectItem value="chemical">Chemical Treatment</SelectItem>
                  <SelectItem value="autoclaving">Autoclaving</SelectItem>
                  <SelectItem value="landfill">Secure Landfill</SelectItem>
                  <SelectItem value="reverse_distribution">Reverse Distribution</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Witness Name *</Label>
              <Input
                value={destroyWitness}
                onChange={(e) => setDestroyWitness(e.target.value)}
                placeholder="Name of witness"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={destroyNotes}
                onChange={(e) => setDestroyNotes(e.target.value)}
                placeholder="Optional notes"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDestroyDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDestruction} disabled={saving}>
              {saving ? 'Logging...' : 'Log Destruction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Donation Dialog */}
      <Dialog open={donateDialogOpen} onOpenChange={setDonateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Donation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {donateLot && (
              <div className="text-sm text-muted-foreground">
                {donateLot.product_name} - Lot {donateLot.lot_number} (Available: {formatNumber(donateLot.quantity_on_hand)})
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  max={donateLot?.quantity_on_hand}
                  value={donateQty}
                  onChange={(e) => setDonateQty(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={donateDate}
                  onChange={(e) => setDonateDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Recipient *</Label>
              <Input
                value={donateRecipient}
                onChange={(e) => setDonateRecipient(e.target.value)}
                placeholder="Organization or recipient name"
              />
            </div>
            <div className="space-y-2">
              <Label>Tax Deduction Value</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={donateTaxValue}
                onChange={(e) => setDonateTaxValue(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={donateNotes}
                onChange={(e) => setDonateNotes(e.target.value)}
                placeholder="Optional notes"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDonateDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDonation} disabled={saving}>
              {saving ? 'Logging...' : 'Log Donation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
