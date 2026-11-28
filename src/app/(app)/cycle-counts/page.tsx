'use client';

import { CountPlanner } from './count-planner';
import { RecurringCounts } from './recurring-counts';
import { AssignScanner } from './assign-scanner';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Plus,
  ClipboardCheck,
  AlertTriangle,
  RotateCcw,
  BarChart3,
  Download,
  Eye,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { exportToCSV } from '@/lib/csv';
import type {
  CycleCount,
  CycleCountLine,
  CountStatus,
  Location,
  Product,
} from '@/types/database';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LineWithJoins = CycleCountLine & {
  product?: { id: string; name: string; sku: string } | null;
  lot?: { id: string; lot_number: string } | null;
};

type CountWithDetails = CycleCount & {
  location?: { id: string; name: string } | null;
  lines: LineWithJoins[];
  created_by_user?: { full_name: string } | null;
  approved_by_user?: { full_name: string } | null;
  parent_count?: { count_number: string } | null;
};

const REASON_CODES = [
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'theft', label: 'Theft / Shrinkage' },
  { value: 'miscount', label: 'Miscount' },
  { value: 'sample', label: 'Sample / Demo' },
  { value: 'documentation_error', label: 'Documentation Error' },
  { value: 'found_extra', label: 'Found Extra' },
] as const;

