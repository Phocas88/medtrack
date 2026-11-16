"use client";

import { generateBarcodeSVG } from "@/lib/barcode";
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
import { Separator } from "@/components/ui/separator";
import {
  ScanLine,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Printer,
  Package,
  Info,
  Hash,
} from "lucide-react";
import { toast } from "sonner";

// --- GS1 utilities ---
function detectBarcodeType(barcode: string): string {
  const cleaned = barcode.replace(/\s/g, "");
  if (!/^\d+$/.test(cleaned)) return "Invalid";
  if (cleaned.length === 12) return "UPC-A";
  if (cleaned.length === 13) return "EAN-13";
  if (cleaned.length === 14) return "GTIN-14";
  if (cleaned.length === 8) return "EAN-8";
  return "Invalid";
}

function calculateCheckDigit(barcode: string): number {
  const digits = barcode.replace(/\s/g, "").split("").map(Number);
  // Remove the last digit (check digit position) if full-length
  const withoutCheck = digits.slice(0, -1);
  let sum = 0;
  for (let i = 0; i < withoutCheck.length; i++) {
    const weight = (withoutCheck.length - i) % 2 === 0 ? 1 : 3;
    sum += withoutCheck[i] * weight;
  }
  return (10 - (sum % 10)) % 10;
}

function validateBarcode(barcode: string): {
  valid: boolean;
  issues: string[];
} {
  const cleaned = barcode.replace(/\s/g, "");
  const issues: string[] = [];

  if (!cleaned) {
    return { valid: false, issues: ["No barcode provided"] };
  }

  if (!/^\d+$/.test(cleaned)) {
    issues.push("Contains non-numeric characters");
    return { valid: false, issues };
  }

  const type = detectBarcodeType(cleaned);
  if (type === "Invalid") {
    issues.push(
      `Invalid length (${cleaned.length} digits). Expected 8, 12, 13, or 14`,
    );
    return { valid: false, issues };
  }

  const expectedCheck = calculateCheckDigit(cleaned);
  const actualCheck = parseInt(cleaned[cleaned.length - 1]);
  if (expectedCheck !== actualCheck) {
    issues.push(
      `Invalid check digit: expected ${expectedCheck}, got ${actualCheck}`,
    );
    return { valid: false, issues };
  }

  return { valid: true, issues: [] };
}

function parseBarcode(barcode: string): {
  type: string;
  companyPrefix: string;
  itemReference: string;
  checkDigit: string;
  indicator?: string;
} {
  const cleaned = barcode.replace(/\s/g, "");
  const type = detectBarcodeType(cleaned);

  if (type === "UPC-A") {
    return {
      type,
      companyPrefix: cleaned.substring(0, 6),
      itemReference: cleaned.substring(6, 11),
      checkDigit: cleaned.substring(11),
    };
  }
  if (type === "EAN-13") {
    return {
      type,
      companyPrefix: cleaned.substring(0, 7),
      itemReference: cleaned.substring(7, 12),
      checkDigit: cleaned.substring(12),
    };
  }
  if (type === "GTIN-14") {
    return {
      type,
      indicator: cleaned.substring(0, 1),
      companyPrefix: cleaned.substring(1, 8),
      itemReference: cleaned.substring(8, 13),
      checkDigit: cleaned.substring(13),
    };
  }
  return {
    type,
    companyPrefix: "",
    itemReference: "",
    checkDigit: "",
  };
}

// --- Types ---
interface ProductUOM {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  uom_name: string;
  barcode: string | null;
  barcode_type: string;
  valid: boolean;
  issues: string[];
}

interface LotOption {
  id: string;
  lot_number: string;
  expiration_date: string | null;
}

