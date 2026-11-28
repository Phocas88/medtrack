"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Play,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  ScanBarcode,
  PackageCheck,
  AlertCircle,
  ArrowRightLeft,
  ClipboardList,
  MapPin,
  RotateCw,
  CheckCircle2,
  PackageOpen,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ScanTask,
  ScanTaskType,
  Bin,
  Product,
  Location,
} from "@/types/database";

// ── Types ──

type TaskWithDetails = ScanTask & {
  bin?: Bin | null;
  product?: Pick<Product, "id" | "name" | "sku"> | null;
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

// ── Function menu config (NetSuite WMS style) ──
interface ScanFunction {
  key: ScanTaskType;
  label: string;
  description: string;
  icon: typeof ScanBarcode;
  iconStyle: string;
}

const SCAN_FUNCTIONS: ScanFunction[] = [
  {
    key: "pick",
    label: "Pick",
    description: "Pick items for orders",
    icon: ScanBarcode,
    iconStyle: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  },
  {
    key: "putaway",
    label: "Put Away",
    description: "Store received items",
    icon: PackageOpen,
    iconStyle: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  },
  {
    key: "replenish",
    label: "Replenish",
    description: "Restock pick bins",
    icon: RefreshCw,
    iconStyle: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  {
    key: "cycle_count",
    label: "Cycle Count",
    description: "Count bin inventory",
    icon: ClipboardList,
    iconStyle: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  },
  {
    key: "verify_stock",
    label: "Verify Stock",
    description: "Verify bin contents",
    icon: PackageCheck,
    iconStyle: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  },
  {
    key: "bin_to_bin",
    label: "Transfer",
    description: "Move between bins",
    icon: ArrowRightLeft,
    iconStyle: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  },
  {
    key: "verify_bin",
    label: "Verify Bin",
    description: "Confirm bin location",
    icon: MapPin,
    iconStyle: "bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-200",
  },
];

const TASK_TYPE_LABELS: Record<ScanTaskType, string> = {
  verify_stock: "Verify Stock",
  verify_bin: "Verify Bin",
  cycle_count: "Cycle Count",
  bin_to_bin: "Transfer",
  replenish: "Replenish",
  putaway: "Put Away",
  pick: "Pick",
};

// ── Component ──

export default function ScannerAppPage() {
  const { user, tenantId } = useAuth();

  // Mode: 'menu' = function home, 'tasks' = task list for a function, 'active' = doing a task
  const [mode, setMode] = useState<"menu" | "tasks" | "active">("menu");
  const [selectedFunction, setSelectedFunction] = useState<ScanTaskType | null>(
    null,
  );

  // Task list state
  const [tasks, setTasks] = useState<TaskWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});

  // Active scan state
  const [activeTask, setActiveTask] = useState<TaskWithDetails | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [scanInput, setScanInput] = useState("");
  const [scanLog, setScanLog] = useState<ScanLogEntry[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Workflow state
  const [scannedBinCode, setScannedBinCode] = useState("");
  const [scannedProductSku, setScannedProductSku] = useState("");
  const [enteredQty, setEnteredQty] = useState("");
  const [binItems, setBinItems] = useState<BinItem[]>([]);
  const [targetBinCode, setTargetBinCode] = useState("");
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [countEvidence, setCountEvidence] = useState<string[]>([]);
  const [varianceTotal, setVarianceTotal] = useState(0);
  const [completing, setCompleting] = useState(false);

  // Load task counts for the menu badges
  useEffect(() => {
    if (!tenantId || !user) return;
    const supabase = createClient();
    supabase
      .from("scan_tasks")
      .select("task_type")
      .eq("tenant_id", tenantId)
      .eq("assigned_to", user.id)
      .in("status", ["pending", "assigned", "in_progress"])
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        (data || []).forEach((t) => {
          counts[t.task_type] = (counts[t.task_type] || 0) + 1;
        });
        setTaskCounts(counts);
      });
  }, [tenantId, user, mode]);

  // Load tasks for selected function
  const loadTasks = useCallback(
    async (taskType: ScanTaskType) => {
      if (!tenantId || !user) return;
      setLoading(true);
      const supabase = createClient();

      const { data, error: taskError } = await supabase
        .from("scan_tasks")
        .select(
          `*, bin:bins!scan_tasks_bin_id_fkey(*),
        source_bin:bins!scan_tasks_source_bin_id_fkey(*), target_bin:bins!scan_tasks_target_bin_id_fkey(*), location:locations(*)`,
        )
        .eq("tenant_id", tenantId)
        .eq("assigned_to", user.id)
        .eq("task_type", taskType)
        .in("status", ["pending", "assigned", "in_progress"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true });

      if (taskError) {
        toast.error("Could not load assigned tasks");
        setTasks([]);
        setLoading(false);
        return;
      }
      const productIds = Array.from(
        new Set((data || []).map((task) => task.product_id).filter(Boolean)),
      );
      const { data: safeProducts, error: productError } = productIds.length
        ? await supabase
            .from("staff_products")
            .select("id,name,sku")
            .eq("tenant_id", tenantId)
            .in("id", productIds)
        : { data: [], error: null };
      if (productError) {
        toast.error("Could not load task product details");
        setTasks([]);
        setLoading(false);
        return;
      }
      const productMap = new Map(
        (safeProducts || []).map((product) => [product.id, product]),
      );
      setTasks(
        (data || []).map((task) => ({
          ...task,
          product: productMap.get(task.product_id) || null,
        })) as TaskWithDetails[],
      );
      setLoading(false);
    },
    [tenantId, user],
  );

  const openFunction = (taskType: ScanTaskType) => {
    setSelectedFunction(taskType);
    setMode("tasks");
    loadTasks(taskType);
  };

  const backToMenu = () => {
    setMode("menu");
    setSelectedFunction(null);
    setTasks([]);
  };

  // ── Helpers ──

  const addScanLog = (value: string, label: string, success: boolean) => {
    setScanLog((prev) => [
      {
        id: crypto.randomUUID(),
        time: new Date().toLocaleTimeString(),
        value,
        label,
        success,
      },
      ...prev.slice(0, 19),
    ]);
  };

  const loadBinContents = async (binId: string): Promise<BinItem[]> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("bin_inventory")
      .select(
        "*, product:staff_products(name, sku), lot:staff_lots(lot_number)",
      )
      .eq("bin_id", binId)
      .eq("tenant_id", tenantId!);
    return (data || []).map((item: Record<string, unknown>) => ({
      product_id: item.product_id as string,
      product_name: (item.product as Record<string, string>)?.name || "Unknown",
      product_sku: (item.product as Record<string, string>)?.sku || "",
      lot_id: item.lot_id as string | null,
      system_qty: item.quantity as number,
      counted_qty: null,
      scanned: false,
    }));
  };

  const resolveBin = async (code: string): Promise<Bin | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("bins")
      .select("*")
      .eq("tenant_id", tenantId!)
      .eq("bin_code", code.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();
    return data;
  };

  const resolveProduct = async (sku: string): Promise<Product | null> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("staff_products")
      .select("*")
      .eq("tenant_id", tenantId!)
      .eq("sku", sku.toUpperCase())
      .eq("is_archived", false)
      .maybeSingle();
    return data;
  };

  // ── Start Task ──
  const handleStartTask = async (task: TaskWithDetails) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("start_scan_task", {
      p_task_id: task.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setActiveTask({ ...task, status: "in_progress" });
    setMode("active");
    setCurrentStep(0);
    setScanLog([]);
    setScannedBinCode("");
    setScannedProductSku("");
    setEnteredQty("");
    setBinItems([]);
    setTargetBinCode("");
    setCurrentItemIndex(0);
    setVarianceTotal(0);
    setCountEvidence([]);
    toast.success("Task started");
    setTimeout(() => scanInputRef.current?.focus(), 100);
  };

  const handleCancelActive = () => {
    setActiveTask(null);
    setMode("tasks");
    if (selectedFunction) loadTasks(selectedFunction);
  };

  // ── Handle Scan (same logic as before, condensed) ──
  const handleScan = async () => {
    const value = scanInput.trim();
    if (!value || !activeTask) return;
    setScanInput("");
    const tt = activeTask.task_type;

    if (activeTask.cycle_count_line_id) {
      let valid = false;
      if (currentStep === 0) valid = value.toUpperCase() === activeTask.bin?.bin_code.toUpperCase();
      if (currentStep === 1) valid = value.toUpperCase() === activeTask.product?.sku.toUpperCase();
      if (currentStep === 2) {
        const { data } = await createClient().from("staff_lots").select("lot_number")
          .eq("tenant_id", tenantId!).eq("id", activeTask.lot_id).maybeSingle();
        valid = value.toUpperCase() === data?.lot_number.toUpperCase();
      }
      if (currentStep === 3) valid = /^\d+$/.test(value) && Number(value) <= 2147483647;
      if (!valid) {
        toast.error(["Scan the assigned bin", "Scan the assigned SKU", "Scan the assigned lot", "Enter a nonnegative whole quantity"][currentStep]);
        return;
      }
      setCountEvidence(previous => [...previous.slice(0, currentStep), value]);
      setCurrentStep(currentStep + 1);
      setTimeout(() => scanInputRef.current?.focus(), 50);
      return;
    }

    if (tt === "verify_stock" || tt === "cycle_count") {
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, "Bin not found", false);
          toast.error("Bin not found");
          return;
        }
        if (activeTask.bin_id && bin.id !== activeTask.bin_id) {
          addScanLog(value, "Wrong bin", false);
          toast.error("Wrong bin");
          return;
        }
        setScannedBinCode(bin.bin_code);
        const items = await loadBinContents(bin.id);
        setBinItems(items);
        addScanLog(value, `Bin ${bin.bin_code} — ${items.length} items`, true);
        setCurrentStep(items.length > 0 ? 1 : 3);
      } else if (currentStep === 1) {
        const product = await resolveProduct(value);
        if (!product) {
          addScanLog(value, "Not found", false);
          toast.error("Unknown product");
          return;
        }
        const idx = binItems.findIndex(
          (i) => i.product_id === product.id && !i.scanned,
        );
        if (idx === -1) {
          addScanLog(value, "Not in bin", false);
          toast.error("Not in this bin");
          return;
        }
        setScannedProductSku(product.sku);
        setCurrentItemIndex(idx);
        addScanLog(value, product.name, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 0) {
          toast.error("Enter a number");
          return;
        }
        const updated = [...binItems];
        const variance = qty - updated[currentItemIndex].system_qty;
        updated[currentItemIndex] = {
          ...updated[currentItemIndex],
          counted_qty: qty,
          scanned: true,
        };
        setVarianceTotal((p) => p + Math.abs(variance));
        setBinItems(updated);
        addScanLog(
          String(qty),
          `Counted ${qty} (sys: ${updated[currentItemIndex].system_qty})`,
          true,
        );
        const remaining = updated.filter((i) => !i.scanned);
        if (remaining.length === 0) setCurrentStep(3);
        else {
          setScannedProductSku("");
          setCurrentStep(1);
        }
      }
    } else if (tt === "verify_bin") {
      const bin = await resolveBin(value);
      if (!bin) {
        addScanLog(value, "Not found", false);
        toast.error("Bin not found");
        return;
      }
      if (activeTask.bin_id && bin.id !== activeTask.bin_id) {
        addScanLog(value, "Wrong bin", false);
        toast.error("Wrong bin");
        return;
      }
      setScannedBinCode(bin.bin_code);
      addScanLog(value, `Verified ${bin.bin_code}`, true);
      setCurrentStep(1);
    } else if (tt === "bin_to_bin" || tt === "replenish") {
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, "Not found", false);
          return;
        }
        setScannedBinCode(bin.bin_code);
        addScanLog(value, `Source: ${bin.bin_code}`, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        const product = await resolveProduct(value);
        if (!product) {
          addScanLog(value, "Not found", false);
          return;
        }
        setScannedProductSku(product.sku);
        addScanLog(value, product.name, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        const qty = parseInt(value, 10);
        if (isNaN(qty) || qty < 1) {
          toast.error("Enter qty");
          return;
        }
        setEnteredQty(String(qty));
        addScanLog(String(qty), `Qty: ${qty}`, true);
        setCurrentStep(3);
      } else if (currentStep === 3) {
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, "Not found", false);
          return;
        }
        if (bin.bin_code === scannedBinCode) {
          toast.error("Same bin");
          return;
        }
        setTargetBinCode(bin.bin_code);
        addScanLog(value, `Target: ${bin.bin_code}`, true);
        setCurrentStep(4);
      }
    } else if (tt === "putaway") {
      if (currentStep === 0) {
        const product = await resolveProduct(value);
        if (!product) {
          addScanLog(value, "Not found", false);
          return;
        }
        setScannedProductSku(product.sku);
        addScanLog(value, product.name, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        const bin = await resolveBin(value);
        if (!bin) {
          addScanLog(value, "Not found", false);
          return;
        }
        setTargetBinCode(bin.bin_code);
        addScanLog(value, `Bin: ${bin.bin_code}`, true);
        setCurrentStep(2);
      }
    } else if (tt === "pick") {
      const batch = !!activeTask.pick_tote_code;
      if (currentStep === 0) {
        const bin = await resolveBin(value);
        if (!bin || (batch && bin.id !== activeTask.source_bin_id)) {
          addScanLog(value, "Scan the assigned bin", false);
          return;
        }
        setScannedBinCode(bin.bin_code);
        addScanLog(batch ? bin.bin_code : value, bin.bin_code, true);
        setCurrentStep(1);
      } else if (currentStep === 1) {
        const product = await resolveProduct(value);
        if (!product || (batch && product.id !== activeTask.product_id)) {
          addScanLog(value, "Scan the assigned SKU", false);
          return;
        }
        setScannedProductSku(product.sku);
        addScanLog(batch ? product.sku : value, product.name, true);
        setCurrentStep(2);
      } else if (currentStep === 2) {
        const qty = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(qty) || qty < (batch ? 0 : 1) ||
          (batch && qty > (activeTask.requested_quantity ?? 0))) {
          toast.error(batch ? "Enter the actual quantity picked, including zero for a short pick" : "Enter a positive whole quantity");
          return;
        }
        setEnteredQty(String(qty));
        addScanLog(String(qty), `Picked: ${qty}`, true);
        setCurrentStep(3);
      } else if (batch && currentStep === 3) {
        if (value.trim().toUpperCase() !== activeTask.pick_tote_code) {
          addScanLog(value, "Scan the assigned tote", false);
          return;
        }
        addScanLog(value, "Tote verified", true);
        setCurrentStep(4);
      }
    }
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  // ── Complete Task ──
  const handleCompleteTask = async () => {
    if (!activeTask || !user) return;
    setCompleting(true);
    const supabase = createClient();
    let scannedQty: number | null = null;
    let variance: number | null = null;
    if (
      activeTask.task_type === "verify_stock" ||
      activeTask.task_type === "cycle_count"
    ) {
      scannedQty = binItems.reduce((s, i) => s + (i.counted_qty ?? 0), 0);
      variance = scannedQty - binItems.reduce((s, i) => s + i.system_qty, 0);
    } else if (
      ["bin_to_bin", "replenish", "pick"].includes(activeTask.task_type)
    ) {
      scannedQty = parseInt(enteredQty, 10) || 0;
    }
    const result = activeTask.cycle_count_line_id
      ? await supabase.rpc("submit_scanner_cycle_count", {
          p_task: activeTask.id, p_bin: countEvidence[0], p_sku: countEvidence[1],
          p_lot: countEvidence[2], p_quantity: Number(countEvidence[3]),
        })
      : await supabase.rpc("complete_scan_task", {
          p_task_id: activeTask.id,
          p_quantity: scannedQty,
          p_variance: variance,
          p_source: scannedBinCode,
          p_target: targetBinCode,
          p_scans: scanLog.filter((entry) => entry.success).map((entry) => ({ value: entry.value })),
        });
    if (result.error) {
      toast.error(result.error.message);
      setCompleting(false);
      return;
    }
    setCompleting(false);
    toast.success("Task completed!");
    setActiveTask(null);
    setMode("tasks");
    if (selectedFunction) loadTasks(selectedFunction);
  };

  // ── Step config ──
  const getSteps = (t: ScanTaskType): string[] => {
    switch (t) {
      case "verify_stock":
      case "cycle_count":
        return ["Scan Bin", "Scan Item", "Enter Qty", "Submit"];
      case "verify_bin":
        return ["Scan Bin", "Submit"];
      case "bin_to_bin":
      case "replenish":
        return ["Source", "Item", "Qty", "Target", "Confirm"];
      case "putaway":
        return ["Item", "Bin", "Confirm"];
      case "pick":
        return activeTask?.pick_tote_code ? ["Bin", "Item", "Qty", "Tote", "Confirm"] : ["Bin", "Item", "Qty", "Confirm"];
      default:
        return ["Scan", "Confirm"];
    }
  };

  const getPrompt = (t: ScanTaskType, step: number): string => {
    switch (t) {
      case "verify_stock":
      case "cycle_count":
        return (
          ["Scan bin", "Scan product", "Enter count", "Review & submit"][
            step
          ] || ""
        );
      case "verify_bin":
        return step === 0 ? "Scan bin barcode" : "Submit";
      case "bin_to_bin":
      case "replenish":
        return (
          [
            "Scan source",
            "Scan product",
            "Enter qty",
            "Scan target",
            "Confirm",
          ][step] || ""
        );
      case "putaway":
        return ["Scan product", "Scan bin", "Confirm"][step] || "";
      case "pick":
        return (activeTask?.pick_tote_code
          ? ["Scan assigned bin", "Scan assigned product", "Enter picked quantity (0 if short)", "Scan assigned tote", "Confirm pick"]
          : ["Scan bin", "Scan product", "Enter qty", "Confirm"])[step] || "";
      default:
        return "Scan";
    }
  };

  const isSubmitStep = (t: ScanTaskType, step: number): boolean =>
    step === getSteps(t).length - 1;

  // ═══════════════════════════════════════
  // RENDER: Active Task (scan workflow)
  // ═══════════════════════════════════════
  if (mode === "active" && activeTask) {
    const plannedCount = !!activeTask.cycle_count_line_id;
    const steps = plannedCount ? ["Bin", "SKU", "Lot", "Qty", "Submit"] : getSteps(activeTask.task_type);
    const prompt = plannedCount
      ? ["Scan assigned bin", "Scan assigned SKU", "Scan lot number", "Enter physical quantity", "Review and submit"][currentStep]
      : getPrompt(activeTask.task_type, currentStep);
    const showSubmit = plannedCount ? currentStep === 4 : isSubmitStep(activeTask.task_type, currentStep);
    const quantityStep = plannedCount ? currentStep === 3 : currentStep === 2;

    return (
      <div className="flex flex-col h-full">
        {/* Task header */}
        <div className="bg-brand-deep-plum text-brand-white px-3 py-2 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Badge
                variant="outline"
                className="text-[10px] text-white border-white/30"
              >
                {TASK_TYPE_LABELS[activeTask.task_type]}
              </Badge>
              <span className="font-medium text-xs truncate">
                {activeTask.title}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="size-11 p-0 text-brand-lavender hover:bg-white/10 hover:text-white"
              aria-label="Return to task list"
              onClick={handleCancelActive}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {/* Steps */}
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
            {steps.map((label, idx) => (
              <div key={idx} className="flex items-center gap-0.5 shrink-0">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    idx < currentStep
                      ? "bg-emerald-300 text-emerald-950"
                      : idx === currentStep
                        ? "bg-brand-coral text-brand-deep-plum"
                        : "bg-white/10 text-brand-lavender"
                  }`}
                >
                  {idx < currentStep ? (
                    <Check className="h-2.5 w-2.5" />
                  ) : (
                    idx + 1
                  )}
                </div>
                <span
                  className={`text-[11px] ${idx === currentStep ? "text-white" : "text-brand-lavender"}`}
                >
                  {label}
                </span>
                {idx < steps.length - 1 && (
                  <ChevronRight className="h-2.5 w-2.5 text-slate-600" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Scan area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {!showSubmit && (
            <div className="space-y-1.5">
              <p className="text-sm font-semibold">{prompt}</p>
              <div className="flex gap-2">
                <Input
                  ref={scanInputRef}
                  value={scanInput}
                  onChange={(e) => setScanInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleScan();
                  }}
                  placeholder={quantityStep ? "Qty..." : "Scan..."}
                  className="h-11 text-base font-mono"
                  autoFocus
                  inputMode={quantityStep ? "numeric" : "text"}
                />
                <Button onClick={handleScan} aria-label={quantityStep ? "Enter quantity" : "Submit scan"} className="h-11 w-11 shrink-0">
                  <ScanBarcode className="h-5 w-5" />
                </Button>
              </div>
            </div>
          )}

          {plannedCount && showSubmit && (
            <Card>
              <CardContent className="space-y-1 p-4 text-sm">
                <p>{countEvidence[1]} · Lot {countEvidence[2]}</p>
                <p>Bin {countEvidence[0]}</p>
                <p className="font-semibold">Counted Quantity: {countEvidence[3]}</p>
              </CardContent>
            </Card>
          )}

          {/* Bin items for count/verify */}
          {!plannedCount && (activeTask.task_type === "verify_stock" ||
            activeTask.task_type === "cycle_count") &&
            currentStep >= 1 && (
              <Card>
                <CardContent className="p-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold">
                      {scannedBinCode}
                    </span>
                    <span className="text-muted-foreground">
                      {binItems.filter((i) => i.scanned).length}/
                      {binItems.length}
                    </span>
                  </div>
                  {binItems.map((item, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-2 rounded border text-xs ${
                        item.scanned
                          ? item.counted_qty === item.system_qty
                            ? "border-green-300 bg-green-50"
                            : "border-amber-300 bg-amber-50"
                          : "border-border"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {item.product_name}
                        </p>
                        <p className="text-muted-foreground font-mono">
                          {item.product_sku}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        {item.scanned ? (
                          <span className="font-bold">
                            {item.counted_qty}/{item.system_qty}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Sys: {item.system_qty}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

          {/* Move summary */}
          {(activeTask.task_type === "bin_to_bin" ||
            activeTask.task_type === "replenish") &&
            currentStep >= 1 && (
              <Card>
                <CardContent className="p-3 grid grid-cols-3 gap-1 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Source</p>
                    <p className="font-mono font-bold">
                      {scannedBinCode || "—"}
                    </p>
                  </div>
                  <div className="flex items-center justify-center">
                    <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Target</p>
                    <p className="font-mono font-bold">
                      {targetBinCode || "—"}
                    </p>
                  </div>
                  {scannedProductSku && (
                    <div className="col-span-3 mt-1">
                      <p className="font-medium">{scannedProductSku}</p>
                    </div>
                  )}
                  {enteredQty && (
                    <div className="col-span-3">
                      <p className="text-xl font-bold">{enteredQty}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

          {activeTask.task_type === "verify_bin" && currentStep === 1 && (
            <div className="text-center py-3">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto" />
              <p className="text-sm font-bold mt-1">
                Bin {scannedBinCode} Verified
              </p>
            </div>
          )}

          {showSubmit && varianceTotal > 0 && (
            <div className="flex items-center gap-2 p-2 rounded bg-amber-50 border border-amber-300 text-xs">
              <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
              <span>Variance: {varianceTotal}</span>
            </div>
          )}

          {showSubmit && (
            <Button
              onClick={handleCompleteTask}
              disabled={completing}
              className="w-full h-11 text-sm font-bold"
            >
              {completing ? "Submitting..." : "Complete Task"}{" "}
              {!completing && <Check className="h-4 w-4 ml-1" />}
            </Button>
          )}

          {scanLog.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-medium text-muted-foreground">
                Log
              </p>
              {scanLog.slice(0, 4).map((e) => (
                <div
                  key={e.id}
                  className={`flex items-center gap-1.5 text-[10px] p-1.5 rounded ${e.success ? "bg-muted" : "bg-destructive/10"}`}
                >
                  {e.success ? (
                    <Check className="h-2.5 w-2.5 text-green-600" />
                  ) : (
                    <X className="h-2.5 w-2.5 text-destructive" />
                  )}
                  <span className="text-muted-foreground">{e.time}</span>
                  <span className="font-mono">{e.value}</span>
                  <span className="text-muted-foreground truncate">
                    {e.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: Task List (for selected function)
  // ═══════════════════════════════════════
  if (mode === "tasks" && selectedFunction) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex shrink-0 items-center gap-3 border-b bg-card px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="size-11 p-0"
            aria-label="Back to scanner tasks"
            onClick={backToMenu}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-sm font-semibold">
              {TASK_TYPE_LABELS[selectedFunction]}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {tasks.length} task{tasks.length !== 1 ? "s" : ""} assigned
            </p>
          </div>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="size-11 p-0"
            aria-label="Refresh assigned tasks"
            onClick={() => loadTasks(selectedFunction)}
          >
            <RotateCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Loading...
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-semibold">All caught up</p>
              <p className="text-xs text-muted-foreground mt-1">
                No {TASK_TYPE_LABELS[selectedFunction]} tasks assigned
              </p>
            </div>
          ) : (
            tasks.map((task) => (
              <Card key={task.id}>
                <CardContent className="p-2.5 flex items-center gap-2">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    {task.priority >= 8 && (
                      <Badge variant="destructive" className="text-[9px]">
                        Urgent
                      </Badge>
                    )}
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    {task.bin && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {task.bin.bin_code}
                      </p>
                    )}
                    {task.product && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {task.product.name}
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => handleStartTask(task)}
                    className="size-11 shrink-0 rounded-lg p-0"
                    aria-label={`Start ${task.title}`}
                  >
                    <Play aria-hidden className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════
  // RENDER: Function Menu (home screen)
  // ═══════════════════════════════════════
  const totalTasks = Object.values(taskCounts).reduce((s, c) => s + c, 0);

  return (
    <div className="h-full overflow-y-auto px-3 py-3 sm:px-5 sm:py-5">
      <section aria-labelledby="scanner-task-heading" className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-brand-deep-plum px-4 py-4 text-white sm:mb-4 sm:px-5">
        <div className="min-w-0">
          <h1 id="scanner-task-heading" className="text-xl font-bold tracking-tight sm:text-2xl">Scanner Tasks</h1>
          <p className="mt-1 text-xs text-brand-lavender">Choose a task type to view your queue.</p>
        </div>
        <div aria-label={`${totalTasks} tasks assigned to you`} className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-center">
          <span className="block text-2xl font-bold leading-none tabular-nums">{totalTasks}</span>
          <span className="mt-1 block text-[11px] font-medium text-brand-lavender">Assigned</span>
        </div>
      </section>

      <div aria-label="Task types" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
        {SCAN_FUNCTIONS.map((fn) => {
          const count = taskCounts[fn.key] || 0;
          return (
            <button
              key={fn.key}
              type="button"
              onClick={() => openFunction(fn.key)}
              className="group flex min-h-24 min-w-0 flex-col rounded-xl border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/50 hover:bg-muted/30 active:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-4"
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${fn.iconStyle}`}>
                  <fn.icon aria-hidden className="size-4" />
                </span>
                {count > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold tabular-nums text-primary" aria-label={`${count} assigned`}>{count}</span>
                ) : <ChevronRight aria-hidden className="size-4 text-muted-foreground group-hover:text-primary" />}
              </span>
              <span className="mt-2 text-sm font-semibold leading-tight text-foreground">{fn.label}</span>
              <span className="mt-0.5 text-xs leading-tight text-muted-foreground">{fn.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
