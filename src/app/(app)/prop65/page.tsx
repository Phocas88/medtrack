"use client";

import { escapeHtml } from "@/lib/html";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Search,
  Download,
  Printer,
  FileText,
  CheckCircle,
  Info,
  Shield,
} from "lucide-react";
import { formatDate } from "@/lib/format";
import { exportToCSV } from "@/lib/csv";
import { toast } from "sonner";

// --- Prop 65 Chemical Reference List ---
interface Prop65Chemical {
  name: string;
  cas_number: string;
  listing_date: string;
  warning_type: "cancer" | "reproductive" | "both";
}

const PROP65_CHEMICALS: Prop65Chemical[] = [
  {
    name: "Lead",
    cas_number: "7439-92-1",
    listing_date: "1987-10-01",
    warning_type: "both",
  },
  {
    name: "Cadmium",
    cas_number: "7440-43-9",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Phthalates (DEHP)",
    cas_number: "117-81-7",
    listing_date: "1988-01-01",
    warning_type: "both",
  },
  {
    name: "Phthalates (DBP)",
    cas_number: "84-74-2",
    listing_date: "1992-01-01",
    warning_type: "reproductive",
  },
  {
    name: "Phthalates (BBP)",
    cas_number: "85-68-7",
    listing_date: "2007-12-21",
    warning_type: "reproductive",
  },
  {
    name: "Formaldehyde",
    cas_number: "50-00-0",
    listing_date: "1988-01-01",
    warning_type: "cancer",
  },
  {
    name: "Acrylamide",
    cas_number: "79-06-1",
    listing_date: "1990-01-01",
    warning_type: "both",
  },
  {
    name: "Bisphenol A (BPA)",
    cas_number: "80-05-7",
    listing_date: "2015-05-11",
    warning_type: "reproductive",
  },
  {
    name: "Mercury",
    cas_number: "7439-97-6",
    listing_date: "1987-10-01",
    warning_type: "reproductive",
  },
  {
    name: "Arsenic",
    cas_number: "7440-38-2",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Benzene",
    cas_number: "71-43-2",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Toluene",
    cas_number: "108-88-3",
    listing_date: "1991-01-01",
    warning_type: "reproductive",
  },
  {
    name: "Styrene",
    cas_number: "100-42-5",
    listing_date: "2016-04-22",
    warning_type: "cancer",
  },
  {
    name: "Vinyl chloride",
    cas_number: "75-01-4",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Ethylene oxide",
    cas_number: "75-21-8",
    listing_date: "1987-10-01",
    warning_type: "both",
  },
  {
    name: "Nickel (metallic)",
    cas_number: "7440-02-0",
    listing_date: "2017-11-03",
    warning_type: "cancer",
  },
  {
    name: "Chromium (hexavalent)",
    cas_number: "18540-29-9",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Di(2-ethylhexyl) phthalate",
    cas_number: "117-81-7",
    listing_date: "1988-01-01",
    warning_type: "cancer",
  },
  {
    name: "Propylene oxide",
    cas_number: "75-56-9",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Carbon tetrachloride",
    cas_number: "56-23-5",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Chloroform",
    cas_number: "67-66-3",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Methylene chloride",
    cas_number: "75-09-2",
    listing_date: "1988-02-27",
    warning_type: "cancer",
  },
  {
    name: "Trichloroethylene",
    cas_number: "79-01-6",
    listing_date: "1988-04-01",
    warning_type: "cancer",
  },
  {
    name: "Acetaldehyde",
    cas_number: "75-07-0",
    listing_date: "1988-04-01",
    warning_type: "cancer",
  },
  {
    name: "1,3-Butadiene",
    cas_number: "106-99-0",
    listing_date: "1988-04-01",
    warning_type: "both",
  },
  {
    name: "N-Nitrosodiethylamine",
    cas_number: "55-18-5",
    listing_date: "1987-10-01",
    warning_type: "cancer",
  },
  {
    name: "Diethanolamine",
    cas_number: "111-42-2",
    listing_date: "2012-06-22",
    warning_type: "cancer",
  },
  {
    name: "Titanium dioxide (airborne)",
    cas_number: "13463-67-7",
    listing_date: "2011-09-02",
    warning_type: "cancer",
  },
  {
    name: "Crystalline silica (airborne)",
    cas_number: "14808-60-7",
    listing_date: "1988-10-01",
    warning_type: "cancer",
  },
  {
    name: "Wood dust",
    cas_number: "N/A",
    listing_date: "1988-02-27",
    warning_type: "cancer",
  },
];

