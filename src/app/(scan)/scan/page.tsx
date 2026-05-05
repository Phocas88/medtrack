'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Play,
  X,
  Check,
  ChevronRight,
  ScanBarcode,
  PackageCheck,
  AlertCircle,
  ArrowRightLeft,
  ClipboardList,
  MapPin,
  RotateCw,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ScanTask,
  ScanTaskType,
  Bin,
  Product,
  Location,
} from '@/types/database';

// ── Types ──

type TaskWithDetails = ScanTask & {
  bin?: Bin | null;
  product?: Product | null;
  source_bin?: Bin | null;
  target_bin?: Bin | null;
  location?: Location | null;
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
  bin_to_bin: 'Bin → Bin',
  replenish: 'Replenish',
  putaway: 'Put Away',
  pick: 'Pick',
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

export default function ScannerAppPage() {
  const { user, tenantId } = useAuth();

  // Task list state
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedToday, setCompletedToday] = useState(0);

  // Active scan state
  const [activeTask, setActiveTask] = useState<TaskWithDetails | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [scanInput, setScanInput] = useState('');
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Workflow state
  const [scannedBinCode, setScannedBinCode] = useState('');
  const [scannedProductSku, setScannedProductSku] = useState('');
  const [enteredQty, setEnteredQty] = useState('');
  const [binItems, setBinItems] = useState<BinItem[]>([]);
  const [targetBinCode, setTargetBinCode] = useState('');
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [varianceTotal, setVarianceTotal] = useState(0);
  const [completing, setCompleting] = useState(false);

  // ── Load Tasks ──

  const loadTasks = useCallback(async () => {
    if (!tenantId || !user) return;
    const supabase = createClient();

    const { data, error } = await supabase
      .from('scan_tasks')
      .select(`
        *,
        bin:bins!scan_tasks_bin_id_fkey(*),
        product:products!scan_tasks_product_id_fkey(*),
        source_bin:bins!scan_tasks_source_bin_id_fkey(*),
        target_bin:bins!scan_tasks_target_bin_id_fkey(*),
        location:locations(*)
      `)
      .eq('tenant_id', tenantId)
      .eq('assigned_to', user.id)
      .in('status', ['pending', 'assigned', 'in_progress'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      toast.error('Failed to load tasks');
    } else {
      setTasks((data as TaskWithDetails[]) || []);
    }

    // Count today's completed tasks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('scan_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('completed_by', user.id)
      .eq('status', 'completed')
      .gte('completed_at', today.toISOString());
    setCompletedToday(count || 0);

    setLoading(false);
  }, [tenantId, user]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ── Helpers ──

  const addScanLog = (value: string, label: string, success: boolean) => {
    setScanLog((prev) => [
      { id: crypto.randomUUID(), time: new Date().toLocaleTimeString(), value, label, success },
      ...prev.slice(0, 19),
    ]);
  };

  const loadBinContents = async (binId: string): Promise<BinItem[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from('bin_inventory')
      .select('*, product:products(name, sku), lot:lots(lot_number)')
      .eq('bin_id', binId)
      .eq('tenant_id', tenantId!);

    return (data || []).map((item: Record<string, unknown>) => ({
      product_id: item.product_id as string,
      product_name: (item.product as Record<string, string>)?.name || 'Unknown',
      product_sku: (item.product as Record<string, string>)?.sku || '',
      lot_id: item.lot_id as string | null,
      system_qty: item.quantity as number,
      counted_qty: null,
      scanned: false,
    }));
  };

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

  const handleCancelActive = () => {
    setActiveTask(null);
    setCurrentStep(0);
    setScanLog([]);
    setBinItems([]);
    loadTasks();
  };

  // ── Handle Barcode Scan ──

  const handleScan = async () => {
    const value = scanInput.trim();
    if (!value || !activeTask) return;
    setScanInput('');

    const taskType = activeTask.task_type;

    if (taskType === 'verify_stock' || taskType === 'cycle_count') {
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin) { addScanLog(value, 'Bin not found', false); toast.error('Bin not found'); return; }
        if (activeTask.bin_id && bin.id !== activeTask.bin_id) { addScanLog(value, 'Wrong bin', false); toast.error('Wrong bin'); return; }
        setScannedBinCode(bin.bin_code);
        const items = await loadBinContents(bin.id);
        setBinItems(items);
        addScanLog(value, `Bin ${bin.bin_code} — ${items.length} items`, true);
        if (items.length > 0) setCurrentStep(1); else setCurrentStep(3);
      } else if (currentStep === 1) {
        const product = await resolveProduct(value);
        if (!product) { addScanLog(value, 'Product not found', false); toast.error('Unknown product'); return; }
        const idx = binItems.findIndex((i) => i.product_id === product.id && !i.scanned);
        if (idx === -1) { addScanLog(value, 'Not in bin', false); toast.error('Product not in this bin'); return; }
        setScannedProductSku(product.sku);
        setCurrentItemIndex(idx);
        addScanLog(value, product.name, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 0) { toast.error('Enter a valid number'); return; }
        const updated = [...binItems];
        const variance = qty - updated[currentItemIndex].system_qty;
        updated[currentItemIndex] = { ...updated[currentItemIndex], counted_qty: qty, scanned: true };
        setVarianceTotal((prev) => prev + Math.abs(variance));
        setBinItems(updated);
        addScanLog(String(qty), `Counted ${qty} (sys: ${updated[currentItemIndex].system_qty}, var: ${variance >= 0 ? '+' : ''}${variance})`, true);
        const remaining = updated.filter((i) => !i.scanned);
        if (remaining.length === 0) setCurrentStep(3);
        else { setScannedProductSku(''); setCurrentStep(1); }
      }
    } else if (taskType === 'verify_bin') {
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin) { addScanLog(value, 'Bin not found', false); toast.error('Bin not found'); return; }
        if (activeTask.bin_id && bin.id !== activeTask.bin_id) { addScanLog(value, 'Wrong bin', false); toast.error('Wrong bin'); return; }
        setScannedBinCode(bin.bin_code);
        addScanLog(value, `Bin ${bin.bin_code} verified`, true);
        setCurrentStep(1);
      }
    } else if (taskType === 'bin_to_bin' || taskType === 'replenish') {
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin) { addScanLog(value, 'Bin not found', false); toast.error('Bin not found'); return; }
        if (taskType === 'replenish' && activeTask.source_bin_id && bin.id !== activeTask.source_bin_id) { addScanLog(value, 'Wrong source bin', false); toast.error('Wrong source bin'); return; }
        setScannedBinCode(bin.bin_code);
        addScanLog(value, `Source: ${bin.bin_code}`, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        const product = await resolveProduct(value);
        if (!product) { addScanLog(value, 'Product not found', false); toast.error('Unknown product'); return; }
        if (activeTask.product_id && product.id !== activeTask.product_id) { addScanLog(value, 'Wrong product', false); toast.error('Wrong product'); return; }
        setScannedProductSku(product.sku);
        addScanLog(value, product.name, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 1) { toast.error('Enter valid qty'); return; }
        setEnteredQty(String(qty));
        addScanLog(String(qty), `Qty: ${qty}`, true);
        setCurrentStep(3);
      } else if (currentStep === 3) {
        const bin = await resolveBin(value);
        if (!bin) { addScanLog(value, 'Bin not found', false); toast.error('Bin not found'); return; }
        if (bin.bin_code === scannedBinCode) { toast.error('Same as source bin'); return; }
        if (taskType === 'replenish' && activeTask.target_bin_id && bin.id !== activeTask.target_bin_id) { addScanLog(value, 'Wrong target', false); toast.error('Wrong target bin'); return; }
        setTargetBinCode(bin.bin_code);
        addScanLog(value, `Target: ${bin.bin_code}`, true);
        setCurrentStep(4);
      }
    } else if (taskType === 'putaway') {
      if (currentStep === 0) {
        const product = await resolveProduct(value);
        if (!product) { addScanLog(value, 'Product not found', false); toast.error('Unknown product'); return; }
        if (activeTask.product_id && product.id !== activeTask.product_id) { addScanLog(value, 'Wrong product', false); toast.error('Wrong product'); return; }
        setScannedProductSku(product.sku);
        addScanLog(value, product.name, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        const bin = await resolveBin(value);
        if (!bin) { addScanLog(value, 'Bin not found', false); toast.error('Bin not found'); return; }
        setTargetBinCode(bin.bin_code);
        addScanLog(value, `Bin: ${bin.bin_code}`, true);
        setCurrentStep(2);
      }
    } else if (taskType === 'pick') {
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin) { addScanLog(value, 'Bin not found', false); toast.error('Bin not found'); return; }
        if (activeTask.bin_id && bin.id !== activeTask.bin_id) { addScanLog(value, 'Wrong bin', false); toast.error('Wrong bin'); return; }
        setScannedBinCode(bin.bin_code);
        addScanLog(value, `Bin: ${bin.bin_code}`, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        const product = await resolveProduct(value);
        if (!product) { addScanLog(value, 'Product not found', false); toast.error('Unknown product'); return; }
        if (activeTask.product_id && product.id !== activeTask.product_id) { addScanLog(value, 'Wrong product', false); toast.error('Wrong product'); return; }
        setScannedProductSku(product.sku);
        addScanLog(value, product.name, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 1) { toast.error('Enter valid qty'); return; }
        setEnteredQty(String(qty));
        addScanLog(String(qty), `Picked: ${qty}`, true);
        setCurrentStep(3);
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
    } else if (['bin_to_bin', 'replenish', 'pick'].includes(activeTask.task_type)) {
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

    // Log scans
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
      toast.error('Failed to complete');
    } else {
      toast.success('Task completed!');
      setActiveTask(null);
      setCurrentStep(0);
      setScanLog([]);
      setBinItems([]);
      loadTasks();
    }
  };

  // ── Step config ──

  const getSteps = (t: ScanTaskType): string[] => {
    switch (t) {
      case 'verify_stock': case 'cycle_count': return ['Scan Bin', 'Scan Item', 'Enter Qty', 'Submit'];
      case 'verify_bin': return ['Scan Bin', 'Submit'];
      case 'bin_to_bin': case 'replenish': return ['Source Bin', 'Scan Item', 'Qty', 'Target Bin', 'Confirm'];
      case 'putaway': return ['Scan Item', 'Scan Bin', 'Confirm'];
      case 'pick': return ['Scan Bin', 'Scan Item', 'Qty', 'Confirm'];
      default: return ['Scan', 'Confirm'];
    }
  };

  const getPrompt = (t: ScanTaskType, step: number): string => {
    switch (t) {
      case 'verify_stock': case 'cycle_count':
        return ['Scan bin barcode', 'Scan product barcode', 'Enter count', 'Review & submit'][step] || '';
      case 'verify_bin':
        return step === 0 ? 'Scan bin barcode' : 'Verified — submit to complete';
      case 'bin_to_bin': case 'replenish':
        return ['Scan source bin', 'Scan product', 'Enter quantity', 'Scan target bin', 'Confirm move'][step] || '';
      case 'putaway':
        return ['Scan product barcode', 'Scan destination bin', 'Confirm put-away'][step] || '';
      case 'pick':
        return ['Scan pick bin', 'Scan product', 'Enter quantity', 'Confirm pick'][step] || '';
      default: return 'Scan barcode';
    }
  };

  const isSubmitStep = (t: ScanTaskType, step: number): boolean => step === getSteps(t).length - 1;

  // ── Render: Active task ──

  if (activeTask) {
    const steps = getSteps(activeTask.task_type);
    const prompt = getPrompt(activeTask.task_type, currentStep);
    const showSubmit = isSubmitStep(activeTask.task_type, currentStep);
    const Icon = TASK_TYPE_ICONS[activeTask.task_type] || ScanBarcode;

    return (
      <div className="flex flex-col h-full">
        {/* Task header */}
        <div className="bg-slate-900 text-white px-4 py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="h-5 w-5 text-blue-400 shrink-0" />
              <span className="font-semibold text-sm truncate">{activeTask.title}</span>
            </div>
            <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white shrink-0 h-8" onClick={handleCancelActive}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          {activeTask.instructions && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-1">{activeTask.instructions}</p>
          )}
          {/* Steps */}
          <div className="flex items-center gap-1 mt-2 overflow-x-auto pb-1">
            {steps.map((label, idx) => (
              <div key={idx} className="flex items-center gap-1 shrink-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  idx < currentStep ? 'bg-green-500 text-white' :
                  idx === currentStep ? 'bg-blue-500 text-white ring-2 ring-blue-400/40' :
                  'bg-slate-700 text-slate-400'
                }`}>
                  {idx < currentStep ? <Check className="h-3 w-3" /> : idx + 1}
                </div>
                <span className={`text-[10px] whitespace-nowrap ${idx === currentStep ? 'text-white font-medium' : 'text-slate-500'}`}>{label}</span>
                {idx < steps.length - 1 && <ChevronRight className="h-3 w-3 text-slate-600 shrink-0" />}
              </div>
            ))}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Scan input */}
          {!showSubmit && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{prompt}</p>
              <div className="flex gap-2">
                <Input
                  ref={scanInputRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleScan(); }}
                  placeholder={currentStep === 2 ? 'Enter quantity...' : 'Scan barcode...'}
                  className="h-11 text-base font-mono"
                  autoFocus
                  inputMode={currentStep === 2 ? 'numeric' : 'text'}
                />
                <Button onClick={handleScan} className="h-11 w-11 shrink-0" size="lg">
                  <ScanBarcode className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {/* Bin items for verify/count */}
          {(activeTask.task_type === 'verify_stock' || activeTask.task_type === 'cycle_count') && currentStep >= 1 && (
            <Card>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-mono font-bold">{scannedBinCode}</span>
                  <span className="text-muted-foreground">{binItems.filter(i => i.scanned).length}/{binItems.length} counted</span>
                </div>
                {binItems.map((item, idx) => (
                  <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${
                    item.scanned ? (item.counted_qty === item.system_qty ? 'border-green-300 bg-green-50 dark:bg-green-950/20' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/20')
                    : idx === currentItemIndex && currentStep === 2 ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-border'
                  }`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.product_sku}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {item.scanned ? (
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold">{item.counted_qty}/{item.system_qty}</span>
                          {item.counted_qty === item.system_qty ?
                            <Check className="h-4 w-4 text-green-600" /> :
                            <AlertCircle className="h-4 w-4 text-amber-500" />}
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

          {/* Move summary */}
          {(activeTask.task_type === 'bin_to_bin' || activeTask.task_type === 'replenish') && currentStep >= 1 && (
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-[10px] uppercase text-muted-foreground">Source</p><p className="font-mono font-bold text-base">{scannedBinCode || '—'}</p></div>
                  <div className="flex items-center justify-center"><ArrowRightLeft className="h-5 w-5 text-muted-foreground" /></div>
                  <div><p className="text-[10px] uppercase text-muted-foreground">Target</p><p className="font-mono font-bold text-base">{targetBinCode || '—'}</p></div>
                </div>
                {scannedProductSku && <div className="text-center mt-2"><p className="text-xs text-muted-foreground">Product</p><p className="font-medium">{scannedProductSku}</p></div>}
                {enteredQty && <div className="text-center mt-1"><p className="text-xl font-bold">{enteredQty}</p></div>}
              </CardContent>
            </Card>
          )}

          {/* Putaway summary */}
          {activeTask.task_type === 'putaway' && currentStep >= 1 && (
            <Card>
              <CardContent className="p-4 text-center space-y-2">
                {scannedProductSku && <p className="font-medium">{scannedProductSku}</p>}
                {targetBinCode && <p className="font-mono text-lg font-bold">→ {targetBinCode}</p>}
              </CardContent>
            </Card>
          )}

          {/* Pick summary */}
          {activeTask.task_type === 'pick' && currentStep >= 1 && (
            <Card>
              <CardContent className="p-4 text-center space-y-2">
                {scannedBinCode && <p className="font-mono font-bold">{scannedBinCode}</p>}
                {scannedProductSku && <p className="font-medium">{scannedProductSku}</p>}
                {enteredQty && <p className="text-xl font-bold">{enteredQty}</p>}
              </CardContent>
            </Card>
          )}

          {/* Verify bin confirmation */}
          {activeTask.task_type === 'verify_bin' && currentStep === 1 && (
            <div className="text-center py-4">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
              <p className="text-base font-bold mt-2">Bin {scannedBinCode} Verified</p>
            </div>
          )}

          {/* Variance warning */}
          {showSubmit && varianceTotal > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-300">
              <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
              <p className="text-sm font-medium">Variance: {varianceTotal}</p>
            </div>
          )}

          {/* Submit button */}
          {showSubmit && (
            <Button onClick={handleCompleteTask} disabled={completing} className="w-full h-11 text-sm font-bold" size="lg">
              {completing ? 'Submitting...' : 'Complete Task'}
              {!completing && <Check className="h-5 w-5 ml-2" />}
            </Button>
          )}

          {/* Scan log */}
          {scanLog.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Log</p>
              {scanLog.slice(0, 5).map((entry) => (
                <div key={entry.id} className={`flex items-center gap-2 text-xs p-2 rounded ${entry.success ? 'bg-muted' : 'bg-destructive/10'}`}>
                  {entry.success ? <Check className="h-3 w-3 text-green-600 shrink-0" /> : <X className="h-3 w-3 text-destructive shrink-0" />}
                  <span className="text-muted-foreground">{entry.time}</span>
                  <span className="font-mono">{entry.value}</span>
                  <span className="text-muted-foreground truncate">{entry.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Task List ──

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="bg-slate-50 dark:bg-slate-900 px-3 py-2 border-b shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">{tasks.length}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-green-600">{completedToday}</p>
            <p className="text-[10px] text-muted-foreground">Done today</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 w-8" onClick={() => { setLoading(true); loadTasks(); }}>
            <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading tasks...</div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-10">
            <ScanBarcode className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-semibold">No tasks</p>
            <p className="text-xs text-muted-foreground mt-1">Check back soon</p>
          </div>
        ) : (
          tasks.map((task) => {
            const Icon = TASK_TYPE_ICONS[task.task_type] || ScanBarcode;
            return (
              <Card key={task.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          <Icon className="h-3 w-3 mr-1" />
                          {TASK_TYPE_LABELS[task.task_type]}
                        </Badge>
                        {task.priority >= 8 && <Badge variant="destructive" className="text-[10px]">Urgent</Badge>}
                      </div>
                      <p className="font-medium text-sm truncate">{task.title}</p>
                      {task.bin && <p className="text-xs text-muted-foreground font-mono">{task.bin.bin_code}</p>}
                      {task.product && <p className="text-xs text-muted-foreground truncate">{task.product.name}</p>}
                    </div>
                    <Button onClick={() => handleStartTask(task)} className="h-10 w-10 shrink-0 rounded-lg" size="lg">
                      <Play className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
