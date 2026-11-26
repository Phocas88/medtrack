'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  PackageOpen,
  PackageCheck,
  Clock,
  Check,
  ChevronRight,
  UserPlus,
  Users,
  Download,
  Play,
  X,
  AlertCircle,
  MapPin,
  ScanBarcode,
  ArrowRight,
  BarChart3,
  Inbox,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportToCSV } from '@/lib/csv';
import type {
  ScanTask,
  Bin,
  Product,
  Lot,
  Location,
  User as DBUser,
} from '@/types/database';

// ── Types ──

type PutAwayTask = ScanTask & {
  product?: Product | null;
  lot?: (Lot & { lot_number: string }) | null;
  location?: Location | null;
  target_bin?: Bin | null;
  source_bin?: Bin | null;
  assigned_user?: DBUser | null;
  completed_user?: DBUser | null;
};

// ── Component ──

export default function PutAwayPage() {
  const { user, tenantId, role } = useAuth();
  const isManager = role === 'admin' || role === 'manager';

  // Data
  const [pendingTasks, setPendingTasks] = useState<PutAwayTask[]>([]);
  const [inProgressTasks, setInProgressTasks] = useState<PutAwayTask[]>([]);
  const [completedTasks, setCompletedTasks] = useState<PutAwayTask[]>([]);
  const [users, setUsers] = useState<DBUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Summary stats
  const [completedToday, setCompletedToday] = useState(0);
  const [avgPutAwayMinutes, setAvgPutAwayMinutes] = useState<number | null>(null);
  const [receivingDockItems, setReceivingDockItems] = useState(0);

  // Assign dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTaskId, setAssignTaskId] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignAllMode, setAssignAllMode] = useState(false);

  // Active put-away workflow
  const [activeTask, setActiveTask] = useState<PutAwayTask | null>(null);
  const [scannerTaskId, setScannerTaskId] = useState<string | null>(null);

  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setScannerTaskId(params.get('task'));
    setReviewTaskId(params.get('review'));
  }, []);
  const [workflowStep, setWorkflowStep] = useState(0);
  const [scanInput, setScanInput] = useState('');
  const [confirmedQty, setConfirmedQty] = useState('');
  const [scannedTargetBin, setScannedTargetBin] = useState<Bin | null>(null);
  const [completing, setCompleting] = useState(false);

  // Completed tab date filter
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── Load Data ──

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const supabase = createClient();

    const taskSelect = `
      *,
      product:products!scan_tasks_product_id_fkey(*),
      lot:lots(*),
      location:locations(*),
      target_bin:bins!scan_tasks_target_bin_id_fkey(*),
      source_bin:bins!scan_tasks_source_bin_id_fkey(*),
      assigned_user:users!scan_tasks_assigned_to_fkey(*)
    `;

    const [pendingRes, inProgressRes, completedRes, usersRes] = await Promise.all([
      supabase
        .from('scan_tasks')
        .select(taskSelect)
        .eq('tenant_id', tenantId)
        .eq('task_type', 'putaway')
        .in('status', ['pending', 'assigned'])
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true }),
      supabase
        .from('scan_tasks')
        .select(taskSelect)
        .eq('tenant_id', tenantId)
        .eq('task_type', 'putaway')
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false }),
      supabase
        .from('scan_tasks')
        .select(taskSelect)
        .eq('tenant_id', tenantId)
        .eq('task_type', 'putaway')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(200),
      supabase
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('full_name'),
    ]);

    setPendingTasks((pendingRes.data as PutAwayTask[]) || []);
    setInProgressTasks((inProgressRes.data as PutAwayTask[]) || []);
    setCompletedTasks((completedRes.data as PutAwayTask[]) || []);
    setUsers(usersRes.data || []);

    // Compute summary stats
    const allCompleted = (completedRes.data as PutAwayTask[]) || [];
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCompleted = allCompleted.filter(
      (t) => t.completed_at && t.completed_at.startsWith(todayStr)
    );
    setCompletedToday(todayCompleted.length);

    // Average put-away time
    const durations = allCompleted
      .filter((t) => t.started_at && t.completed_at)
      .map((t) => {
        const start = new Date(t.started_at!).getTime();
        const end = new Date(t.completed_at!).getTime();
        return (end - start) / 60000; // minutes
      })
      .filter((d) => d > 0 && d < 1440); // filter unreasonable values

    if (durations.length > 0) {
      setAvgPutAwayMinutes(Math.round(durations.reduce((a, b) => a + b, 0) / durations.length));
    } else {
      setAvgPutAwayMinutes(null);
    }

    // Items in receiving dock - count lots at receiving-type locations without completed putaway
    const { count } = await supabase
      .from('scan_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('task_type', 'putaway')
      .in('status', ['pending', 'assigned', 'in_progress']);
    setReceivingDockItems(count || 0);

    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Assign Task ──

  const openAssignDialog = (taskId: string | null, allMode: boolean) => {
    setAssignTaskId(taskId);
    setAssignAllMode(allMode);
    setAssignUserId('');
    setAssignDialogOpen(true);
  };

  const handleAssign = async () => {
    if (!assignUserId || !tenantId || !user) return;
    const supabase = createClient();
    const now = new Date().toISOString();

    if (assignAllMode) {
      // Assign all pending tasks
      const ids = pendingTasks.filter((t) => t.status === 'pending').map((t) => t.id);
      if (ids.length === 0) {
        toast.error('No pending tasks to assign');
        return;
      }
      const { error } = await supabase
        .from('scan_tasks')
        .update({
          assigned_to: assignUserId,
          assigned_by: user.id,
          assigned_at: now,
          status: 'assigned',
        })
        .in('id', ids);

      if (error) {
        toast.error('Failed to assign tasks');
      } else {
        toast.success(`${ids.length} task(s) assigned`);
      }
    } else if (assignTaskId) {
      const { error } = await supabase
        .from('scan_tasks')
        .update({
          assigned_to: assignUserId,
          assigned_by: user.id,
          assigned_at: now,
          status: 'assigned',
        })
        .eq('id', assignTaskId);

      if (error) {
        toast.error('Failed to assign task');
      } else {
        toast.success('Task assigned');
      }
    }

    setAssignDialogOpen(false);
    loadData();
  };

  // ── Start Put-Away Workflow ──

  const handleStartPutAway = async (task: PutAwayTask) => {
    if (!user || !tenantId) return;
    const supabase = createClient();
    const { error } = await supabase.rpc('start_scan_task', { p_task_id: task.id });
    if (error) {
      toast.error(error.message);
      void loadData();
      return;
    }

    setActiveTask({ ...task, status: 'in_progress' });
    setWorkflowStep(0);
    setScanInput('');
    setConfirmedQty(String(task.requested_quantity || 0));
    setScannedTargetBin(null);
    toast.success('Put-away started');
  };

  // ── Workflow Step Handlers ──

  const workflowSteps = [
    'Confirm Location',
    'Scan Product',
    'Confirm Quantity',
    'Scan Target Bin',
    'Confirm Put-Away',
  ];

  const handleWorkflowScan = async () => {
    const value = scanInput.trim();
    if (!value || !activeTask) return;
    setScanInput('');

    const supabase = createClient();

    if (workflowStep === 0) {
      // Verify receiving location
      const { data: loc } = await supabase
        .from('locations')
        .select('*')
        .eq('tenant_id', tenantId!)
        .or(`name.ilike.%${value}%,code.ilike.%${value}%`)
        .maybeSingle();

      if (!loc) {
        toast.error('Location not recognized');
        return;
      }
      if (activeTask.location_id && loc.id !== activeTask.location_id) {
        toast.error('Does not match expected receiving location');
        return;
      }
      toast.success(`Receiving location confirmed: ${loc.name}`);
      setWorkflowStep(1);
    } else if (workflowStep === 1) {
      // Scan product barcode (SKU)
      const { data: prod } = await supabase
        .from('products')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('sku', value.toUpperCase())
        .eq('is_archived', false)
        .maybeSingle();

      if (!prod) {
        toast.error('Product not recognized');
        return;
      }
      if (activeTask.product_id && prod.id !== activeTask.product_id) {
        toast.error('Product does not match this put-away task');
        return;
      }
      toast.success(`Product verified: ${prod.name}`);
      setWorkflowStep(2);
    } else if (workflowStep === 3) {
      // Scan target bin
      const { data: bin } = await supabase
        .from('bins')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('bin_code', value.toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (!bin) {
        toast.error('Bin not found');
        return;
      }
      // Warn if different from assigned but allow override
      if (activeTask.target_bin_id && bin.id !== activeTask.target_bin_id) {
        toast.warning('Different bin than assigned. Override accepted.');
      } else {
        toast.success(`Target bin verified: ${bin.bin_code}`);
      }
      setScannedTargetBin(bin);
      setWorkflowStep(4);
    }
  };

  const handleConfirmQuantity = () => {
    const qty = parseInt(confirmedQty, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Enter a valid quantity');
      return;
    }
    setWorkflowStep(3);
  };

  // ── Complete Put-Away ──

  const handleCompletePutAway = async () => {
    if (!activeTask || !user || !tenantId || completing) return;
    const qty = Number(confirmedQty);
    const targetBin = scannedTargetBin;
    if (!targetBin || !activeTask.product_id || !Number.isSafeInteger(qty) || qty <= 0) {
      toast.error('Confirm the product, destination bin, and a positive whole quantity.');
      return;
    }
    setCompleting(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.rpc('complete_scan_task', {
        p_task_id: activeTask.id,
        p_quantity: qty,
        p_variance: null,
        p_source: activeTask.location?.code ?? '',
        p_target: targetBin.bin_code,
        p_scans: [
          { value: activeTask.product?.sku ?? activeTask.product_id },
          { value: targetBin.bin_code },
        ],
      });
      if (error) throw error;

      toast.success('Put-away completed successfully!', {
        action: {
          label: 'Next Task',
          onClick: () => handleNextTask(),
        },
      });
      setActiveTask(null);
      setWorkflowStep(0);
      setScanInput('');
      setScannedTargetBin(null);
      loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete put-away';
      toast.error(message);
    } finally {
      setCompleting(false);
    }
  };

  const handleCancelWorkflow = () => {
    setActiveTask(null);
    setWorkflowStep(0);
    setScanInput('');
    setScannedTargetBin(null);
  };

  // ── Find next pending task (called after completing a task) ──
  const handleNextTask = () => {
    const next = pendingTasks[0] || inProgressTasks[0];
    if (next) {
      handleStartPutAway(next);
    } else {
      toast.info('No more pending put-away tasks');
    }
  };

  // ── Export CSV ──

  const handleExportCSV = () => {
    let filtered = completedTasks;
    if (dateFrom) {
      filtered = filtered.filter((t) => (t.completed_at || '') >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter((t) => (t.completed_at || '') <= dateTo + 'T23:59:59');
    }

    exportToCSV(
      filtered.map((t) => ({
        completed_at: t.completed_at || '',
        product: t.product?.name || '',
        sku: t.product?.sku || '',
        lot: t.lot?.lot_number || '',
        quantity: t.scanned_quantity ?? t.requested_quantity ?? '',
        from_location: t.location?.name || '',
        to_bin: t.target_bin?.bin_code || '',
        completed_by: t.assigned_user?.full_name || '',
      })),
      'put-away-history'
    );
    toast.success('CSV exported');
  };

  // ── Format helpers ──

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getUserName = (id: string | null) => {
    if (!id) return 'Unassigned';
    return users.find((u) => u.id === id)?.full_name || 'Unknown';
  };

  // ── Render: Active Put-Away Workflow ──

  if (activeTask) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto pb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PackageOpen className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Put-Away Workflow</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancelWorkflow}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
        </div>

        {/* Task info */}
        <Card>
          <CardContent className="pt-4 space-y-1">
            <p className="font-medium">{activeTask.title}</p>
            {activeTask.instructions && (
              <p className="text-sm text-muted-foreground">{activeTask.instructions}</p>
            )}
            <div className="flex gap-4 text-sm text-muted-foreground pt-1">
              <span>Qty: <strong className="text-foreground">{activeTask.requested_quantity}</strong></span>
              {activeTask.location && <span>From: <strong className="text-foreground">{activeTask.location.name}</strong></span>}
              {activeTask.target_bin && <span>To: <strong className="text-foreground font-mono">{activeTask.target_bin.bin_code}</strong></span>}
            </div>
          </CardContent>
        </Card>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 overflow-x-auto py-2">
          {workflowSteps.map((label, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                  idx < workflowStep
                    ? 'bg-primary text-primary-foreground'
                    : idx === workflowStep
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {idx < workflowStep ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  idx === workflowStep ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
              {idx < workflowSteps.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Step 0: Confirm receiving location */}
        {workflowStep === 0 && (
          <div className="space-y-3">
            <Label className="text-base font-medium">
              <MapPin className="inline h-4 w-4 mr-1" />
              Scan or enter the receiving location code
            </Label>
            <div className="flex gap-2">
              <Input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleWorkflowScan(); }}
                placeholder="Scan location..."
                className="h-12 text-lg font-mono"
                autoFocus
              />
              <Button onClick={handleWorkflowScan} className="h-12 px-6" size="lg">
                <ScanBarcode className="h-5 w-5" />
              </Button>
            </div>
            {activeTask.location && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Expected: <strong>{activeTask.location.name} ({activeTask.location.code})</strong></span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    toast.success(`Receiving location confirmed: ${activeTask.location!.name}`);
                    setWorkflowStep(1);
                  }}
                >
                  Skip (confirm)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Scan product barcode */}
        {workflowStep === 1 && (
          <div className="space-y-3">
            <Label className="text-base font-medium">
              <ScanBarcode className="inline h-4 w-4 mr-1" />
              Scan product barcode (SKU)
            </Label>
            <div className="flex gap-2">
              <Input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleWorkflowScan(); }}
                placeholder="Scan product SKU..."
                className="h-12 text-lg font-mono"
                autoFocus
              />
              <Button onClick={handleWorkflowScan} className="h-12 px-6" size="lg">
                <ScanBarcode className="h-5 w-5" />
              </Button>
            </div>
            {activeTask.product && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Expected: <strong>{activeTask.product.name} ({activeTask.product.sku})</strong></span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    toast.success(`Product verified: ${activeTask.product!.name}`);
                    setWorkflowStep(2);
                  }}
                >
                  Skip (confirm)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Confirm quantity */}
        {workflowStep === 2 && (
          <div className="space-y-3">
            <Label className="text-base font-medium">Confirm quantity to put away</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={confirmedQty}
                onChange={(e) => setConfirmedQty(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmQuantity(); }}
                className="h-12 text-lg"
                autoFocus
              />
              <Button onClick={handleConfirmQuantity} className="h-12 px-6" size="lg">
                Confirm
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Expected: {activeTask.requested_quantity} units
            </p>
          </div>
        )}

        {/* Step 3: Scan target bin */}
        {workflowStep === 3 && (
          <div className="space-y-3">
            <Label className="text-base font-medium">
              <MapPin className="inline h-4 w-4 mr-1" />
              Scan target bin
            </Label>
            <div className="flex gap-2">
              <Input
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleWorkflowScan(); }}
                placeholder="Scan bin barcode..."
                className="h-12 text-lg font-mono"
                autoFocus
              />
              <Button onClick={handleWorkflowScan} className="h-12 px-6" size="lg">
                <ScanBarcode className="h-5 w-5" />
              </Button>
            </div>
            {activeTask.target_bin && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Assigned bin: <strong className="font-mono">{activeTask.target_bin.bin_code}</strong></span>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setScannedTargetBin(activeTask.target_bin as Bin);
                    toast.success(`Target bin confirmed: ${activeTask.target_bin!.bin_code}`);
                    setWorkflowStep(4);
                  }}
                >
                  Skip (confirm)
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Confirm put-away */}
        {workflowStep === 4 && (
          <div className="space-y-4">
            <Card className="border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Put-Away Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Product</p>
                    <p className="font-medium">{activeTask.product?.name || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Lot</p>
                    <p className="font-medium">{activeTask.lot?.lot_number || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Quantity</p>
                    <p className="text-xl font-bold">{confirmedQty}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Target Bin</p>
                    <p className="text-xl font-bold font-mono">{scannedTargetBin?.bin_code || '-'}</p>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{activeTask.location?.name || 'Receiving'}</span>
                  <ArrowRight className="h-4 w-4" />
                  <span className="font-mono font-medium">{scannedTargetBin?.bin_code || '-'}</span>
                </div>
              </CardContent>
            </Card>

            <Button
              onClick={handleCompletePutAway}
              disabled={completing}
              className="w-full h-14 text-lg"
              size="lg"
            >
              {completing ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <Check className="h-5 w-5 mr-2" />
                  Confirm Put-Away
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ── Success / Next Task overlay after completion ──

  // ── Render: Main Page ──

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Put-Away" description="Manage put-away tasks from receiving to bins" />
        <div className="py-12 text-center text-muted-foreground">Loading put-away tasks...</div>
      </div>
    );
  }

  if (reviewTaskId && (user?.role === 'admin' || user?.role === 'manager') && user.access_level !== 'scanner_only') {
    const task = [...pendingTasks, ...inProgressTasks].find(item => item.id === reviewTaskId);
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Review putaway task" />
        {task ? (
          <Card>
            <CardContent className="space-y-2 p-4">
              <p className="break-words font-semibold">{task.title}</p>
              <p>Status: {task.status.replaceAll('_', ' ')}</p>
              <p>Assigned to: {task.assigned_user?.full_name ?? 'Unassigned'}</p>
              <p>{task.instructions}</p>
            </CardContent>
          </Card>
        ) : <p role="status">This task is no longer on the open putaway list.</p>}
        <Button asChild variant="outline"><Link href="/put-away">Open putaway queue</Link></Button>
      </div>
    );
  }

  if (scannerTaskId) {
    const task = [...pendingTasks, ...inProgressTasks].find(item =>
      item.id === scannerTaskId && (!item.assigned_to || item.assigned_to === user?.id));
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title="Scanner putaway" />
        {task ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="break-words font-semibold">{task.title}</p>
              <p className="text-sm text-muted-foreground">{task.instructions}</p>
              <Button onClick={() => void handleStartPutAway(task)}>
                {task.status === 'in_progress' ? 'Resume putaway' : 'Start putaway'}
              </Button>
            </CardContent>
          </Card>
        ) : <p role="status">This task is complete, unavailable, or assigned to another operator.</p>}
        <Button asChild variant="outline"><Link href="/scan">Back to Scanner</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Put-Away"
        description="Manage put-away tasks from receiving to bins"
      />

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" className="gap-1.5">
            <Inbox className="h-4 w-4" />
            Pending
            {pendingTasks.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs">
                {pendingTasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="in-progress" className="gap-1.5">
            <Play className="h-4 w-4" />
            In Progress
            {inProgressTasks.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] text-xs">
                {inProgressTasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <Check className="h-4 w-4" />
            Completed
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Summary
          </TabsTrigger>
        </TabsList>

        {/* ── PENDING TAB ── */}
        <TabsContent value="pending" className="space-y-4">
          {isManager && pendingTasks.length > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openAssignDialog(null, true)}
              >
                <Users className="h-4 w-4 mr-1" />
                Assign All
              </Button>
            </div>
          )}

          {pendingTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <PackageCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-lg font-medium">No pending put-away tasks</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Tasks appear here when items are received against a PO
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Lot #</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>Target Bin</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{task.product?.name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{task.product?.sku || ''}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {task.lot?.lot_number || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {task.requested_quantity ?? '-'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {task.location?.name || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {task.target_bin?.bin_code || (
                          <span className="text-amber-500 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Unassigned
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {task.assigned_user ? (
                          <Badge variant="secondary">{task.assigned_user.full_name}</Badge>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            task.priority >= 8
                              ? 'destructive'
                              : task.priority >= 5
                              ? 'default'
                              : 'outline'
                          }
                        >
                          {task.priority}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isManager && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAssignDialog(task.id, false)}
                              title="Assign"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleStartPutAway(task)}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Start
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── IN PROGRESS TAB ── */}
        <TabsContent value="in-progress" className="space-y-4">
          {inProgressTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-lg font-medium">No put-aways in progress</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {inProgressTasks.map((task) => (
                <Card key={task.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="default">In Progress</Badge>
                          <Badge variant="outline">Priority: {task.priority}</Badge>
                        </div>
                        <p className="font-medium">{task.title}</p>
                        <div className="flex gap-4 text-sm text-muted-foreground">
                          <span>Qty: {task.requested_quantity}</span>
                          {task.location && <span>From: {task.location.name}</span>}
                          {task.target_bin && <span>To: <span className="font-mono">{task.target_bin.bin_code}</span></span>}
                        </div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span>Assigned to: {getUserName(task.assigned_to)}</span>
                          <span>Started: {formatDate(task.started_at)}</span>
                        </div>
                      </div>
                      <Button size="sm" onClick={() => handleStartPutAway(task)}>
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Continue
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── COMPLETED TAB ── */}
        <TabsContent value="completed" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>

          {completedTasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <PackageCheck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-lg font-medium">No completed put-aways yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Completed</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Lot #</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To Bin</TableHead>
                    <TableHead>Completed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedTasks
                    .filter((t) => {
                      if (dateFrom && (t.completed_at || '') < dateFrom) return false;
                      if (dateTo && (t.completed_at || '') > dateTo + 'T23:59:59') return false;
                      return true;
                    })
                    .map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="text-sm">{formatDate(task.completed_at)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{task.product?.name || 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground">{task.product?.sku || ''}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {task.lot?.lot_number || '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {task.scanned_quantity ?? task.requested_quantity ?? '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {task.location?.name || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {task.target_bin?.bin_code || '-'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {getUserName(task.completed_by)}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* ── SUMMARY TAB ── */}
        <TabsContent value="summary" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Pending Put-Aways"
              value={pendingTasks.length}
              icon={Inbox}
              description="Awaiting assignment or start"
            />
            <StatCard
              title="In Progress"
              value={inProgressTasks.length}
              icon={Play}
              description="Currently being worked"
            />
            <StatCard
              title="Completed Today"
              value={completedToday}
              icon={PackageCheck}
              description="Put-aways finished today"
            />
            <StatCard
              title="Avg Put-Away Time"
              value={avgPutAwayMinutes !== null ? `${avgPutAwayMinutes} min` : '-'}
              icon={Clock}
              description="Average time to complete"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Items in Receiving</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{receivingDockItems}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Lot/product combinations awaiting put-away
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Assign Dialog ── */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {assignAllMode ? 'Assign All Pending Tasks' : 'Assign Put-Away Task'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={assignUserId} onValueChange={setAssignUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {assignAllMode && (
              <p className="text-sm text-muted-foreground">
                This will assign {pendingTasks.filter((t) => t.status === 'pending').length} pending task(s) to the selected user.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!assignUserId}>
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