// --- Types ---
interface Prop65Data {
  status: "compliant" | "warning_required" | "exempt" | "not_assessed";
  chemicals: string[];
  warning_type: "cancer" | "reproductive" | "both" | null;
  warning_text: string;
  last_assessed_date: string | null;
  assessed_by: string | null;
  audit_log: { date: string; action: string; user: string }[];
}

interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  manufacturer: string | null;
  notes: string | null;
  prop65: Prop65Data;
}

function parseProp65(notes: string | null): Prop65Data {
  const defaultData: Prop65Data = {
    status: "not_assessed",
    chemicals: [],
    warning_type: null,
    warning_text: "",
    last_assessed_date: null,
    assessed_by: null,
    audit_log: [],
  };
  if (!notes) return defaultData;
  try {
    const parsed = JSON.parse(notes);
    if (parsed.prop65) return { ...defaultData, ...parsed.prop65 };
  } catch {
    // notes is not JSON
  }
  return defaultData;
}

function serializeProp65(notes: string | null, prop65: Prop65Data): string {
  let existing: Record<string, unknown> = {};
  if (notes) {
    try {
      existing = JSON.parse(notes);
    } catch {
      existing = { original_notes: notes };
    }
  }
  return JSON.stringify({ ...existing, prop65 });
}

