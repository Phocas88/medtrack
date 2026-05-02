'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
  Play,
  Plus,
  X,
  Check,
  ChevronRight,
  ScanBarcode,
  PackageCheck,
  AlertCircle,
  ArrowRightLeft,
  ClipboardList,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ScanTask,
  ScanTaskType,
  Bin,
  Product,
  User as DBUser,
  Location,
} from '@/types/database';

// ── Types ──

type TaskWithDetails = ScanTask & {
  bin?: Bin | null;
  product?: Product | null;
  source_bin?: Bin | null;
  target_bin?: Bin | null;
  location?: Location | null;
  assigned_user?: DBUser | null;
};

interface ScanLogEntry {
  id: string;
  time: string;
  value: string;
  label: string;
  success: boolean;
}

interface BinItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  lot_id: string | null;
  system_qty: number;
  counted_qty: number | null;
  scanned: boolean;
}

// ── Constants ──

const TASK_TYPE_LABELS: Record<ScanTaskType, string> = {
  verify_stock: 'Verify Stock',
  verify_bin: 'Verify Bin',
  cycle_count: 'Cycle Count',
  bin_to_bin: 'Bin to Bin',
  replenish: 'Replenish',
  putaway: 'Putaway',
  pick: 'Pick',
};

const TASK_TYPE_COLORS: Record<ScanTaskType, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  verify_stock: 'secondary',
  verify_bin: 'outline',
  cycle_count: 'default',
  bin_to_bin: 'secondary',
  replenish: 'default',
  putaway: 'outline',
  pick: 'destructive',
};

const TASK_TYPE_ICONS: Record<ScanTaskType, typeof ScanBarcode> = {
  verify_stock: PackageCheck,
  verify_bin: MapPin,
  cycle_count: ClipboardList,
  bin_to_bin: ArrowRightLeft,
  replenish: ArrowRightLeft,
  putaway: PackageCheck,
  pick: ScanBarcode,
};

// ── Component ──