export default function GS1CompliancePage() {
  const { tenantId } = useAuth();
  const [auditData, setAuditData] = useState<ProductUOM[]>([]);
  const [loading, setLoading] = useState(true);

  // Validator
  const [validatorInput, setValidatorInput] = useState("");
  const [validatorResult, setValidatorResult] = useState<{
    type: string;
    valid: boolean;
    issues: string[];
    parsed: ReturnType<typeof parseBarcode>;
    fixedCheckDigit: number | null;
  } | null>(null);

  // Label generator
  const [labelProductId, setLabelProductId] = useState("");
  const [labelUomId, setLabelUomId] = useState("");
  const [labelLotId, setLabelLotId] = useState("");
  const [lots, setLots] = useState<LotOption[]>([]);
  const [batchLabelItems, setBatchLabelItems] = useState<Set<string>>(
    new Set(),
  );

  const loadAuditData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const supabase = createClient();

    // Fetch products + their UOM conversions with barcodes
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku")
      .eq("tenant_id", tenantId)
      .order("name");

    const { data: uomData } = await supabase
      .from("product_uom_conversions")
      .select("id, product_id, uom_name, barcode")
      .eq("tenant_id", tenantId);

    const productMap = new Map((products || []).map((p) => [p.id, p]));
    const items: ProductUOM[] = [];

    // Add base products (check if they have a barcode via UOM or not)
    const productsWithUOM = new Set((uomData || []).map((u) => u.product_id));

    for (const p of products || []) {
      if (!productsWithUOM.has(p.id)) {
        items.push({
          id: p.id,
          product_id: p.id,
          product_name: p.name,
          product_sku: p.sku,
          uom_name: "Each",
          barcode: null,
          barcode_type: "\u2014",
          valid: false,
          issues: ["No barcode assigned"],
        });
      }
    }

    for (const uom of uomData || []) {
      const product = productMap.get(uom.product_id);
      if (!product) continue;

      if (!uom.barcode) {
        items.push({
          id: uom.id,
          product_id: uom.product_id,
          product_name: product.name,
          product_sku: product.sku,
          uom_name: uom.uom_name,
          barcode: null,
          barcode_type: "\u2014",
          valid: false,
          issues: ["No barcode assigned"],
        });
      } else {
        const barcodeType = detectBarcodeType(uom.barcode);
        const validation = validateBarcode(uom.barcode);
        items.push({
          id: uom.id,
          product_id: uom.product_id,
          product_name: product.name,
          product_sku: product.sku,
          uom_name: uom.uom_name,
          barcode: uom.barcode,
          barcode_type: barcodeType,
          valid: validation.valid,
          issues: validation.issues,
        });
      }
    }

    // Check for duplicate barcodes
    const barcodeCounts = new Map<string, number>();
    for (const item of items) {
      if (item.barcode) {
        barcodeCounts.set(
          item.barcode,
          (barcodeCounts.get(item.barcode) || 0) + 1,
        );
      }
    }
    for (const item of items) {
      if (item.barcode && (barcodeCounts.get(item.barcode) || 0) > 1) {
        item.issues.push("Duplicate barcode");
        item.valid = false;
      }
    }

    setAuditData(items);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    loadAuditData();
  }, [loadAuditData]);

  const stats = {
    total: auditData.length,
    withBarcodes: auditData.filter((i) => i.barcode).length,
    validBarcodes: auditData.filter((i) => i.valid).length,
    issues: auditData.filter((i) => i.issues.length > 0).length,
  };

  const handleValidate = () => {
    if (!validatorInput.trim()) {
      toast.error("Enter a barcode to validate");
      return;
    }
    const cleaned = validatorInput.replace(/\s/g, "");
    const type = detectBarcodeType(cleaned);
    const validation = validateBarcode(cleaned);
    const parsed = parseBarcode(cleaned);
    const needsFix =
      !validation.valid &&
      /^\d+$/.test(cleaned) &&
      [8, 12, 13, 14].includes(cleaned.length);
    const fixedCheckDigit = needsFix ? calculateCheckDigit(cleaned) : null;

    setValidatorResult({
      type,
      valid: validation.valid,
      issues: validation.issues,
      parsed,
      fixedCheckDigit,
    });
  };

  const fixCheckDigit = () => {
    if (!validatorResult || validatorResult.fixedCheckDigit === null) return;
    const cleaned = validatorInput.replace(/\s/g, "");
    const fixed = cleaned.slice(0, -1) + validatorResult.fixedCheckDigit;
    setValidatorInput(fixed);
    // Re-validate
    const type = detectBarcodeType(fixed);
    const validation = validateBarcode(fixed);
    const parsed = parseBarcode(fixed);
    setValidatorResult({
      type,
      valid: validation.valid,
      issues: validation.issues,
      parsed,
      fixedCheckDigit: null,
    });
    toast.success("Check digit corrected");
  };

  // Load lots when product is selected for label
  useEffect(() => {
    if (!labelProductId || !tenantId) {
      setLots([]);
      return;
    }
    const loadLots = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("lots")
        .select("id, lot_number, expiration_date")
        .eq("tenant_id", tenantId)
        .eq("product_id", labelProductId)
        .order("lot_number");
      setLots(data || []);
    };
    loadLots();
  }, [labelProductId, tenantId]);

  const selectedLot = lots.find((l) => l.id === labelLotId);

  const printLabel = (item: ProductUOM, lot?: LotOption | null) => {
    if (!item.barcode) {
      toast.error("No barcode to print");
      return;
    }
    let barcodeSvg: string;
    try {
      barcodeSvg = generateBarcodeSVG(item.barcode, {
        format:
          item.barcode_type === "UPC-A"
            ? "UPC"
            : item.barcode_type === "EAN-13"
              ? "EAN13"
              : item.barcode_type === "EAN-8"
                ? "EAN8"
                : "CODE128",
        height: 60,
      });
    } catch {
      toast.error("The barcode is invalid for its selected format");
      return;
    }
    const w = window.open("", "_blank", "width=500,height=400");
    if (!w) return;
    w.document.write(`
      <html>
      <head>
        <title>Barcode Label - ${escapeHtml(item.product_name)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
          .label { display: inline-block; border: 1px solid #ccc; padding: 15px 25px; }
          .product-name { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
          .product-info { font-size: 11px; color: #666; margin-bottom: 10px; }
          svg { display: block; margin: 10px auto; }
          .lot-info { font-size: 10px; color: #999; margin-top: 5px; }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="product-name">${escapeHtml(item.product_name)}</div>
          <div class="product-info">SKU: ${escapeHtml(item.product_sku)} | UOM: ${escapeHtml(item.uom_name)}</div>
          ${barcodeSvg}
          ${lot ? `<div class="lot-info">Lot: ${escapeHtml(lot.lot_number)}${lot.expiration_date ? ` | Exp: ${escapeHtml(lot.expiration_date)}` : ""}</div>` : ""}
        </div>
        <script>setTimeout(function(){window.print();},500);</script>
      </body></html>
    `);
    w.document.close();
  };

  const printBatchLabels = () => {
    const items = auditData.filter(
      (d) => batchLabelItems.has(d.id) && d.barcode,
    );
    if (items.length === 0) {
      toast.error("No products with barcodes selected");
      return;
    }
    const barcodes = new Map<string, string>();
    try {
      for (const item of items)
        barcodes.set(
          item.id,
          generateBarcodeSVG(item.barcode!, {
            format:
              item.barcode_type === "UPC-A"
                ? "UPC"
                : item.barcode_type === "EAN-13"
                  ? "EAN13"
                  : item.barcode_type === "EAN-8"
                    ? "EAN8"
                    : "CODE128",
            height: 60,
          }),
        );
    } catch {
      toast.error("A selected barcode is invalid for its format");
      return;
    }
    const w = window.open("", "_blank", "width=500,height=800");
    if (!w) return;

    const labelsHtml = items
      .map(
        (item) => `
      <div class="label" style="page-break-after: always;">
        <div class="product-name">${escapeHtml(item.product_name)}</div>
        <div class="product-info">SKU: ${escapeHtml(item.product_sku)} | UOM: ${escapeHtml(item.uom_name)}</div>
        ${barcodes.get(item.id)}
      </div>`,
      )
      .join("");

    w.document.write(`
      <html>
      <head>
        <title>Barcode Labels</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
          .label { display: inline-block; border: 1px solid #ccc; padding: 15px 25px; margin: 10px; }
          .product-name { font-weight: bold; font-size: 14px; margin-bottom: 5px; }
          .product-info { font-size: 11px; color: #666; margin-bottom: 10px; }
          svg { display: block; margin: 10px auto; }
          @media print { .label { page-break-after: always; } }
        </style>
      </head>
      <body>${labelsHtml}
      <script>setTimeout(function(){window.print();},500);</script>
      </body></html>
    `);
    w.document.close();
  };

  const uniqueProducts = Array.from(
    new Map(
      auditData.map((d) => [
        d.product_id,
        { id: d.product_id, name: d.product_name, sku: d.product_sku },
      ]),
    ).values(),
  );

  const productUoms = auditData.filter((d) => d.product_id === labelProductId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="GS1 Compliance"
        description="Barcode standards audit, validation, and label generation"
      />

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Barcode Audit</TabsTrigger>
          <TabsTrigger value="validator">GS1 Validator</TabsTrigger>
          <TabsTrigger value="labels">Label Generator</TabsTrigger>
          <TabsTrigger value="reference">Standards Reference</TabsTrigger>
        </TabsList>

        {/* Barcode Audit Tab */}
        <TabsContent value="audit" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Total Products"
              value={stats.total}
              icon={Package}
            />
            <StatCard
              title="With Barcodes"
              value={
                stats.total > 0
                  ? `${Math.round((stats.withBarcodes / stats.total) * 100)}%`
                  : "0%"
              }
              icon={ScanLine}
              description={`${stats.withBarcodes} of ${stats.total}`}
            />
            <StatCard
              title="Valid Barcodes"
              value={
                stats.withBarcodes > 0
                  ? `${Math.round((stats.validBarcodes / stats.withBarcodes) * 100)}%`
                  : "0%"
              }
              icon={CheckCircle}
              description={`${stats.validBarcodes} of ${stats.withBarcodes}`}
            />
            <StatCard
              title="Issues Found"
              value={stats.issues}
              icon={AlertTriangle}
            />
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Valid</TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Loading barcode data...
                      </TableCell>
                    </TableRow>
                  ) : auditData.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-muted-foreground"
                      >
                        No product/UOM data found
                      </TableCell>
                    </TableRow>
                  ) : (
                    auditData.map((item) => (
                      <TableRow
                        key={item.id}
                        className={
                          item.issues.length > 0 ? "bg-destructive/5" : ""
                        }
                      >
                        <TableCell className="font-medium">
                          {item.product_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.product_sku}
                        </TableCell>
                        <TableCell>{item.uom_name}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.barcode || "\u2014"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.barcode_type === "Invalid"
                                ? "destructive"
                                : "outline"
                            }
                          >
                            {item.barcode_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.valid ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          {item.issues.map((issue, i) => (
                            <p key={i} className="text-xs text-destructive">
                              {issue}
                            </p>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GS1 Validator Tab */}
        <TabsContent value="validator" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Barcode Validator</CardTitle>
              <CardDescription>
                Enter a barcode number to validate its format and check digit
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3 max-w-lg">
                <Input
                  placeholder="Enter barcode number..."
                  value={validatorInput}
                  onChange={(e) => setValidatorInput(e.target.value)}
                  className="font-mono"
                  onKeyDown={(e) => e.key === "Enter" && handleValidate()}
                />
                <Button onClick={handleValidate}>
                  <ScanLine className="mr-2 h-4 w-4" />
                  Validate
                </Button>
              </div>

              {validatorResult && (
                <Card
                  className={
                    validatorResult.valid
                      ? "border-green-300 bg-green-50 dark:bg-green-950/20"
                      : "border-red-300 bg-red-50 dark:bg-red-950/20"
                  }
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {validatorResult.valid ? (
                        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                      )}
                      <div className="space-y-3 flex-1">
                        <p
                          className={`font-medium ${validatorResult.valid ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}
                        >
                          {validatorResult.valid
                            ? "Valid Barcode"
                            : "Invalid Barcode"}
                        </p>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Type</p>
                            <p className="font-medium">
                              {validatorResult.parsed.type}
                            </p>
                          </div>
                          {validatorResult.parsed.indicator && (
                            <div>
                              <p className="text-muted-foreground">Indicator</p>
                              <p className="font-mono">
                                {validatorResult.parsed.indicator}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-muted-foreground">
                              Company Prefix
                            </p>
                            <p className="font-mono">
                              {validatorResult.parsed.companyPrefix || "\u2014"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">
                              Item Reference
                            </p>
                            <p className="font-mono">
                              {validatorResult.parsed.itemReference || "\u2014"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Check Digit</p>
                            <p className="font-mono">
                              {validatorResult.parsed.checkDigit || "\u2014"}
                            </p>
                          </div>
                        </div>

                        {validatorResult.issues.length > 0 && (
                          <div>
                            {validatorResult.issues.map((issue, i) => (
                              <p key={i} className="text-sm text-red-600">
                                {issue}
                              </p>
                            ))}
                          </div>
                        )}

                        {validatorResult.fixedCheckDigit !== null && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={fixCheckDigit}
                          >
                            Fix Check Digit (change to{" "}
                            {validatorResult.fixedCheckDigit})
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Label Generator Tab */}
        <TabsContent value="labels" className="space-y-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Single Label</CardTitle>
                <CardDescription>
                  Generate a barcode label for a specific product and UOM
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Product</Label>
                  <Select
                    value={labelProductId}
                    onValueChange={(v) => {
                      setLabelProductId(v);
                      setLabelUomId("");
                      setLabelLotId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product..." />
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueProducts.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {labelProductId && productUoms.length > 0 && (
                  <div>
                    <Label>UOM</Label>
                    <Select value={labelUomId} onValueChange={setLabelUomId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select UOM..." />
                      </SelectTrigger>
                      <SelectContent>
                        {productUoms.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.uom_name}{" "}
                            {u.barcode ? `(${u.barcode})` : "(no barcode)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {labelProductId && lots.length > 0 && (
                  <div>
                    <Label>Lot (optional)</Label>
                    <Select value={labelLotId} onValueChange={setLabelLotId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select lot..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No lot</SelectItem>
                        {lots.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.lot_number}{" "}
                            {l.expiration_date
                              ? `(Exp: ${l.expiration_date})`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {labelUomId && (
                  <Button
                    onClick={() => {
                      const item = auditData.find((d) => d.id === labelUomId);
                      if (item)
                        printLabel(
                          item,
                          labelLotId !== "none" ? selectedLot : null,
                        );
                    }}
                    disabled={
                      !auditData.find((d) => d.id === labelUomId)?.barcode
                    }
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Print Label
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Batch Print</CardTitle>
                <CardDescription>
                  Select multiple products to print barcode labels
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {auditData
                    .filter((d) => d.barcode)
                    .map((d) => (
                      <div key={d.id} className="flex items-center gap-2">
                        <Checkbox
                          checked={batchLabelItems.has(d.id)}
                          onCheckedChange={() => {
                            setBatchLabelItems((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.id)) next.delete(d.id);
                              else next.add(d.id);
                              return next;
                            });
                          }}
                        />
                        <span className="text-sm">
                          {d.product_name}{" "}
                          <span className="text-muted-foreground">
                            ({d.uom_name} - {d.barcode})
                          </span>
                        </span>
                      </div>
                    ))}
                  {auditData.filter((d) => d.barcode).length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No products with barcodes found
                    </p>
                  )}
                </div>
                <Button
                  onClick={printBatchLabels}
                  disabled={batchLabelItems.size === 0}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Print {batchLabelItems.size} Labels
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Standards Reference Tab */}
        <TabsContent value="reference" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  UPC-A
                </CardTitle>
                <CardDescription>12-digit barcode</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The Universal Product Code (UPC-A) is the standard barcode for
                  retail items in the United States and Canada. It consists of
                  12 numeric digits.
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Format:</p>
                  <p>N XXXXX YYYYY C</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    N = Number system | X = Company prefix | Y = Item ref | C =
                    Check digit
                  </p>
                </div>
                <Badge>Retail - US/Canada</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  EAN-13
                </CardTitle>
                <CardDescription>13-digit barcode</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The European Article Number (EAN-13) is the international
                  standard for retail barcodes. It encodes 13 digits and is used
                  worldwide, including a country prefix.
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Format:</p>
                  <p>CC XXXXX YYYYY C</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    CC = Country | X = Company prefix | Y = Item ref | C = Check
                    digit
                  </p>
                </div>
                <Badge>International Retail</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  GTIN-14
                </CardTitle>
                <CardDescription>14-digit barcode</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  The Global Trade Item Number (GTIN-14) is used for case and
                  carton level identification. The first digit is a packaging
                  indicator (1-8 for different packaging levels, 9 for variable
                  measure).
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  <p className="text-xs text-muted-foreground mb-1">Format:</p>
                  <p>I CC XXXXX YYYYY C</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    I = Indicator | Rest = EAN-13 structure
                  </p>
                </div>
                <Badge>Case/Carton Level</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  GS1-128
                </CardTitle>
                <CardDescription>Variable-length barcode</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  GS1-128 (formerly UCC/EAN-128) is used on shipping labels and
                  can encode multiple data elements using Application
                  Identifiers (AIs) such as lot number, expiry date, serial
                  number, and weight.
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  <p className="text-xs text-muted-foreground mb-1">
                    Common AIs:
                  </p>
                  <p>(01) GTIN &bull; (10) Lot &bull; (17) Expiry</p>
                  <p>(21) Serial &bull; (310n) Weight</p>
                </div>
                <Badge>Shipping Labels</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  GS1 DataMatrix
                </CardTitle>
                <CardDescription>2D barcode</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  GS1 DataMatrix is a 2D barcode widely used in healthcare for
                  marking small items like surgical instruments, implants, and
                  pharmaceutical unit doses. Encodes the same AIs as GS1-128.
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  <p className="text-xs text-muted-foreground mb-1">
                    Key Use Cases:
                  </p>
                  <p>Unit-dose medications</p>
                  <p>Surgical instruments (UDI)</p>
                  <p>Small medical devices</p>
                </div>
                <Badge>Healthcare / Small Items</Badge>
              </CardContent>
            </Card>

            <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-600" />
                  When to Use What
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>Individual retail items:</strong> UPC-A (US) or EAN-13
                  (international)
                </p>
                <p>
                  <strong>Inner packs / cases:</strong> GTIN-14 with packaging
                  indicator
                </p>
                <p>
                  <strong>Shipping cartons:</strong> GS1-128 with lot, expiry,
                  GTIN
                </p>
                <p>
                  <strong>Small healthcare items:</strong> GS1 DataMatrix
                </p>
                <p>
                  <strong>FDA UDI compliance:</strong> GS1-128 or DataMatrix
                  with (01)(17)(10)(21)
                </p>
                <Separator className="my-3" />
                <p>
                  For more information, visit{" "}
                  <a
                    href="https://www.gs1.org/standards/barcodes"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium text-blue-600 dark:text-blue-400"
                  >
                    gs1.org/standards/barcodes
                  </a>
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
