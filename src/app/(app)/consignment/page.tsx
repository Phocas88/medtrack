"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Package,
  DollarSign,
  Users,
  Download,
  ArrowRightLeft,
} from "lucide-react";
import { formatDate, formatCurrency, formatNumber } from "@/lib/format";
import { exportToCSV } from "@/lib/csv";
import { toast } from "sonner";

interface ConsignmentLot {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  supplier_name: string;
  supplier_id: string;
  lot_number: string;
  quantity_on_hand: number;
  cost_at_receipt: number;
  received_date: string;
  notes: string | null;
}

interface ConsignmentMovement {
  id: string;
  product_name: string;
  lot_number: string;
  quantity: number;
  reason: string | null;
  reference_number: string | null;
  created_at: string;
  user_name: string;
}

interface SupplierBilling {
  supplier_name: string;
  total_consumed: number;
  total_value: number;
  lot_count: number;
}

export default function ConsignmentPage() {
  const { user, tenantId } = useAuth();
  const [lots, setLots] = useState<ConsignmentLot[]>([]);
  const [movements, setMovements] = useState<ConsignmentMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());

  // Consumption dialog
  const [consumeDialogOpen, setConsumeDialogOpen] = useState(false);
  const [consumeLot, setConsumeLot] = useState<ConsignmentLot | null>(null);
  const [consumeQty, setConsumeQty] = useState("");
  const [consumeNotes, setConsumeNotes] = useState("");

  // Reports
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");
  const [billingData, setBillingData] = useState<SupplierBilling[]>([]);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const supabase = createClient();

    // Load consignment lots (lots with notes containing 'consignment')
    const { data: lotData } = await supabase
      .from("lots")
      .select("*, product:products(name, sku), supplier:suppliers(name)")
      .eq("tenant_id", tenantId)
      .ilike("notes", "%consignment%")
      .eq("status", "active")
      .order("received_date", { ascending: false });

    const mappedLots: ConsignmentLot[] = (lotData || []).map(
      (row: Record<string, unknown>) => {
        const product = row.product as { name: string; sku: string } | null;
        const supplier = row.supplier as { name: string } | null;
        return {
          id: row.id as string,
          product_id: row.product_id as string,
          product_name: product?.name || "",
          product_sku: product?.sku || "",
          supplier_name: supplier?.name || "Unknown",
          supplier_id: row.supplier_id as string,
          lot_number: row.lot_number as string,
          quantity_on_hand: row.quantity_on_hand as number,
          cost_at_receipt: row.cost_at_receipt as number,
          received_date: row.received_date as string,
          notes: row.notes as string | null,
        };
      },
    );

    // Load consignment movements
    const { data: moveData } = await supabase
      .from("stock_movements")
      .select("*, product:products(name), lot:lots(lot_number)")
      .eq("tenant_id", tenantId)
      .eq("movement_type", "adjust")
      .ilike("reference_number", "%consignment%")
      .order("created_at", { ascending: false })
      .limit(200);

    const userIds = Array.from(
      new Set(
        (moveData || [])
          .map((r: Record<string, unknown>) => r.user_id)
          .filter(Boolean),
      ),
    ) as string[];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from("users")
        .select("id, full_name")
        .in("id", userIds);
      userMap = (users || []).reduce(
        (acc: Record<string, string>, u: { id: string; full_name: string }) => {
          acc[u.id] = u.full_name;
          return acc;
        },
        {},
      );
    }

    const mappedMovements: ConsignmentMovement[] = (moveData || []).map(
      (row: Record<string, unknown>) => {
        const product = row.product as { name: string } | null;
        const lot = row.lot as { lot_number: string } | null;
        return {
          id: row.id as string,
          product_name: product?.name || "",
          lot_number: lot?.lot_number || "",
          quantity: row.quantity as number,
          reason: row.reason as string | null,
          reference_number: row.reference_number as string | null,
          created_at: row.created_at as string,
          user_name: userMap[row.user_id as string] || "",
        };
      },
    );

    setLots(mappedLots);
    setMovements(mappedMovements);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stats
  const totalLots = lots.length;
  const totalValue = lots.reduce(
    (sum, l) => sum + l.quantity_on_hand * l.cost_at_receipt,
    0,
  );
  const supplierCount = new Set(lots.map((l) => l.supplier_name)).size;

  // Convert to owned
  async function handleConvertToOwned(lot: ConsignmentLot) {
    if (!tenantId || !user) return;
    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.rpc("post_lot_disposition", {
      p_request: operationId,
      p_lot: lot.id,
      p_quantity: 0,
      p_kind: "convert",
      p_reason: "Converted from consignment to owned",
    });
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    setOperationId(crypto.randomUUID());

    toast.success(`Lot ${lot.lot_number} converted to owned inventory`);
    setSaving(false);
    loadData();
  }

  // Log consumption
  function openConsumeDialog(lot: ConsignmentLot) {
    setConsumeLot(lot);
    setConsumeQty("");
    setConsumeNotes("");
    setConsumeDialogOpen(true);
  }

  async function handleLogConsumption() {
    if (!tenantId || !user || !consumeLot) return;
    const qty = parseInt(consumeQty);
    if (!qty || qty <= 0 || qty > consumeLot.quantity_on_hand) {
      toast.error("Invalid quantity");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { error } = await supabase.rpc("post_lot_disposition", {
      p_request: operationId,
      p_lot: consumeLot.id,
      p_quantity: qty,
      p_kind: "consume",
      p_reason: consumeNotes || "Consignment consumption",
    });
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    setOperationId(crypto.randomUUID());

    toast.success(
      `Logged consumption of ${qty} units from lot ${consumeLot.lot_number}`,
    );
    setSaving(false);
    setConsumeDialogOpen(false);
    loadData();
  }

  // Reports
  async function generateReport() {
    if (!tenantId || !reportStart || !reportEnd) {
      toast.error("Select a date range");
      return;
    }

    const supabase = createClient();
    const { data } = await supabase
      .from("stock_movements")
      .select(
        "*, product:products(name), lot:lots(lot_number, supplier_id, cost_at_receipt, supplier:suppliers(name))",
      )
      .eq("tenant_id", tenantId)
      .eq("movement_type", "adjust")
      .ilike("reference_number", "%consignment%")
      .gte("created_at", reportStart)
      .lte("created_at", `${reportEnd}T23:59:59`);

    // Group by supplier
    const supplierMap: Record<string, SupplierBilling> = {};
    (data || []).forEach((row: Record<string, unknown>) => {
      if (Number(row.quantity) >= 0) return;
      const lot = row.lot as {
        supplier_id: string;
        cost_at_receipt: number;
        supplier: { name: string } | null;
      } | null;
      const supplierName = lot?.supplier?.name || "Unknown";
      const qty = Math.abs(row.quantity as number);
      const cost = lot?.cost_at_receipt || 0;

      if (!supplierMap[supplierName]) {
        supplierMap[supplierName] = {
          supplier_name: supplierName,
          total_consumed: 0,
          total_value: 0,
          lot_count: 0,
        };
      }
      supplierMap[supplierName].total_consumed += qty;
      supplierMap[supplierName].total_value += qty * cost;
      supplierMap[supplierName].lot_count += 1;
    });

    setBillingData(Object.values(supplierMap));
  }

  function exportBilling() {
    if (billingData.length === 0) {
      toast.error("No data to export");
      return;
    }
    exportToCSV(
      billingData as unknown as Record<string, unknown>[],
      "consignment_billing",
      [
        { key: "supplier_name", label: "Supplier" },
        { key: "total_consumed", label: "Total Consumed" },
        { key: "total_value", label: "Total Value" },
        { key: "lot_count", label: "Transactions" },
      ],
    );
    toast.success("Billing report exported");
  }

  // Columns
  const lotColumns: Column<ConsignmentLot>[] = [
    {
      key: "product_name",
      label: "Product",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium">{row.product_name}</div>
          <div className="text-xs text-muted-foreground">{row.product_sku}</div>
        </div>
      ),
    },
    { key: "supplier_name", label: "Supplier", sortable: true },
    {
      key: "lot_number",
      label: "Lot #",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.lot_number}</span>
      ),
    },
    {
      key: "quantity_on_hand",
      label: "Qty on Hand",
      sortable: true,
      render: (row) => formatNumber(row.quantity_on_hand),
    },
    {
      key: "received_date",
      label: "Received",
      sortable: true,
      render: (row) => formatDate(row.received_date),
    },
    {
      key: "actions" as keyof ConsignmentLot,
      label: "",
      render: (row) => (
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openConsumeDialog(row);
            }}
          >
            Log Use
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleConvertToOwned(row);
            }}
            disabled={saving}
          >
            <ArrowRightLeft className="mr-1 h-3 w-3" />
            Convert
          </Button>
        </div>
      ),
    },
  ];

  const movementColumns: Column<ConsignmentMovement>[] = [
    { key: "product_name", label: "Product", sortable: true },
    {
      key: "lot_number",
      label: "Lot #",
      render: (row) => (
        <span className="font-mono text-xs font-medium">{row.lot_number}</span>
      ),
    },
    {
      key: "quantity",
      label: "Quantity",
      sortable: true,
      render: (row) => (
        <span className={row.quantity < 0 ? "text-destructive" : ""}>
          {formatNumber(row.quantity)}
        </span>
      ),
    },
    { key: "reason", label: "Reason", render: (row) => row.reason || "--" },
    { key: "user_name", label: "User" },
    {
      key: "created_at",
      label: "Date",
      sortable: true,
      render: (row) => formatDate(row.created_at),
    },
  ];

  const billingColumns: Column<SupplierBilling>[] = [
    { key: "supplier_name", label: "Supplier", sortable: true },
    {
      key: "total_consumed",
      label: "Total Consumed",
      sortable: true,
      render: (row) => formatNumber(row.total_consumed),
    },
    {
      key: "total_value",
      label: "Total Value",
      sortable: true,
      render: (row) => formatCurrency(row.total_value),
    },
    {
      key: "lot_count",
      label: "Transactions",
      sortable: true,
      render: (row) => formatNumber(row.lot_count),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Consignment Inventory" />
        <div className="text-muted-foreground">Loading consignment data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Consignment Inventory"
        description="Track and manage consignment stock from suppliers"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Consignment Lots"
          value={formatNumber(totalLots)}
          icon={Package}
        />
        <StatCard
          title="Total Value"
          value={formatCurrency(totalValue)}
          icon={DollarSign}
        />
        <StatCard
          title="Suppliers"
          value={formatNumber(supplierCount)}
          icon={Users}
        />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="consumption">Consumption</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <DataTable
            data={lots}
            columns={lotColumns}
            searchKey="product_name"
            searchPlaceholder="Search consignment lots..."
            emptyMessage="No consignment lots found."
          />
        </TabsContent>

        <TabsContent value="consumption" className="space-y-4">
          <DataTable
            data={movements}
            columns={movementColumns}
            searchKey="product_name"
            searchPlaceholder="Search consumption records..."
            emptyMessage="No consignment consumption records found."
          />
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Supplier Billing Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={reportStart}
                    onChange={(e) => setReportStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={reportEnd}
                    onChange={(e) => setReportEnd(e.target.value)}
                  />
                </div>
                <Button onClick={generateReport}>Generate</Button>
                <Button
                  variant="outline"
                  onClick={exportBilling}
                  disabled={billingData.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export CSV
                </Button>
              </div>

              {billingData.length > 0 && (
                <DataTable
                  data={billingData}
                  columns={billingColumns}
                  searchKey="supplier_name"
                  searchPlaceholder="Search suppliers..."
                  emptyMessage="No billing data for selected range."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Consumption Dialog */}
      <Dialog open={consumeDialogOpen} onOpenChange={setConsumeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log Consignment Consumption</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {consumeLot && (
              <div className="text-sm text-muted-foreground">
                {consumeLot.product_name} - Lot {consumeLot.lot_number}{" "}
                (Available: {formatNumber(consumeLot.quantity_on_hand)})
              </div>
            )}
            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                min="1"
                max={consumeLot?.quantity_on_hand}
                value={consumeQty}
                onChange={(e) => setConsumeQty(e.target.value)}
                placeholder="Enter quantity consumed"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={consumeNotes}
                onChange={(e) => setConsumeNotes(e.target.value)}
                placeholder="Optional notes about consumption"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConsumeDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleLogConsumption} disabled={saving}>
              {saving ? "Logging..." : "Log Consumption"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