export default function ScannerPage() {
  const { user, tenantId, role } = useAuth();

  // Task list state
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Active scan state
  const [activeTask, setActiveTask] = useState<TaskWithDetails | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [scanInput, setScanInput] = useState('');
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Workflow-specific state
  const [scannedBinCode, setScannedBinCode] = useState('');
  const [scannedProductSku, setScannedProductSku] = useState('');
  const [enteredQty, setEnteredQty] = useState('');
  const [binItems, setBinItems] = useState<BinItem[]>([]);
  const [targetBinCode, setTargetBinCode] = useState('');
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [varianceTotal, setVarianceTotal] = useState(0);
  const [completing, setCompleting] = useState(false);

  // Create task dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [users, setUsers] = useState<DBUser[]>([]);
  const [bins, setBins] = useState<Bin[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [newTask, setNewTask] = useState({
    task_type: '' as ScanTaskType | '',
    title: '',
    instructions: '',
    assigned_to: '',
    location_id: '',
    bin_id: '',
    product_id: '',
    priority: '5',
    requested_quantity: '',
  });
  const [saving, setSaving] = useState(false);

  // ── Load Tasks ──

  const loadTasks = useCallback(async () => {
    if (!tenantId || !user) return;
    const supabase = createClient();

    let query = supabase
      .from('scan_tasks')
      .select(`
        *,
        bin:bins!scan_tasks_bin_id_fkey(*),
        product:products!scan_tasks_product_id_fkey(*),
        source_bin:bins!scan_tasks_source_bin_id_fkey(*),
        target_bin:bins!scan_tasks_target_bin_id_fkey(*),
        location:locations(*),
        assigned_user:users!scan_tasks_assigned_to_fkey(*)
      `)
      .eq('tenant_id', tenantId)
      .eq('assigned_to', user.id)
      .in('status', ['pending', 'assigned', 'in_progress'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (typeFilter !== 'all') {
      query = query.eq('task_type', typeFilter);
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Failed to load tasks');
    } else {
      setTasks((data as TaskWithDetails[]) || []);
    }
    setLoading(false);
  }, [tenantId, user, typeFilter, statusFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ── Load reference data for create dialog ──

  const loadReferenceData = useCallback(async () => {
    if (!tenantId) return;
    const supabase = createClient();

    const [usersRes, binsRes, prodsRes, locsRes] = await Promise.all([
      supabase.from('users').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('full_name'),
      supabase.from('bins').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('bin_code'),
      supabase.from('products').select('*').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      supabase.from('locations').select('*').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
    ]);

    setUsers(usersRes.data || []);
    setBins(binsRes.data || []);
    setProducts(prodsRes.data || []);
    setLocations(locsRes.data || []);
  }, [tenantId]);

  // ── Start Task ──

  const handleStartTask = async (task: TaskWithDetails) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('scan_tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', task.id);

    if (error) {
      toast.error('Failed to start task');
      return;
    }

    setActiveTask({ ...task, status: 'in_progress' });
    setCurrentStep(0);
    setScanLog([]);
    setScannedBinCode('');
    setScannedProductSku('');
    setEnteredQty('');
    setBinItems([]);
    setTargetBinCode('');
    setCurrentItemIndex(0);
    setVarianceTotal(0);

    toast.success('Task started');
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  // ── Cancel Active Task ──

  const handleCancelActive = () => {
    setActiveTask(null);
    setCurrentStep(0);
    setScanLog([]);
    setBinItems([]);
    loadTasks();
  };

  // ── Add Scan Log Entry ──

  const addScanLog = (value: string, label: string, success: boolean) => {
    setScanLog((prev) => [
      { id: crypto.randomUUID(), time: new Date().toLocaleTimeString(), value, label, success },
      ...prev.slice(0, 19),
    ]);
  };

  // ── Load Bin Contents ──

  const loadBinContents = async (binId: string): Promise<BinItem[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from('bin_inventory')
      .select('*, product:products(name, sku), lot:lots(lot_number)')
      .eq('bin_id', binId)
      .eq('tenant_id', tenantId!);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data || []).map((item: any) => ({
      product_id: item.product_id,
      product_name: item.product?.name || 'Unknown',
      product_sku: item.product?.sku || '',
      lot_id: item.lot_id,
      system_qty: item.quantity,
      counted_qty: null,
      scanned: false,
    }));
  };

  // ── Resolve Barcode ──

  const resolveBin = async (code: string): Promise<Bin | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from('bins')
      .select('*')
      .eq('tenant_id', tenantId!)
      .eq('bin_code', code.toUpperCase())
      .eq('is_active', true)
      .maybeSingle();
    return data;
  };

  const resolveProduct = async (sku: string): Promise<Product | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('tenant_id', tenantId!)
      .eq('sku', sku.toUpperCase())
      .eq('is_archived', false)
      .maybeSingle();
    return data;
  };

  // ── Handle Barcode Scan ──

  const handleScan = async () => {
    const value = scanInput.trim();
    if (!value || !activeTask) return;
    setScanInput('');

    const taskType = activeTask.task_type;

    // ── verify_stock workflow ──
    if (taskType === 'verify_stock') {
      if (currentStep === 0) {
        // Step 0: Scan bin
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, 'Bin not found', false);
          toast.error('Bin not found');
          return;
        }
        if (activeTask.bin_id && bin.id !== activeTask.bin_id) {
          addScanLog(value, 'Wrong bin', false);
          toast.error('This is not the expected bin');
          return;
        }
        setScannedBinCode(bin.bin_code);
        const items = await loadBinContents(bin.id);
        setBinItems(items);
        addScanLog(value, `Bin ${bin.bin_code} scanned`, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        // Step 1: Scan product barcode
        const product = await resolveProduct(value);
        if (!product) {
          addScanLog(value, 'Product not found', false);
          toast.error('Product not recognized');
          return;
        }
        const itemIdx = binItems.findIndex((i) => i.product_id === product.id && !i.scanned);
        if (itemIdx === -1) {
          addScanLog(value, 'Product not in bin', false);
          toast.error('Product not expected in this bin');
          return;
        }
        setScannedProductSku(product.sku);
        setCurrentItemIndex(itemIdx);
        addScanLog(value, `Product ${product.name}`, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        // Step 2: value is the counted qty
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 0) {
          toast.error('Enter a valid quantity');
          return;
        }
        const updated = [...binItems];
        updated[currentItemIndex] = {
          ...updated[currentItemIndex],
          counted_qty: qty,
          scanned: true,
        };
        const variance = qty - updated[currentItemIndex].system_qty;
        setVarianceTotal((prev) => prev + Math.abs(variance));
        setBinItems(updated);
        addScanLog(
          String(qty),
          `Counted ${qty} (system: ${updated[currentItemIndex].system_qty}, variance: ${variance >= 0 ? '+' : ''}${variance})`,
          true
        );

        const remaining = updated.filter((i) => !i.scanned);
        if (remaining.length === 0) {
          setCurrentStep(3); // ready to submit
        } else {
          setScannedProductSku('');
          setCurrentStep(1); // scan next product
        }
      }
    }

    // ── verify_bin workflow ──
    else if (taskType === 'verify_bin') {
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, 'Bin not found', false);
          toast.error('Bin not found');
          return;
        }
        if (activeTask.bin_id && bin.id !== activeTask.bin_id) {
          addScanLog(value, 'Wrong bin scanned', false);
          toast.error('Does not match expected bin');
          return;
        }
        setScannedBinCode(bin.bin_code);
        addScanLog(value, `Bin ${bin.bin_code} verified`, true);
        setCurrentStep(1); // ready to submit
      }
    }

    // ── cycle_count workflow ──
    else if (taskType === 'cycle_count') {
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, 'Bin not found', false);
          toast.error('Bin not found');
          return;
        }
        setScannedBinCode(bin.bin_code);
        const items = await loadBinContents(bin.id);
        setBinItems(items);
        addScanLog(value, `Bin ${bin.bin_code} — ${items.length} products to count`, true);
        if (items.length > 0) {
          setCurrentStep(1);
        } else {
          toast.info('Bin is empty in system');
          setCurrentStep(3);
        }
      } else if (currentStep === 1) {
        // Scan product
        const product = await resolveProduct(value);
        if (!product) {
          addScanLog(value, 'Product not found', false);
          toast.error('Product not recognized');
          return;
        }
        const itemIdx = binItems.findIndex((i) => i.product_id === product.id && !i.scanned);
        if (itemIdx === -1) {
          addScanLog(value, 'Unexpected product', false);
          toast.error('Product not expected in this bin');
          return;
        }
        setCurrentItemIndex(itemIdx);
        setScannedProductSku(product.sku);
        addScanLog(value, `${product.name}`, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 0) {
          toast.error('Enter a valid quantity');
          return;
        }
        const updated = [...binItems];
        const variance = qty - updated[currentItemIndex].system_qty;
        updated[currentItemIndex] = { ...updated[currentItemIndex], counted_qty: qty, scanned: true };
        setVarianceTotal((prev) => prev + Math.abs(variance));
        setBinItems(updated);
        addScanLog(String(qty), `Counted ${qty} (variance: ${variance >= 0 ? '+' : ''}${variance})`, true);

        const remaining = updated.filter((i) => !i.scanned);
        if (remaining.length === 0) {
          setCurrentStep(3);
        } else {
          setScannedProductSku('');
          setCurrentStep(1);
        }
      }
    }

    // ── bin_to_bin workflow ──
    else if (taskType === 'bin_to_bin') {
      if (currentStep === 0) {
        // Scan source bin
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, 'Source bin not found', false);
          toast.error('Bin not found');
          return;
        }
        setScannedBinCode(bin.bin_code);
        addScanLog(value, `Source bin: ${bin.bin_code}`, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        // Scan product
        const product = await resolveProduct(value);
        if (!product) {
          addScanLog(value, 'Product not found', false);
          toast.error('Product not recognized');
          return;
        }
        setScannedProductSku(product.sku);
        addScanLog(value, `Product: ${product.name}`, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        // Enter qty
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 1) {
          toast.error('Enter a valid quantity');
          return;
        }
        setEnteredQty(String(qty));
        addScanLog(String(qty), `Quantity: ${qty}`, true);
        setCurrentStep(3);
      } else if (currentStep === 3) {
        // Scan target bin
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, 'Target bin not found', false);
          toast.error('Bin not found');
          return;
        }
        if (bin.bin_code === scannedBinCode) {
          toast.error('Target bin cannot be the same as source');
          return;
        }
        setTargetBinCode(bin.bin_code);
        addScanLog(value, `Target bin: ${bin.bin_code}`, true);
        setCurrentStep(4); // ready to confirm
      }
    }

    // ── replenish workflow ──
    else if (taskType === 'replenish') {
      if (currentStep === 0) {
        // Scan source (secondary) bin
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, 'Source bin not found', false);
          toast.error('Bin not found');
          return;
        }
        if (activeTask.source_bin_id && bin.id !== activeTask.source_bin_id) {
          addScanLog(value, 'Wrong source bin', false);
          toast.error('Does not match expected source bin');
          return;
        }
        setScannedBinCode(bin.bin_code);
        addScanLog(value, `Source bin: ${bin.bin_code}`, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        // Scan product
        const product = await resolveProduct(value);
        if (!product) {
          addScanLog(value, 'Product not found', false);
          toast.error('Product not recognized');
          return;
        }
        if (activeTask.product_id && product.id !== activeTask.product_id) {
          addScanLog(value, 'Wrong product', false);
          toast.error('Does not match expected product');
          return;
        }
        setScannedProductSku(product.sku);
        addScanLog(value, `Product: ${product.name}`, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 1) {
          toast.error('Enter a valid quantity');
          return;
        }
        setEnteredQty(String(qty));
        addScanLog(String(qty), `Quantity: ${qty}`, true);
        setCurrentStep(3);
      } else if (currentStep === 3) {
        // Scan target (primary) bin
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, 'Target bin not found', false);
          toast.error('Bin not found');
          return;
        }
        if (activeTask.target_bin_id && bin.id !== activeTask.target_bin_id) {
          addScanLog(value, 'Wrong target bin', false);
          toast.error('Does not match expected target bin');
          return;
        }
        setTargetBinCode(bin.bin_code);
        addScanLog(value, `Target bin: ${bin.bin_code}`, true);
        setCurrentStep(4); // ready to confirm
      }
    }

    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  // ── Complete Task ──

  const handleCompleteTask = async () => {
    if (!activeTask || !user) return;
    setCompleting(true);

    const supabase = createClient();
    const now = new Date().toISOString();

    let scannedQty: number | null = null;
    let variance: number | null = null;

    if (activeTask.task_type === 'verify_stock' || activeTask.task_type === 'cycle_count') {
      scannedQty = binItems.reduce((sum, i) => sum + (i.counted_qty ?? 0), 0);
      const systemQty = binItems.reduce((sum, i) => sum + i.system_qty, 0);
      variance = scannedQty - systemQty;
    } else if (activeTask.task_type === 'bin_to_bin' || activeTask.task_type === 'replenish') {
      scannedQty = parseInt(enteredQty, 10) || 0;
    }

    const { error } = await supabase
      .from('scan_tasks')
      .update({
        status: 'completed',
        completed_by: user.id,
        completed_at: now,
        scanned_quantity: scannedQty,
        variance,
      })
      .eq('id', activeTask.id);

    // Log each scan to scan_logs
    for (const entry of scanLog.filter((e) => e.success)) {
      await supabase.from('scan_logs').insert({
        tenant_id: tenantId!,
        task_id: activeTask.id,
        scanned_by: user.id,
        scan_type: activeTask.task_type,
        scanned_value: entry.value,
        scanned_at: now,
      });
    }

    setCompleting(false);

    if (error) {
      toast.error('Failed to complete task');
    } else {
      toast.success('Task completed successfully');
      setActiveTask(null);
      setCurrentStep(0);
      setScanLog([]);
      setBinItems([]);
      loadTasks();
    }
  };

  // ── Create Task ──

  const handleCreateTask = async () => {
    if (!tenantId || !user) return;
    if (!newTask.task_type || !newTask.title) {
      toast.error('Task type and title are required');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.from('scan_tasks').insert({
      tenant_id: tenantId,
      task_type: newTask.task_type,
      title: newTask.title,
      instructions: newTask.instructions || null,
      assigned_to: newTask.assigned_to || null,
      assigned_by: user.id,
      assigned_at: newTask.assigned_to ? new Date().toISOString() : null,
      status: newTask.assigned_to ? 'assigned' : 'pending',
      location_id: newTask.location_id || null,
      bin_id: newTask.bin_id || null,
      product_id: newTask.product_id || null,
      priority: parseInt(newTask.priority, 10) || 5,
      requested_quantity: newTask.requested_quantity ? parseInt(newTask.requested_quantity, 10) : null,
    });

    setSaving(false);

    if (error) {
      toast.error('Failed to create task');
    } else {
      toast.success('Task created');
      setCreateDialogOpen(false);
      setNewTask({
        task_type: '',
        title: '',
        instructions: '',
        assigned_to: '',
        location_id: '',
        bin_id: '',
        product_id: '',
        priority: '5',
        requested_quantity: '',
      });
      loadTasks();
    }
  };

  // ── Workflow Steps Config ──

  const getSteps = (taskType: ScanTaskType): string[] => {
    switch (taskType) {
      case 'verify_stock':
        return ['Scan Bin', 'Scan Product', 'Enter Qty', 'Review & Submit'];
      case 'verify_bin':
        return ['Scan Bin', 'Confirm & Submit'];
      case 'cycle_count':
        return ['Scan Bin', 'Scan Product', 'Enter Qty', 'Review & Submit'];
      case 'bin_to_bin':
        return ['Scan Source Bin', 'Scan Product', 'Enter Qty', 'Scan Target Bin', 'Confirm Move'];
      case 'replenish':
        return ['Scan Source Bin', 'Scan Product', 'Enter Qty', 'Scan Target Bin', 'Confirm Move'];
      default:
        return ['Scan', 'Confirm'];
    }
  };

  const getStepPrompt = (taskType: ScanTaskType, step: number): string => {
    switch (taskType) {
      case 'verify_stock':
        if (step === 0) return 'Scan the bin barcode';
        if (step === 1) return 'Scan a product barcode';
        if (step === 2) return 'Enter the counted quantity';
        return 'Review results and submit';
      case 'verify_bin':
        if (step === 0) return 'Scan the bin barcode to verify';
        return 'Bin verified. Submit to complete.';
      case 'cycle_count':
        if (step === 0) return 'Scan the bin barcode';
        if (step === 1) return 'Scan the next product barcode';
        if (step === 2) return 'Enter the counted quantity';
        return 'All items counted. Review and submit.';
      case 'bin_to_bin':
        if (step === 0) return 'Scan the source bin';
        if (step === 1) return 'Scan the product barcode';
        if (step === 2) return 'Enter the quantity to move';
        if (step === 3) return 'Scan the target bin';
        return 'Confirm the move';
      case 'replenish':
        if (step === 0) return 'Scan the source (secondary) bin';
        if (step === 1) return 'Scan the product barcode';
        if (step === 2) return 'Enter the quantity';
        if (step === 3) return 'Scan the target (primary) bin';
        return 'Confirm replenishment';
      default:
        return 'Scan barcode';
    }
  };

  const isSubmitStep = (taskType: ScanTaskType, step: number): boolean => {
    const steps = getSteps(taskType);
    return step === steps.length - 1;
  };

  // ── Render: Active Scan Workflow ──

  if (activeTask) {
    const steps = getSteps(activeTask.task_type);
    const prompt = getStepPrompt(activeTask.task_type, currentStep);
    const showSubmit = isSubmitStep(activeTask.task_type, currentStep);
    const Icon = TASK_TYPE_ICONS[activeTask.task_type] || ScanBarcode;

    return (
      <div className="space-y-4 max-w-lg mx-auto pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">{activeTask.title}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCancelActive}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
        </div>

        <Badge variant={TASK_TYPE_COLORS[activeTask.task_type]}>
          {TASK_TYPE_LABELS[activeTask.task_type]}
        </Badge>

        {activeTask.instructions && (
          <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
            {activeTask.instructions}
          </p>
        )}

        {/* Step Indicator */}
        <div className="flex items-center gap-1 overflow-x-auto py-2">
          {steps.map((label, idx) => (
            <div key={idx} className="flex items-center gap-1 shrink-0">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium ${
                  idx < currentStep
                    ? 'bg-primary text-primary-foreground'
                    : idx === currentStep
                    ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {idx < currentStep ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  idx === currentStep ? 'font-medium' : 'text-muted-foreground'
                }`}
              >
                {label}
              </span>
              {idx < steps.length - 1 && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Scan Input */}
        {!showSubmit && (
          <div className="space-y-2">
            <Label className="text-base font-medium">{prompt}</Label>
            <div className="flex gap-2">
              <Input
                ref={scanInputRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleScan();
                }}
                placeholder={
                  currentStep === 2 && (activeTask.task_type === 'verify_stock' || activeTask.task_type === 'cycle_count' || activeTask.task_type === 'bin_to_bin' || activeTask.task_type === 'replenish')
                    ? 'Enter quantity...'
                    : 'Scan barcode...'
                }
                className="h-14 text-lg font-mono"
                autoFocus
              />
              <Button onClick={handleScan} className="h-14 px-6" size="lg">
                <ScanBarcode className="h-5 w-5" />
              </Button>
            </div>
          </div>
        )}

        {/* Workflow-specific content */}

        {/* verify_stock / cycle_count: bin items list */}
        {(activeTask.task_type === 'verify_stock' || activeTask.task_type === 'cycle_count') &&
          currentStep >= 1 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Bin: {scannedBinCode} -- {binItems.filter((i) => i.scanned).length}/{binItems.length} counted
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {binItems.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between p-3 rounded-md border ${
                      item.scanned
                        ? item.counted_qty === item.system_qty
                          ? 'border-green-300 bg-green-50 dark:bg-green-950/20'
                          : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20'
                        : idx === currentItemIndex && currentStep === 2
                        ? 'border-primary bg-primary/5'
                        : 'border-border'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.product_sku}</p>
                    </div>
                    <div className="text-right">
                      {item.scanned ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">
                            {item.counted_qty} / {item.system_qty}
                          </span>
                          {item.counted_qty === item.system_qty ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sys: {item.system_qty}</span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

        {/* verify_bin: confirmation */}
        {activeTask.task_type === 'verify_bin' && currentStep === 1 && (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <Check className="h-12 w-12 text-green-600 mx-auto" />
              <p className="text-lg font-medium">Bin {scannedBinCode} Verified</p>
              <p className="text-sm text-muted-foreground">Location matches expected bin</p>
            </CardContent>
          </Card>
        )}

        {/* bin_to_bin / replenish: summary */}
        {(activeTask.task_type === 'bin_to_bin' || activeTask.task_type === 'replenish') &&
          currentStep >= 1 && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Source Bin</p>
                    <p className="text-lg font-mono font-bold">{scannedBinCode || '---'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Target Bin</p>
                    <p className="text-lg font-mono font-bold">{targetBinCode || '---'}</p>
                  </div>
                </div>
                {scannedProductSku && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase">Product</p>
                    <p className="text-base font-medium">{scannedProductSku}</p>
                  </div>
                )}
                {enteredQty && (
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground uppercase">Quantity</p>
                    <p className="text-2xl font-bold">{enteredQty}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        {/* Submit / Complete button */}
        {showSubmit && (
          <div className="space-y-3">
            {varianceTotal > 0 && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-300">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                <p className="text-sm font-medium">Total absolute variance: {varianceTotal}</p>
              </div>
            )}
            <Button
              onClick={handleCompleteTask}
              disabled={completing}
              className="w-full h-14 text-lg"
              size="lg"
            >
              {completing ? 'Completing...' : 'Complete Task'}
              {!completing && <Check className="h-5 w-5 ml-2" />}
            </Button>
          </div>
        )}

        <Separator />

        {/* Scan Log */}
        {scanLog.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Scan Log</h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {scanLog.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-center gap-2 text-xs p-2 rounded ${
                    entry.success ? 'bg-muted' : 'bg-destructive/10'
                  }`}
                >
                  {entry.success ? (
                    <Check className="h-3 w-3 text-green-600 shrink-0" />
                  ) : (
                    <X className="h-3 w-3 text-destructive shrink-0" />
                  )}
                  <span className="text-muted-foreground">{entry.time}</span>
                  <span className="font-mono">{entry.value}</span>
                  <span className="text-muted-foreground truncate">{entry.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render: Task List ──

  const isManager = role === 'admin' || role === 'manager';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scanner"
        description="Mobile scanning workflow for warehouse tasks"
        actions={
          isManager ? (
            <Button
              onClick={() => {
                loadReferenceData();
                setCreateDialogOpen(true);
              }}
              className="h-12"
            >
              <Plus className="h-4 w-4 mr-2" /> Create Task
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Task Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="verify_stock">Verify Stock</SelectItem>
              <SelectItem value="verify_bin">Verify Bin</SelectItem>
              <SelectItem value="cycle_count">Cycle Count</SelectItem>
              <SelectItem value="bin_to_bin">Bin to Bin</SelectItem>
              <SelectItem value="replenish">Replenish</SelectItem>
              <SelectItem value="putaway">Putaway</SelectItem>
              <SelectItem value="pick">Pick</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Task Cards */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ScanBarcode className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">No tasks assigned</p>
            <p className="text-sm text-muted-foreground mt-1">
              Tasks will appear here when assigned to you
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => {
            const Icon = TASK_TYPE_ICONS[task.task_type] || ScanBarcode;
            return (
              <Card key={task.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={TASK_TYPE_COLORS[task.task_type]}>
                          <Icon className="h-3 w-3 mr-1" />
                          {TASK_TYPE_LABELS[task.task_type]}
                        </Badge>
                        {task.priority >= 8 && (
                          <Badge variant="destructive">High Priority</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {task.status}
                        </Badge>
                      </div>
                      <h3 className="font-medium text-base">{task.title}</h3>
                      {task.bin && (
                        <p className="text-sm text-muted-foreground">
                          Bin: <span className="font-mono">{task.bin.bin_code}</span>
                        </p>
                      )}
                      {task.product && (
                        <p className="text-sm text-muted-foreground">
                          Product: {task.product.name}
                        </p>
                      )}
                      {task.instructions && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {task.instructions}
                        </p>
                      )}
                      {(task.task_type === 'bin_to_bin' || task.task_type === 'replenish') && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {task.source_bin && (
                            <span className="font-mono">{task.source_bin.bin_code}</span>
                          )}
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                          {task.target_bin && (
                            <span className="font-mono">{task.target_bin.bin_code}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      onClick={() => handleStartTask(task)}
                      className="h-12 px-5 shrink-0"
                      size="lg"
                    >
                      <Play className="h-4 w-4 mr-1" /> Start
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Task Dialog (Managers Only) */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Scan Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Task Type *</Label>
              <Select
                value={newTask.task_type}
                onValueChange={(v) => setNewTask((p) => ({ ...p, task_type: v as ScanTaskType }))}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verify_stock">Verify Stock</SelectItem>
                  <SelectItem value="verify_bin">Verify Bin</SelectItem>
                  <SelectItem value="cycle_count">Cycle Count</SelectItem>
                  <SelectItem value="bin_to_bin">Bin to Bin</SelectItem>
                  <SelectItem value="replenish">Replenish</SelectItem>
                  <SelectItem value="putaway">Putaway</SelectItem>
                  <SelectItem value="pick">Pick</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={newTask.title}
                onChange={(e) => setNewTask((p) => ({ ...p, title: e.target.value }))}
                placeholder="Task title"
                className="h-12"
              />
            </div>

            <div className="space-y-2">
              <Label>Instructions</Label>
              <Textarea
                value={newTask.instructions}
                onChange={(e) => setNewTask((p) => ({ ...p, instructions: e.target.value }))}
                placeholder="Optional instructions for the associate"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select
                value={newTask.assigned_to}
                onValueChange={(v) => setNewTask((p) => ({ ...p, assigned_to: v }))}
              >
                <SelectTrigger className="h-12">
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

            <div className="space-y-2">
              <Label>Location</Label>
              <Select
                value={newTask.location_id}
                onValueChange={(v) => setNewTask((p) => ({ ...p, location_id: v }))}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Bin</Label>
              <Select
                value={newTask.bin_id}
                onValueChange={(v) => setNewTask((p) => ({ ...p, bin_id: v }))}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select bin" />
                </SelectTrigger>
                <SelectContent>
                  {bins.map((bin) => (
                    <SelectItem key={bin.id} value={bin.id}>
                      {bin.bin_code} ({bin.bin_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Product</Label>
              <Select
                value={newTask.product_id}
                onValueChange={(v) => setNewTask((p) => ({ ...p, product_id: v }))}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((prod) => (
                    <SelectItem key={prod.id} value={prod.id}>
                      {prod.name} ({prod.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Priority (1-10)</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={newTask.priority}
                  onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value }))}
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label>Requested Qty</Label>
                <Input
                  type="number"
                  min={0}
                  value={newTask.requested_quantity}
                  onChange={(e) => setNewTask((p) => ({ ...p, requested_quantity: e.target.value }))}
                  placeholder="Optional"
                  className="h-12"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} className="h-12">
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={saving} className="h-12">
              {saving ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