const statusVariant: Record<CountStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  planned: 'outline',
  in_progress: 'secondary',
  pending_review: 'secondary',
  approved: 'default',
  cancelled: 'destructive',
};

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CycleCountsPage() {
  const { user, tenantId } = useAuth();
  const supabase = createClient();

  // ---- data ----
  const [planRevision, setPlanRevision] = useState(0);
  const [refreshingSnapshot, setRefreshingSnapshot] = useState(false);
  const [counts, setCounts] = useState<CountWithDetails[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');

  // ---- dialogs ----
  const [newCountOpen, setNewCountOpen] = useState(false);
  const [countEntryOpen, setCountEntryOpen] = useState(false);
  const [varianceDetailOpen, setVarianceDetailOpen] = useState(false);
  const [recountDialogOpen, setRecountDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);

  // ---- selected ----
  const [selectedCount, setSelectedCount] = useState<CountWithDetails | null>(null);

  // ---- new count form ----
  const [newType, setNewType] = useState<string>('full');
  const [newLocationId, setNewLocationId] = useState<string>('');
  const [newProductIds, setNewProductIds] = useState<string[]>([]);
  const [newBlind, setNewBlind] = useState(false);
  const [newPlannedDate, setNewPlannedDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [creating, setCreating] = useState(false);

  // ---- count entry ----
  const [entryLines, setEntryLines] = useState<
    { lineId: string; product_name: string; sku: string; lot_number: string; location: string; system_quantity: number; counted_quantity: string; reason_code: string; notes: string }[]
  >([]);
  const [submittingCount, setSubmittingCount] = useState(false);

  // ---- variance review ----
  const [postingVariance, setPostingVariance] = useState(false);

  // ---- recount ----
  const [recountLocationIds, setRecountLocationIds] = useState<string[]>([]);
  const [creatingRecount, setCreatingRecount] = useState(false);

  // ---- reject ----
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);

  // ---- product search for new count ----
  const [productSearch, setProductSearch] = useState('');

  // =========================================================================
  // Loaders
  // =========================================================================

  const loadCounts = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('cycle_counts')
      .select(`
        *,
        location:locations(id, name),
        lines:cycle_count_lines(
          *,
          product:products(id, name, sku),
          lot:lots(id, lot_number)
        ),
        created_by_user:users!cycle_counts_created_by_fkey(full_name),
        approved_by_user:users!cycle_counts_approved_by_fkey(full_name)
      `)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    setCounts((data as CountWithDetails[]) || []);
    setPlanRevision(revision => revision + 1);
    setLoading(false);
  }, [tenantId]);

  const loadLocations = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('locations')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('name');
    setLocations((data as Location[]) || []);
  }, [tenantId]);

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_archived', false)
      .order('name');
    setProducts((data as Product[]) || []);
  }, [tenantId]);

  useEffect(() => {
    loadCounts();
    loadLocations();
    loadProducts();
  }, [loadCounts, loadLocations, loadProducts]);

  // =========================================================================
  // Computed filters
  // =========================================================================

  const activeCounts = useMemo(
    () => counts.filter((c) => c.status === 'planned' || c.status === 'in_progress'),
    [counts]
  );

  const pendingReviewCounts = useMemo(
    () => counts.filter((c) => c.status === 'pending_review'),
    [counts]
  );

  // Recounts: counts that have notes starting with "Recount of" (linked recounts)
  const recountQueue = useMemo(
    () => counts.filter((c) =>
      (c.status === 'planned' || c.status === 'in_progress' || c.status === 'pending_review') &&
      c.notes?.startsWith('Recount of CC-')
    ),
    [counts]
  );

  const historyCounts = useMemo(
    () => counts.filter((c) => c.status === 'approved' || c.status === 'cancelled'),
    [counts]
  );

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const totalAdjustmentsThisMonth = useMemo(() => {
    return counts
      .filter((c) => c.status === 'approved' && c.approved_at && c.approved_at >= startOfMonth)
      .reduce((sum, c) => {
        const lineVariances = (c.lines || []).reduce(
          (ls, l) => ls + Math.abs(l.variance || 0),
          0
        );
        return sum + lineVariances;
      }, 0);
  }, [counts, startOfMonth]);

  // =========================================================================
  // Generate count number
  // =========================================================================

  async function generateCountNumber(): Promise<string> {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `CC-${today}-`;
    const { data } = await supabase
      .from('cycle_counts')
      .select('count_number')
      .eq('tenant_id', tenantId!)
      .like('count_number', `${prefix}%`)
      .order('count_number', { ascending: false })
      .limit(1);
    let seq = 1;
    if (data && data.length > 0) {
      const last = data[0].count_number;
      const lastSeq = parseInt(last.replace(prefix, ''), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(3, '0')}`;
  }

  // =========================================================================
  // Create new count
  // =========================================================================

  async function handleCreateCount() {
    if (!tenantId || !user) return;
    if (!newLocationId) {
      toast.error('Please select a location.');
      return;
    }
    setCreating(true);
    try {
      const countNumber = await generateCountNumber();

      const { data: countData, error: countError } = await supabase
        .from('cycle_counts')
        .insert({
          tenant_id: tenantId,
          count_number: countNumber,
          location_id: newLocationId,
          status: 'planned' as CountStatus,
          count_type: newType,
          is_blind: newBlind,
          planned_date: newPlannedDate || null,
          created_by: user.id,
          notes: newNotes || null,
        })
        .select()
        .single();

      if (countError) throw countError;

      // Determine products to count
      let productIdsToCount: string[] = [];
      if (newProductIds.length > 0) {
        productIdsToCount = newProductIds;
      } else {
        // All products at location -- pull from bin_inventory, then fall back to lots
        const { data: binInv } = await supabase
          .from('bin_inventory')
          .select('product_id, quantity')
          .eq('tenant_id', tenantId);

        // Also get lots for this location
        const { data: lotsData } = await supabase
          .from('lots')
          .select('product_id, quantity_on_hand, location_id')
          .eq('tenant_id', tenantId)
          .eq('location_id', newLocationId);

        const productSet = new Set<string>();
        (binInv || []).forEach((bi) => productSet.add(bi.product_id));
        (lotsData || []).forEach((l) => productSet.add(l.product_id));
        productIdsToCount = Array.from(productSet);
      }

      if (productIdsToCount.length === 0) {
        toast.warning('No products found at this location. Count created with no lines.');
      }

      // Build lines -- get system quantities
      const lines: {
        tenant_id: string;
        count_id: string;
        product_id: string;
        lot_id: string | null;
        location: string | null;
        system_quantity: number;
      }[] = [];

      for (const pid of productIdsToCount) {
        // Sum bin_inventory quantities for this product
        const { data: biRows } = await supabase
          .from('bin_inventory')
          .select('quantity, lot_id')
          .eq('tenant_id', tenantId)
          .eq('product_id', pid);

        // Sum lot quantities at this location
        const { data: lotRows } = await supabase
          .from('lots')
          .select('id, quantity_on_hand, lot_number')
          .eq('tenant_id', tenantId)
          .eq('product_id', pid)
          .eq('location_id', newLocationId);

        if (lotRows && lotRows.length > 0) {
          // One line per lot at this location
          for (const lot of lotRows) {
            lines.push({
              tenant_id: tenantId,
              count_id: countData.id,
              product_id: pid,
              lot_id: lot.id,
              location: locations.find((l) => l.id === newLocationId)?.name || null,
              system_quantity: lot.quantity_on_hand,
            });
          }
        } else if (biRows && biRows.length > 0) {
          const total = biRows.reduce((s, r) => s + (r.quantity || 0), 0);
          lines.push({
            tenant_id: tenantId,
            count_id: countData.id,
            product_id: pid,
            lot_id: biRows[0]?.lot_id || null,
            location: locations.find((l) => l.id === newLocationId)?.name || null,
            system_quantity: total,
          });
        } else {
          lines.push({
            tenant_id: tenantId,
            count_id: countData.id,
            product_id: pid,
            lot_id: null,
            location: locations.find((l) => l.id === newLocationId)?.name || null,
            system_quantity: 0,
          });
        }
      }

      if (lines.length > 0) {
        const { error: lineError } = await supabase
          .from('cycle_count_lines')
          .insert(lines);
        if (lineError) throw lineError;
      }

      toast.success(`Cycle count ${countNumber} created with ${lines.length} line(s).`);
      setNewCountOpen(false);
      resetNewCountForm();
      await loadCounts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create count';
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  function resetNewCountForm() {
    setNewType('full');
    setNewLocationId('');
    setNewProductIds([]);
    setNewBlind(false);
    setNewPlannedDate('');
    setNewNotes('');
    setProductSearch('');
  }

  // =========================================================================
  // Count entry
  // =========================================================================

  async function refreshSnapshot(count: CountWithDetails) {
    if (!window.confirm('Refresh system balances and clear previous entries for a new physical count?')) return;
    setRefreshingSnapshot(true);
    try {
      const { error } = await supabase.rpc('refresh_cycle_count_document', { p_count_id: count.id });
      if (error) { toast.error(error.message); return; }
      setCountEntryOpen(false);
      setVarianceDetailOpen(false);
      setSelectedCount(null);
      setActiveTab('active');
      await loadCounts();
      toast.success('Balances refreshed. Open the document to enter the new count.');
    } finally { setRefreshingSnapshot(false); }
  }

  function printCountSheet(count: CountWithDetails) {
    const preview = window.open('', '_blank');
    if (!preview) { toast.error('Allow pop-ups to print the count sheet.'); return; }
    preview.opener = null;
    const doc = preview.document;
    doc.title = count.count_number;
    const heading = doc.createElement('h1');
    heading.textContent = `Count Sheet · ${count.count_number}`;
    const summary = doc.createElement('p');
    summary.textContent = [count.location?.name, count.planned_date, 'Counter: __________________'].filter(Boolean).join(' · ');
    const table = doc.createElement('table');
    table.style.cssText = 'border-collapse:collapse;width:100%;font:14px system-ui';
    const columns = ['Bin / Location', 'SKU', 'Product', 'Lot', ...(count.is_blind ? [] : ['System Qty']), 'Actual Qty'];
    const header = table.createTHead().insertRow();
    const body = table.createTBody();
    function writeCell(row: HTMLTableRowElement, value: string, headerCell = false) {
      const cell = doc.createElement(headerCell ? 'th' : 'td');
      cell.style.cssText = 'border:1px solid #777;padding:8px;text-align:left';
      cell.textContent = value;
      row.append(cell);
    }
    columns.forEach(column => writeCell(header, column, true));
    (count.lines || []).forEach(line => {
      const row = body.insertRow();
      [line.location || '', line.product?.sku || '', line.product?.name || '', line.lot?.lot_number || '',
        ...(count.is_blind ? [] : [String(line.system_quantity)]), ''].forEach(value => writeCell(row, value));
    });
    doc.body.append(heading, summary, table);
    preview.focus();
    preview.print();
  }

  function openCountEntry(count: CountWithDetails) {
    setSelectedCount(count);
    setEntryLines(
      (count.lines || []).map((l) => ({
        lineId: l.id,
        product_name: l.product?.name || 'Unknown',
        sku: l.product?.sku || '',
        lot_number: l.lot?.lot_number || '',
        location: l.location || '',
        system_quantity: l.system_quantity,
        counted_quantity: l.counted_quantity !== null ? String(l.counted_quantity) : '',
        reason_code: l.reason_code || '',
        notes: l.notes || '',
      }))
    );
    setCountEntryOpen(true);
  }

  function updateEntryLine(idx: number, field: string, value: string) {
    setEntryLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    );
  }

  async function handleSubmitCount() {
    if (!selectedCount || !user || !tenantId) return;
    // Validate all lines have counted quantities
    const incomplete = entryLines.filter((l) => l.counted_quantity === '');
    if (incomplete.length > 0) {
      toast.error(`Please enter counted quantity for all ${incomplete.length} line(s).`);
      return;
    }
    // Validate reason codes for variances
    for (const line of entryLines) {
      const counted = Number(line.counted_quantity);
      if (!Number.isInteger(counted) || counted < 0 || counted > 2147483647) {
        toast.error('Enter a nonnegative whole quantity for each line.');
        return;
      }
      const variance = counted - line.system_quantity;
      if (variance !== 0 && !line.reason_code) {
        toast.error(`Please provide a reason code for "${line.product_name}" (variance detected).`);
        return;
      }
    }

    setSubmittingCount(true);
    try {
      // Update each line
      for (const line of entryLines) {
        const counted = Number(line.counted_quantity);
        const original = selectedCount.lines?.find((item) => item.id === line.lineId);
        const countedBy = original?.counted_quantity === counted ? original.counted_by ?? user.id : user.id;
        const countedAt = original?.counted_quantity === counted ? original.counted_at ?? new Date().toISOString() : new Date().toISOString();
        const { error } = await supabase
          .from('cycle_count_lines')
          .update({
            counted_quantity: counted,
            reason_code: line.reason_code || null,
            notes: line.notes || null,
            counted_by: countedBy,
            counted_at: countedAt,
          })
          .eq('id', line.lineId)
          .eq('tenant_id', tenantId);
        if (error) throw error;
      }

      // Update count status
      const { error: statusErr } = await supabase
        .from('cycle_counts')
        .update({ status: 'pending_review' as CountStatus })
        .eq('id', selectedCount.id)
        .eq('tenant_id', tenantId);
      if (statusErr) throw statusErr;

      toast.success('Count submitted for review.');
      setCountEntryOpen(false);
      setSelectedCount(null);
      await loadCounts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit count';
      toast.error(message);
    } finally {
      setSubmittingCount(false);
    }
  }

  // =========================================================================
  // Variance review -- post variance
  // =========================================================================

  async function handlePostVariance(count: CountWithDetails) {
    if (!user || !tenantId) return;
    setPostingVariance(true);
    try {
      const { error } = await supabase.rpc('post_cycle_count', { p_count_id: count.id });
      if (error) throw error;
      toast.success('Count approved and stock adjusted');
      await loadCounts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to post variance';
      toast.error(message);
    } finally {
      setPostingVariance(false);
    }
  }

  // =========================================================================
  // Recount
  // =========================================================================

  function openRecountDialog(count: CountWithDetails) {
    setSelectedCount(count);
    setRecountLocationIds([]);
    setRecountDialogOpen(true);
  }

  function toggleRecountLocation(locId: string) {
    setRecountLocationIds((prev) =>
      prev.includes(locId) ? prev.filter((id) => id !== locId) : [...prev, locId]
    );
  }

  async function handleCreateRecount() {
    if (!selectedCount || !tenantId || !user) return;
    if (recountLocationIds.length === 0) {
      toast.error('Please select at least one location to recount.');
      return;
    }
    setCreatingRecount(true);
    try {
      // Get product IDs with variances from the original count
      const varianceProductIds = (selectedCount.lines || [])
        .filter((l) => l.variance !== null && l.variance !== 0)
        .map((l) => l.product_id);
      const uniqueProductIds = Array.from(new Set(varianceProductIds));

      for (const locId of recountLocationIds) {
        const countNumber = await generateCountNumber();
        const loc = locations.find((l) => l.id === locId);

        const { data: newCount, error: countErr } = await supabase
          .from('cycle_counts')
          .insert({
            tenant_id: tenantId,
            count_number: countNumber,
            location_id: locId,
            status: 'planned' as CountStatus,
            count_type: 'spot',
            is_blind: selectedCount.is_blind,
            planned_date: new Date().toISOString().split('T')[0],
            created_by: user.id,
            notes: `Recount of ${selectedCount.count_number}`,
          })
          .select()
          .single();
        if (countErr) throw countErr;

        // Create lines for variance products at this location
        const lines: {
          tenant_id: string;
          count_id: string;
          product_id: string;
          lot_id: string | null;
          location: string | null;
          system_quantity: number;
        }[] = [];

        for (const pid of uniqueProductIds) {
          const { data: lotRows } = await supabase
            .from('lots')
            .select('id, quantity_on_hand')
            .eq('tenant_id', tenantId)
            .eq('product_id', pid)
            .eq('location_id', locId);

          if (lotRows && lotRows.length > 0) {
            for (const lot of lotRows) {
              lines.push({
                tenant_id: tenantId,
                count_id: newCount.id,
                product_id: pid,
                lot_id: lot.id,
                location: loc?.name || null,
                system_quantity: lot.quantity_on_hand,
              });
            }
          } else {
            const { data: biRows } = await supabase
              .from('bin_inventory')
              .select('quantity, lot_id')
              .eq('tenant_id', tenantId)
              .eq('product_id', pid);
            const total = (biRows || []).reduce((s, r) => s + (r.quantity || 0), 0);
            lines.push({
              tenant_id: tenantId,
              count_id: newCount.id,
              product_id: pid,
              lot_id: null,
              location: loc?.name || null,
              system_quantity: total,
            });
          }
        }

        if (lines.length > 0) {
          const { error: lineErr } = await supabase
            .from('cycle_count_lines')
            .insert(lines);
          if (lineErr) throw lineErr;
        }
      }

      toast.success(`Recount(s) created for ${recountLocationIds.length} location(s).`);
      setRecountDialogOpen(false);
      setVarianceDetailOpen(false);
      setSelectedCount(null);
      await loadCounts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create recount';
      toast.error(message);
    } finally {
      setCreatingRecount(false);
    }
  }

  // =========================================================================
  // Reject
  // =========================================================================

  function openRejectDialog(count: CountWithDetails) {
    setSelectedCount(count);
    setRejectNotes('');
    setRejectDialogOpen(true);
  }

  async function handleReject() {
    if (!selectedCount || !tenantId) return;
    setRejecting(true);
    try {
      const { error } = await supabase
        .from('cycle_counts')
        .update({
          status: 'in_progress' as CountStatus,
          notes: selectedCount.notes
            ? `${selectedCount.notes}\n\nRejected: ${rejectNotes}`
            : `Rejected: ${rejectNotes}`,
        })
        .eq('id', selectedCount.id)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      toast.success(`Count ${selectedCount.count_number} sent back to counter.`);
      setRejectDialogOpen(false);
      setVarianceDetailOpen(false);
      setSelectedCount(null);
      await loadCounts();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reject count';
      toast.error(message);
    } finally {
      setRejecting(false);
    }
  }

  // =========================================================================
  // CSV export
  // =========================================================================

  function handleExportHistory() {
    const rows = historyCounts.map((c) => ({
      count_number: c.count_number,
      date: formatDate(c.planned_date),
      location: c.location?.name || '',
      type: c.count_type,
      total_items: (c.lines || []).length,
      total_variance: (c.lines || []).reduce((s, l) => s + Math.abs(l.variance || 0), 0),
      posted_by: c.approved_by_user?.full_name || '',
      posted_at: formatDateTime(c.approved_at),
      status: c.status,
    }));
    exportToCSV(rows, 'cycle_count_history', [
      { key: 'count_number', label: 'Count #' },
      { key: 'date', label: 'Date' },
      { key: 'location', label: 'Location' },
      { key: 'type', label: 'Type' },
      { key: 'total_items', label: 'Total Items' },
      { key: 'total_variance', label: 'Total Variance' },
      { key: 'posted_by', label: 'Posted By' },
      { key: 'posted_at', label: 'Posted At' },
      { key: 'status', label: 'Status' },
    ]);
  }

  // =========================================================================
  // Column definitions
  // =========================================================================

  const activeColumns: Column<CountWithDetails>[] = [
    { key: 'count_number', label: 'Count #', sortable: true },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <Badge variant={statusVariant[row.status]}>{statusLabel(row.status)}</Badge>
      ),
    },
    {
      key: 'count_type',
      label: 'Type',
      render: (row) => <span className="capitalize">{row.count_type}</span>,
    },
    {
      key: 'location_id',
      label: 'Location',
      render: (row) => row.location?.name || '\u2014',
    },
    {
      key: 'planned_date',
      label: 'Planned Date',
      sortable: true,
      render: (row) => formatDate(row.planned_date),
    },
    {
      key: 'created_by',
      label: 'Created By',
      render: (row) => row.created_by_user?.full_name || '\u2014',
    },
    {
      key: 'lines',
      label: 'Progress',
      render: (row) => {
        const total = (row.lines || []).length;
        const counted = (row.lines || []).filter((l) => l.counted_quantity !== null).length;
        return (
          <span className="text-sm text-muted-foreground">
            {counted}/{total}
          </span>
        );
      },
    },
  ];

  const reviewColumns: Column<CountWithDetails>[] = [
    { key: 'count_number', label: 'Count #', sortable: true },
    {
      key: 'count_type',
      label: 'Type',
      render: (row) => <span className="capitalize">{row.count_type}</span>,
    },
    {
      key: 'location_id',
      label: 'Location',
      render: (row) => row.location?.name || '\u2014',
    },
    {
      key: 'lines',
      label: 'Variances',
      render: (row) => {
        const vars = (row.lines || []).filter((l) => l.variance !== null && l.variance !== 0);
        const totalAbs = vars.reduce((s, l) => s + Math.abs(l.variance || 0), 0);
        return vars.length > 0 ? (
          <span className="font-medium text-destructive">{vars.length} lines, {totalAbs} units</span>
        ) : (
          <span className="text-muted-foreground">No variance</span>
        );
      },
    },
    {
      key: 'created_by',
      label: 'Counted By',
      render: (row) => row.created_by_user?.full_name || '\u2014',
    },
  ];

  const recountColumns: Column<CountWithDetails>[] = [
    { key: 'count_number', label: 'Count #', sortable: true },
    {
      key: 'notes',
      label: 'Recount Of',
      render: (row) => {
        const match = row.notes?.match(/Recount of (CC-[\w-]+)/);
        return match ? (
          <Badge variant="outline" className="font-mono text-xs">{match[1]}</Badge>
        ) : '\u2014';
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge variant={statusVariant[row.status]}>{statusLabel(row.status)}</Badge>
      ),
    },
    {
      key: 'location_id',
      label: 'Location',
      render: (row) => row.location?.name || '\u2014',
    },
    {
      key: 'lines',
      label: 'Progress',
      render: (row) => {
        const total = (row.lines || []).length;
        const counted = (row.lines || []).filter((l) => l.counted_quantity !== null).length;
        return <span className="text-sm">{counted}/{total}</span>;
      },
    },
  ];

  const historyColumns: Column<CountWithDetails>[] = [
    { key: 'count_number', label: 'Count #', sortable: true },
    {
      key: 'planned_date',
      label: 'Date',
      sortable: true,
      render: (row) => formatDate(row.planned_date),
    },
    {
      key: 'location_id',
      label: 'Location',
      render: (row) => row.location?.name || '\u2014',
    },
    {
      key: 'count_type',
      label: 'Type',
      render: (row) => <span className="capitalize">{row.count_type}</span>,
    },
    {
      key: 'lines',
      label: 'Items',
      render: (row) => (row.lines || []).length,
    },
    {
      key: 'id',
      label: 'Total Variance',
      render: (row) => {
        const total = (row.lines || []).reduce((s, l) => s + Math.abs(l.variance || 0), 0);
        return total > 0 ? (
          <span className="font-medium text-destructive">{formatNumber(total)}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        );
      },
    },
    {
      key: 'approved_by',
      label: 'Posted By',
      render: (row) => row.approved_by_user?.full_name || '\u2014',
    },
    {
      key: 'approved_at',
      label: 'Posted At',
      sortable: true,
      render: (row) => formatDateTime(row.approved_at),
    },
  ];

  // =========================================================================
  // Filtered products for multi-select
  // =========================================================================

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products.slice(0, 50);
    const lower = productSearch.toLowerCase();
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(lower) ||
          p.sku.toLowerCase().includes(lower)
      )
      .slice(0, 50);
  }, [products, productSearch]);

  function toggleProductSelection(pid: string) {
    setNewProductIds((prev) =>
      prev.includes(pid) ? prev.filter((id) => id !== pid) : [...prev, pid]
    );
  }

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cycle Counts"
        description="Manage inventory cycle counts, variance review, and adjustments"
        actions={
          <Button onClick={() => { resetNewCountForm(); setNewCountOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> New Count
          </Button>
        }
      />

      <CountPlanner locations={locations} onCreated={loadCounts} revision={planRevision} />
      <RecurringCounts locations={locations} onGenerated={loadCounts} />

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Active Counts" value={activeCounts.length} icon={ClipboardCheck} />
        <StatCard title="Pending Review" value={pendingReviewCounts.length} icon={AlertTriangle} />
        <StatCard title="Recounts Pending" value={recountQueue.length} icon={RotateCcw} />
        <StatCard
          title="Adjustments This Month"
          value={formatNumber(totalAdjustmentsThisMonth)}
          icon={BarChart3}
          description="Sum of absolute variances"
        />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active">
            Active Counts
            {activeCounts.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{activeCounts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="review">
            Variance Review
            {pendingReviewCounts.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs">{pendingReviewCounts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="recount">
            Recount Queue
            {recountQueue.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{recountQueue.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Active Counts */}
        <TabsContent value="active" className="space-y-4">
          <DataTable
            data={activeCounts}
            columns={activeColumns}
            searchKey="count_number"
            searchPlaceholder="Search active counts..."
            onRowClick={(row) => openCountEntry(row)}
            emptyMessage={loading ? 'Loading...' : 'No active cycle counts.'}
          />
        </TabsContent>

        {/* Variance Review */}
        <TabsContent value="review" className="space-y-4">
          <DataTable
            data={pendingReviewCounts}
            columns={reviewColumns}
            searchKey="count_number"
            searchPlaceholder="Search pending reviews..."
            onRowClick={(row) => {
              setSelectedCount(row);
              setVarianceDetailOpen(true);
            }}
            emptyMessage={loading ? 'Loading...' : 'No counts pending review.'}
          />
        </TabsContent>

        {/* Recount Queue */}
        <TabsContent value="recount" className="space-y-4">
          <DataTable
            data={recountQueue}
            columns={recountColumns}
            searchKey="count_number"
            searchPlaceholder="Search recounts..."
            onRowClick={(row) => openCountEntry(row)}
            emptyMessage={loading ? 'Loading...' : 'No recounts pending.'}
          />
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-4">
          <DataTable
            data={historyCounts}
            columns={historyColumns}
            searchKey="count_number"
            searchPlaceholder="Search history..."
            onRowClick={(row) => {
              setSelectedCount(row);
              setHistoryDetailOpen(true);
            }}
            emptyMessage={loading ? 'Loading...' : 'No completed counts.'}
            actions={
              <Button variant="outline" size="sm" onClick={handleExportHistory} disabled={historyCounts.length === 0}>
                <Download className="h-4 w-4 mr-2" /> Export CSV
              </Button>
            }
          />
        </TabsContent>
      </Tabs>

      {/* ================================================================= */}
      {/* NEW COUNT DIALOG                                                   */}
      {/* ================================================================= */}
      <Dialog open={newCountOpen} onOpenChange={setNewCountOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Cycle Count</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Count Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">Full</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="spot">Spot</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={newLocationId} onValueChange={setNewLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location..." />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Planned Date</Label>
              <Input
                type="date"
                value={newPlannedDate}
                onChange={(e) => setNewPlannedDate(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="blind-count"
                checked={newBlind}
                onChange={(e) => setNewBlind(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="blind-count" className="cursor-pointer">
                Blind count (hides system quantities from counter)
              </Label>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Products (optional - leave empty for all products at location)</Label>
              <Input
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {newProductIds.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {newProductIds.map((pid) => {
                    const p = products.find((pr) => pr.id === pid);
                    return (
                      <Badge
                        key={pid}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => toggleProductSelection(pid)}
                      >
                        {p?.name || pid}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    );
                  })}
                </div>
              )}
              <div className="border rounded-md max-h-40 overflow-y-auto">
                {filteredProducts.map((p) => {
                  const selected = newProductIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm ${
                        selected ? 'bg-muted' : ''
                      }`}
                      onClick={() => toggleProductSelection(p.id)}
                    >
                      <div>
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 text-muted-foreground">{p.sku}</span>
                      </div>
                      {selected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                    No products found
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCountOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateCount} disabled={creating}>
              {creating ? 'Creating...' : 'Create Count'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* COUNT ENTRY DIALOG                                                 */}
      {/* ================================================================= */}
      <Dialog open={countEntryOpen} onOpenChange={setCountEntryOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Count Entry - {selectedCount?.count_number}
              {selectedCount?.is_blind && (
                <Badge variant="outline" className="ml-2">Blind Count</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Location: {selectedCount?.location?.name || '\u2014'}</span>
              <span>Type: <span className="capitalize">{selectedCount?.count_type}</span></span>
              <span>Lines: {entryLines.length}</span>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Bin/Location</TableHead>
                    {!selectedCount?.is_blind && <TableHead className="text-right">System Qty</TableHead>}
                    <TableHead className="text-right">Counted Qty</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Reason Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entryLines.map((line, idx) => {
                    const counted = line.counted_quantity !== '' ? parseInt(line.counted_quantity, 10) : null;
                    const variance = counted !== null ? counted - line.system_quantity : null;
                    return (
                      <TableRow key={line.lineId}>
                        <TableCell className="font-medium">{line.product_name}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{line.sku}</TableCell>
                        <TableCell>{line.lot_number || '\u2014'}</TableCell>
                        <TableCell>{line.location || '\u2014'}</TableCell>
                        {!selectedCount?.is_blind && (
                          <TableCell className="text-right">{formatNumber(line.system_quantity)}</TableCell>
                        )}
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            className="w-24 ml-auto text-right"
                            value={line.counted_quantity}
                            onChange={(e) => updateEntryLine(idx, 'counted_quantity', e.target.value)}
                            placeholder="0"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {variance !== null ? (
                            <span
                              className={`font-semibold ${
                                variance > 0
                                  ? 'text-green-600'
                                  : variance < 0
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {variance > 0 ? '+' : ''}
                              {variance}
                            </span>
                          ) : (
                            '\u2014'
                          )}
                        </TableCell>
                        <TableCell>
                          {variance !== null && variance !== 0 ? (
                            <Select
                              value={line.reason_code}
                              onValueChange={(v) => updateEntryLine(idx, 'reason_code', v)}
                            >
                              <SelectTrigger className="w-44">
                                <SelectValue placeholder="Select reason..." />
                              </SelectTrigger>
                              <SelectContent>
                                {REASON_CODES.map((rc) => (
                                  <SelectItem key={rc.value} value={rc.value}>
                                    {rc.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground text-sm">\u2014</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {entryLines.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        No lines in this count.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
          {selectedCount?.plan_id && tenantId && (
            <AssignScanner key={selectedCount.id} countId={selectedCount.id} tenantId={tenantId} />
          )}
          <DialogFooter>
            {selectedCount && (
              <Button variant="outline" onClick={() => printCountSheet(selectedCount)}>Print Count Sheet</Button>
            )}
            {selectedCount?.plan_id && (
              <Button variant="outline" disabled={refreshingSnapshot} onClick={() => void refreshSnapshot(selectedCount)}>Refresh and Recount</Button>
            )}
            <Button variant="outline" onClick={() => setCountEntryOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitCount} disabled={submittingCount || entryLines.length === 0}>
              {submittingCount ? 'Submitting...' : 'Submit Count'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* VARIANCE REVIEW DETAIL DIALOG                                      */}
      {/* ================================================================= */}
      <Dialog open={varianceDetailOpen} onOpenChange={setVarianceDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Variance Review - {selectedCount?.count_number}</DialogTitle>
          </DialogHeader>
          {selectedCount && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Location: {selectedCount.location?.name || '\u2014'}</span>
                <span>Type: <span className="capitalize">{selectedCount.count_type}</span></span>
                <span>Counter: {selectedCount.created_by_user?.full_name || '\u2014'}</span>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Variance Lines</CardTitle>
                  <CardDescription>
                    Lines with discrepancies between system and counted quantities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Lot</TableHead>
                          <TableHead>Bin/Location</TableHead>
                          <TableHead className="text-right">System Qty</TableHead>
                          <TableHead className="text-right">Counted Qty</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(selectedCount.lines || [])
                          .filter((l) => l.counted_quantity !== null)
                          .map((line) => {
                            const hasVariance = line.variance !== null && line.variance !== 0;
                            return (
                              <TableRow key={line.id} className={hasVariance ? 'bg-muted/30' : ''}>
                                <TableCell className="font-medium">
                                  {line.product?.name || 'Unknown'}
                                  <div className="text-xs text-muted-foreground font-mono">
                                    {line.product?.sku}
                                  </div>
                                </TableCell>
                                <TableCell>{line.lot?.lot_number || '\u2014'}</TableCell>
                                <TableCell>{line.location || '\u2014'}</TableCell>
                                <TableCell className="text-right">{formatNumber(line.system_quantity)}</TableCell>
                                <TableCell className="text-right">
                                  {line.counted_quantity !== null ? formatNumber(line.counted_quantity) : '\u2014'}
                                </TableCell>
                                <TableCell className="text-right">
                                  {line.variance !== null ? (
                                    <span
                                      className={`font-semibold ${
                                        line.variance > 0
                                          ? 'text-green-600'
                                          : line.variance < 0
                                          ? 'text-destructive'
                                          : 'text-muted-foreground'
                                      }`}
                                    >
                                      {line.variance > 0 ? '+' : ''}
                                      {line.variance}
                                    </span>
                                  ) : (
                                    '\u2014'
                                  )}
                                </TableCell>
                                <TableCell>
                                  {line.reason_code ? (
                                    <Badge variant="outline" className="text-xs">
                                      {REASON_CODES.find((r) => r.value === line.reason_code)?.label ||
                                        line.reason_code}
                                    </Badge>
                                  ) : (
                                    '\u2014'
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Summary */}
              {(() => {
                const varianceLines = (selectedCount.lines || []).filter(
                  (l) => l.variance !== null && l.variance !== 0
                );
                const totalAbsVar = varianceLines.reduce(
                  (s, l) => s + Math.abs(l.variance || 0),
                  0
                );
                const netVar = varianceLines.reduce((s, l) => s + (l.variance || 0), 0);
                return (
                  <div className="flex items-center gap-6 text-sm bg-muted/50 rounded-lg p-4">
                    <div>
                      <span className="text-muted-foreground">Variance lines:</span>{' '}
                      <span className="font-semibold">{varianceLines.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Net variance:</span>{' '}
                      <span className={`font-semibold ${netVar < 0 ? 'text-destructive' : netVar > 0 ? 'text-green-600' : ''}`}>
                        {netVar > 0 ? '+' : ''}{netVar}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total abs variance:</span>{' '}
                      <span className="font-semibold">{totalAbsVar}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="destructive"
              onClick={() => selectedCount && openRejectDialog(selectedCount)}
            >
              <X className="h-4 w-4 mr-2" /> Reject
            </Button>
            <Button
              variant="outline"
              disabled={refreshingSnapshot}
              onClick={() => {
                if (!selectedCount) return;
                if (selectedCount.plan_id) void refreshSnapshot(selectedCount);
                else openRecountDialog(selectedCount);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Request Recount
            </Button>
            <Button
              onClick={() => selectedCount && handlePostVariance(selectedCount)}
              disabled={postingVariance}
            >
              <Check className="h-4 w-4 mr-2" />
              {postingVariance ? 'Posting...' : 'Post Variance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* RECOUNT DIALOG                                                     */}
      {/* ================================================================= */}
      <Dialog open={recountDialogOpen} onOpenChange={setRecountDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Recount</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select locations to recount products that had variances in{' '}
              <span className="font-mono font-medium">{selectedCount?.count_number}</span>.
            </p>
            <div className="space-y-1">
              <Label>Variance Products</Label>
              <div className="flex flex-wrap gap-1">
                {selectedCount &&
                  Array.from(new Set(
                    (selectedCount.lines || [])
                      .filter((l) => l.variance !== null && l.variance !== 0)
                      .map((l) => l.product?.name || 'Unknown')
                  )).map((name) => (
                    <Badge key={name} variant="secondary" className="text-xs">
                      {name}
                    </Badge>
                  ))}
              </div>
            </div>
            <Separator />
            <div className="space-y-1">
              <Label>Select Locations to Recount</Label>
              <div className="border rounded-md max-h-60 overflow-y-auto">
                {locations.map((loc) => {
                  const selected = recountLocationIds.includes(loc.id);
                  return (
                    <div
                      key={loc.id}
                      className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 text-sm ${
                        selected ? 'bg-muted' : ''
                      }`}
                      onClick={() => toggleRecountLocation(loc.id)}
                    >
                      <span>{loc.name}</span>
                      {selected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecountDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateRecount} disabled={creatingRecount || recountLocationIds.length === 0}>
              {creatingRecount ? 'Creating...' : `Create Recount (${recountLocationIds.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* REJECT DIALOG                                                      */}
      {/* ================================================================= */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Count - {selectedCount?.count_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This count will be sent back to the counter for revision.
            </p>
            <div className="space-y-2">
              <Label>Rejection Notes</Label>
              <Textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Explain why this count is being rejected..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || !rejectNotes.trim()}
            >
              {rejecting ? 'Rejecting...' : 'Reject Count'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* HISTORY DETAIL DIALOG (Read-Only)                                  */}
      {/* ================================================================= */}
      <Dialog open={historyDetailOpen} onOpenChange={setHistoryDetailOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                {selectedCount?.count_number}
                <Badge variant={selectedCount ? statusVariant[selectedCount.status] : 'outline'}>
                  {selectedCount ? statusLabel(selectedCount.status) : ''}
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>
          {selectedCount && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block">Location</span>
                  <span className="font-medium">{selectedCount.location?.name || '\u2014'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Type</span>
                  <span className="font-medium capitalize">{selectedCount.count_type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Planned Date</span>
                  <span className="font-medium">{formatDate(selectedCount.planned_date)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Posted At</span>
                  <span className="font-medium">{formatDateTime(selectedCount.approved_at)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Created By</span>
                  <span className="font-medium">{selectedCount.created_by_user?.full_name || '\u2014'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Approved By</span>
                  <span className="font-medium">{selectedCount.approved_by_user?.full_name || '\u2014'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Blind Count</span>
                  <span className="font-medium">{selectedCount.is_blind ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Total Lines</span>
                  <span className="font-medium">{(selectedCount.lines || []).length}</span>
                </div>
              </div>

              {selectedCount.notes && (
                <div className="text-sm">
                  <span className="text-muted-foreground block mb-1">Notes</span>
                  <p className="whitespace-pre-wrap bg-muted/50 rounded-lg p-3">{selectedCount.notes}</p>
                </div>
              )}

              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Lot</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">System Qty</TableHead>
                      <TableHead className="text-right">Counted Qty</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(selectedCount.lines || []).map((line) => (
                      <TableRow key={line.id}>
                        <TableCell className="font-medium">{line.product?.name || 'Unknown'}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {line.product?.sku || '\u2014'}
                        </TableCell>
                        <TableCell>{line.lot?.lot_number || '\u2014'}</TableCell>
                        <TableCell>{line.location || '\u2014'}</TableCell>
                        <TableCell className="text-right">{formatNumber(line.system_quantity)}</TableCell>
                        <TableCell className="text-right">
                          {line.counted_quantity !== null ? formatNumber(line.counted_quantity) : '\u2014'}
                        </TableCell>
                        <TableCell className="text-right">
                          {line.variance !== null ? (
                            <span
                              className={`font-semibold ${
                                line.variance > 0
                                  ? 'text-green-600'
                                  : line.variance < 0
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                              }`}
                            >
                              {line.variance > 0 ? '+' : ''}
                              {line.variance}
                            </span>
                          ) : (
                            '\u2014'
                          )}
                        </TableCell>
                        <TableCell>
                          {line.reason_code ? (
                            <Badge variant="outline" className="text-xs">
                              {REASON_CODES.find((r) => r.value === line.reason_code)?.label ||
                                line.reason_code}
                            </Badge>
                          ) : (
                            '\u2014'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(selectedCount.lines || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                          No lines recorded.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