function statusBadge(status: Prop65Data["status"]) {
  const config: Record<
    string,
    {
      variant: "default" | "secondary" | "destructive" | "outline";
      label: string;
    }
  > = {
    compliant: { variant: "default", label: "Compliant" },
    warning_required: { variant: "destructive", label: "Warning Required" },
    exempt: { variant: "secondary", label: "Exempt" },
    not_assessed: { variant: "outline", label: "Not Assessed" },
  };
  const c = config[status] || config.not_assessed;
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

function warningTypeBadge(type: string | null) {
  if (!type) return null;
  const labels: Record<string, string> = {
    cancer: "Cancer",
    reproductive: "Reproductive",
    both: "Cancer & Reproductive",
  };
  return <Badge variant="outline">{labels[type] || type}</Badge>;
}

function generateWarningText(
  chemicals: string[],
  warningType: string | null,
): string {
  if (!chemicals.length || !warningType) return "";
  const chemList =
    chemicals.slice(0, 3).join(", ") +
    (chemicals.length > 3 ? ` and other chemicals` : "");
  const harm =
    warningType === "cancer"
      ? "cancer"
      : warningType === "reproductive"
        ? "birth defects or other reproductive harm"
        : "cancer and birth defects or other reproductive harm";
  return `\u26A0 WARNING: This product can expose you to chemicals including ${chemList}, which ${chemicals.length === 1 ? "is" : "are"} known to the State of California to cause ${harm}. For more information go to www.P65Warnings.ca.gov.`;
}

export default function Prop65Page() {
  const { user, tenantId } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [chemSearchQuery, setChemSearchQuery] = useState("");

  // Assess dialog
  const [assessDialogOpen, setAssessDialogOpen] = useState(false);
  const [assessProduct, setAssessProduct] = useState<ProductRow | null>(null);
  const [selectedChemicals, setSelectedChemicals] = useState<string[]>([]);
  const [assessWarningType, setAssessWarningType] = useState<string>("cancer");
  const [assessWarningText, setAssessWarningText] = useState("");
  const [assessStatus, setAssessStatus] = useState<string>("warning_required");

  // Bulk selection
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(
    new Set(),
  );

  // Label generation
  const [labelProduct, setLabelProduct] = useState<string>("");
  const [batchLabelProducts, setBatchLabelProducts] = useState<Set<string>>(
    new Set(),
  );

  // Customers for CA report
  const [caCustomerCount, setCaCustomerCount] = useState(0);

  const loadProducts = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("products")
      .select("id, name, sku, category, manufacturer, notes")
      .eq("tenant_id", tenantId)
      .order("name");

    const mapped: ProductRow[] = (data || []).map((p) => ({
      ...p,
      prop65: parseProp65(p.notes),
    }));
    setProducts(mapped);
    setLoading(false);

    // Load CA customers
    const { count } = await supabase
      .from("customers")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .ilike("address", "%CA%");
    setCaCustomerCount(count || 0);
  }, [tenantId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const filteredProducts = products.filter((p) => {
    if (statusFilter !== "all" && p.prop65.status !== statusFilter)
      return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredChemicals = PROP65_CHEMICALS.filter((c) => {
    if (!chemSearchQuery) return true;
    const q = chemSearchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) || c.cas_number.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: products.length,
    assessed: products.filter((p) => p.prop65.status !== "not_assessed").length,
    warningRequired: products.filter(
      (p) => p.prop65.status === "warning_required",
    ).length,
    compliant: products.filter((p) => p.prop65.status === "compliant").length,
  };

  const openAssessDialog = (product: ProductRow) => {
    setAssessProduct(product);
    setSelectedChemicals(product.prop65.chemicals);
    setAssessWarningType(product.prop65.warning_type || "cancer");
    setAssessWarningText(product.prop65.warning_text);
    setAssessStatus(
      product.prop65.status === "not_assessed"
        ? "warning_required"
        : product.prop65.status,
    );
    setAssessDialogOpen(true);
  };

  const handleChemicalToggle = (chemName: string) => {
    setSelectedChemicals((prev) =>
      prev.includes(chemName)
        ? prev.filter((c) => c !== chemName)
        : [...prev, chemName],
    );
  };

  useEffect(() => {
    if (selectedChemicals.length > 0) {
      setAssessWarningText(
        generateWarningText(selectedChemicals, assessWarningType),
      );
    }
  }, [selectedChemicals, assessWarningType]);

  const saveAssessment = async () => {
    if (!assessProduct || !tenantId || !user) return;
    const supabase = createClient();

    const newProp65: Prop65Data = {
      status: assessStatus as Prop65Data["status"],
      chemicals: selectedChemicals,
      warning_type:
        assessStatus === "warning_required"
          ? (assessWarningType as Prop65Data["warning_type"])
          : null,
      warning_text:
        assessStatus === "warning_required" ? assessWarningText : "",
      last_assessed_date: new Date().toISOString(),
      assessed_by: user.full_name || user.email || "Unknown",
      audit_log: [
        ...(assessProduct.prop65.audit_log || []),
        {
          date: new Date().toISOString(),
          action: `Status set to ${assessStatus}. Chemicals: ${selectedChemicals.join(", ") || "none"}`,
          user: user.full_name || user.email || "Unknown",
        },
      ],
    };

    const newNotes = serializeProp65(assessProduct.notes, newProp65);

    const { error } = await supabase
      .from("products")
      .update({ notes: newNotes })
      .eq("id", assessProduct.id)
      .eq("tenant_id", tenantId);

    if (error) {
      toast.error("Failed to save assessment");
      return;
    }

    toast.success(`Assessment saved for ${assessProduct.name}`);
    setAssessDialogOpen(false);
    loadProducts();
  };

  const bulkMarkAssessed = async () => {
    if (selectedProducts.size === 0 || !tenantId || !user) return;
    const supabase = createClient();
    let count = 0;

    for (const productId of Array.from(selectedProducts)) {
      const product = products.find((p) => p.id === productId);
      if (!product || product.prop65.status !== "not_assessed") continue;

      const newProp65: Prop65Data = {
        ...product.prop65,
        status: "compliant",
        last_assessed_date: new Date().toISOString(),
        assessed_by: user.full_name || user.email || "Unknown",
        audit_log: [
          ...(product.prop65.audit_log || []),
          {
            date: new Date().toISOString(),
            action: "Bulk marked as Compliant",
            user: user.full_name || user.email || "Unknown",
          },
        ],
      };

      const newNotes = serializeProp65(product.notes, newProp65);
      await supabase
        .from("products")
        .update({ notes: newNotes })
        .eq("id", productId)
        .eq("tenant_id", tenantId);
      count++;
    }

    toast.success(`${count} products marked as compliant`);
    setSelectedProducts(new Set());
    loadProducts();
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedProducts.size === filteredProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(filteredProducts.map((p) => p.id)));
    }
  };

  const getSelectedProduct = () => products.find((p) => p.id === labelProduct);

  const printLabel = (product: ProductRow) => {
    const w = window.open("", "_blank", "width=600,height=400");
    if (!w) return;
    w.document.write(`
      <html><head><title>Prop 65 Warning - ${escapeHtml(product.name)}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; }
        .label { border: 3px solid #000; padding: 20px; max-width: 500px; }
        .warning-icon { font-size: 24px; }
        .warning-title { font-weight: bold; font-size: 18px; margin-bottom: 10px; }
        .warning-text { font-size: 14px; line-height: 1.5; }
        .product-info { margin-top: 15px; font-size: 12px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
      </style></head><body>
      <div class="label">
        <div class="warning-title">\u26A0 WARNING</div>
        <div class="warning-text">${escapeHtml(product.prop65.warning_text)}</div>
        <div class="product-info">
          <div>Product: ${escapeHtml(product.name)}</div>
          <div>SKU: ${escapeHtml(product.sku)}</div>
          <div>Assessed: ${product.prop65.last_assessed_date ? new Date(product.prop65.last_assessed_date).toLocaleDateString() : "N/A"}</div>
        </div>
      </div>
      <script>window.print();</script>
      </body></html>
    `);
    w.document.close();
  };

  const printBatchLabels = () => {
    const selected = products.filter(
      (p) =>
        batchLabelProducts.has(p.id) && p.prop65.status === "warning_required",
    );
    if (selected.length === 0) {
      toast.error("No products with warnings selected");
      return;
    }
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return;
    const labelsHtml = selected
      .map(
        (p) => `
      <div class="label" style="page-break-after: always;">
        <div class="warning-title">\u26A0 WARNING</div>
        <div class="warning-text">${escapeHtml(p.prop65.warning_text)}</div>
        <div class="product-info">
          <div>Product: ${escapeHtml(p.name)}</div>
          <div>SKU: ${escapeHtml(p.sku)}</div>
        </div>
      </div>`,
      )
      .join("");
    w.document.write(`
      <html><head><title>Prop 65 Warning Labels</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .label { border: 3px solid #000; padding: 20px; max-width: 500px; margin: 20px auto; }
        .warning-title { font-weight: bold; font-size: 18px; margin-bottom: 10px; }
        .warning-text { font-size: 14px; line-height: 1.5; }
        .product-info { margin-top: 15px; font-size: 12px; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }
        @media print { .label { page-break-after: always; border: 3px solid #000; } }
      </style></head><body>${labelsHtml}
      <script>window.print();</script></body></html>
    `);
    w.document.close();
  };

  const exportComplianceReport = () => {
    const data = products.map((p) => ({
      product_name: p.name,
      sku: p.sku,
      category: p.category || "",
      manufacturer: p.manufacturer || "",
      prop65_status: p.prop65.status,
      chemicals: p.prop65.chemicals.join("; "),
      warning_type: p.prop65.warning_type || "",
      last_assessed: p.prop65.last_assessed_date || "",
      assessed_by: p.prop65.assessed_by || "",
    }));
    exportToCSV(data, "prop65_compliance_report");
    toast.success("Compliance report exported");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proposition 65 Tracking"
        description="California Prop 65 chemical tracking, warning labels, and compliance management"
      />

      <Tabs defaultValue="registry">
        <TabsList>
          <TabsTrigger value="registry">Product Registry</TabsTrigger>
          <TabsTrigger value="chemicals">Chemical List</TabsTrigger>
          <TabsTrigger value="labels">Warning Labels</TabsTrigger>
          <TabsTrigger value="report">Compliance Report</TabsTrigger>
        </TabsList>

        {/* Product Registry Tab */}
        <TabsContent value="registry" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="warning_required">
                  Warning Required
                </SelectItem>
                <SelectItem value="compliant">Compliant</SelectItem>
                <SelectItem value="exempt">Exempt</SelectItem>
                <SelectItem value="not_assessed">Not Assessed</SelectItem>
              </SelectContent>
            </Select>
            {selectedProducts.size > 0 && (
              <Button onClick={bulkMarkAssessed} variant="outline">
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark {selectedProducts.size} as Compliant
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          selectedProducts.size === filteredProducts.length &&
                          filteredProducts.length > 0
                        }
                        onCheckedChange={toggleAllSelection}
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Chemicals</TableHead>
                    <TableHead>Warning</TableHead>
                    <TableHead>Last Assessed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Loading products...
                      </TableCell>
                    </TableRow>
                  ) : filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No products found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredProducts.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedProducts.has(p.id)}
                            onCheckedChange={() => toggleProductSelection(p.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.sku}
                        </TableCell>
                        <TableCell>{statusBadge(p.prop65.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {p.prop65.chemicals.slice(0, 3).map((c) => (
                              <Badge
                                key={c}
                                variant="outline"
                                className="text-xs"
                              >
                                {c}
                              </Badge>
                            ))}
                            {p.prop65.chemicals.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{p.prop65.chemicals.length - 3}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {warningTypeBadge(p.prop65.warning_type)}
                        </TableCell>
                        <TableCell>
                          {formatDate(p.prop65.last_assessed_date)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openAssessDialog(p)}
                          >
                            Assess
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chemical List Tab */}
        <TabsContent value="chemicals" className="space-y-4">
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardContent className="p-4 flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Partial Reference List
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  This is a partial list of common Prop 65 chemicals. See{" "}
                  <a
                    href="https://oehha.ca.gov/proposition-65/proposition-65-list"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    OEHHA.ca.gov
                  </a>{" "}
                  for the full Proposition 65 list containing over 900
                  chemicals.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or CAS number..."
              value={chemSearchQuery}
              onChange={(e) => setChemSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Chemical Name</TableHead>
                    <TableHead>CAS Number</TableHead>
                    <TableHead>Listing Date</TableHead>
                    <TableHead>Warning Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredChemicals.map((c) => (
                    <TableRow key={c.cas_number + c.name}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {c.cas_number}
                      </TableCell>
                      <TableCell>{formatDate(c.listing_date)}</TableCell>
                      <TableCell>{warningTypeBadge(c.warning_type)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Warning Labels Tab */}
        <TabsContent value="labels" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Single Label</CardTitle>
                <CardDescription>
                  Generate a Prop 65 warning label for a product
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Select Product</Label>
                  <Select value={labelProduct} onValueChange={setLabelProduct}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a product..." />
                    </SelectTrigger>
                    <SelectContent>
                      {products
                        .filter((p) => p.prop65.status === "warning_required")
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ({p.sku})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {getSelectedProduct() && (
                  <>
                    <div className="rounded-lg border-2 border-black p-4 bg-white text-black">
                      <p className="font-bold text-lg mb-2">
                        {"\u26A0"} WARNING
                      </p>
                      <p className="text-sm leading-relaxed">
                        {getSelectedProduct()!.prop65.warning_text}
                      </p>
                      <Separator className="my-3" />
                      <p className="text-xs text-gray-500">
                        {getSelectedProduct()!.name} |{" "}
                        {getSelectedProduct()!.sku}
                      </p>
                    </div>
                    <Button onClick={() => printLabel(getSelectedProduct()!)}>
                      <Printer className="mr-2 h-4 w-4" />
                      Print Warning Label
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Batch Print</CardTitle>
                <CardDescription>
                  Select multiple products to generate all warning labels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {products
                    .filter((p) => p.prop65.status === "warning_required")
                    .map((p) => (
                      <div key={p.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={batchLabelProducts.has(p.id)}
                          onCheckedChange={() => {
                            setBatchLabelProducts((prev) => {
                              const next = new Set(prev);
                              if (next.has(p.id)) next.delete(p.id);
                              else next.add(p.id);
                              return next;
                            });
                          }}
                        />
                        <span className="text-sm">
                          {p.name}{" "}
                          <span className="text-muted-foreground">
                            ({p.sku})
                          </span>
                        </span>
                      </div>
                    ))}
                  {products.filter(
                    (p) => p.prop65.status === "warning_required",
                  ).length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No products with warning required status
                    </p>
                  )}
                </div>
                <Button
                  onClick={printBatchLabels}
                  disabled={batchLabelProducts.size === 0}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print {batchLabelProducts.size} Labels
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Compliance Report Tab */}
        <TabsContent value="report" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Total Products"
              value={stats.total}
              icon={FileText}
            />
            <StatCard
              title="Assessed"
              value={
                stats.total > 0
                  ? `${Math.round((stats.assessed / stats.total) * 100)}%`
                  : "0%"
              }
              icon={CheckCircle}
              description={`${stats.assessed} of ${stats.total}`}
            />
            <StatCard
              title="Warning Required"
              value={stats.warningRequired}
              icon={AlertTriangle}
            />
            <StatCard title="Compliant" value={stats.compliant} icon={Shield} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>California Shipping Summary</CardTitle>
              <CardDescription>
                Products potentially shipping to California customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                {caCustomerCount} customer{caCustomerCount !== 1 ? "s" : ""}{" "}
                with California addresses found.
                {stats.warningRequired > 0 && (
                  <span className="text-destructive font-medium">
                    {" "}
                    {stats.warningRequired} product
                    {stats.warningRequired !== 1 ? "s" : ""} require Prop 65
                    warnings.
                  </span>
                )}
              </p>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Assessed</TableHead>
                    <TableHead>Assessed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products
                    .filter(
                      (p) =>
                        p.prop65.status === "warning_required" ||
                        p.prop65.status === "not_assessed",
                    )
                    .map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell>{p.sku}</TableCell>
                        <TableCell>{statusBadge(p.prop65.status)}</TableCell>
                        <TableCell>
                          {formatDate(p.prop65.last_assessed_date)}
                        </TableCell>
                        <TableCell>
                          {p.prop65.assessed_by || "\u2014"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Audit Trail</CardTitle>
              <CardDescription>
                History of all Prop 65 assessments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products
                    .flatMap((p) =>
                      (p.prop65.audit_log || []).map((entry) => ({
                        ...entry,
                        product_name: p.name,
                      })),
                    )
                    .sort(
                      (a, b) =>
                        new Date(b.date).getTime() - new Date(a.date).getTime(),
                    )
                    .slice(0, 50)
                    .map((entry, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{formatDate(entry.date)}</TableCell>
                        <TableCell className="font-medium">
                          {entry.product_name}
                        </TableCell>
                        <TableCell>{entry.action}</TableCell>
                        <TableCell>{entry.user}</TableCell>
                      </TableRow>
                    ))}
                  {products.every((p) => !p.prop65.audit_log?.length) && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No assessment history yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Button onClick={exportComplianceReport}>
            <Download className="mr-2 h-4 w-4" />
            Export Compliance Report CSV
          </Button>
        </TabsContent>
      </Tabs>

      {/* Assess Product Dialog */}
      <Dialog open={assessDialogOpen} onOpenChange={setAssessDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Assess Product - {assessProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Prop 65 Status</Label>
              <Select value={assessStatus} onValueChange={setAssessStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="warning_required">
                    Warning Required
                  </SelectItem>
                  <SelectItem value="compliant">Compliant</SelectItem>
                  <SelectItem value="exempt">Exempt</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {assessStatus === "warning_required" && (
              <>
                <div>
                  <Label>Warning Type</Label>
                  <Select
                    value={assessWarningType}
                    onValueChange={setAssessWarningType}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cancer">Cancer</SelectItem>
                      <SelectItem value="reproductive">Reproductive</SelectItem>
                      <SelectItem value="both">
                        Cancer & Reproductive
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Chemicals Present</Label>
                  <div className="max-h-40 overflow-y-auto border rounded-md p-2 mt-1 space-y-1">
                    {PROP65_CHEMICALS.map((c) => (
                      <div key={c.name} className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedChemicals.includes(c.name)}
                          onCheckedChange={() => handleChemicalToggle(c.name)}
                        />
                        <span className="text-sm">{c.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({c.cas_number})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Warning Text</Label>
                  <Textarea
                    value={assessWarningText}
                    onChange={(e) => setAssessWarningText(e.target.value)}
                    rows={4}
                    className="mt-1"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAssessDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveAssessment}>Save Assessment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
