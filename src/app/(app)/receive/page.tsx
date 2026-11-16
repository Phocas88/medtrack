"use client";

import { escapeHtml } from "@/lib/html";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { PackagePlus, Printer, ScanBarcode } from "lucide-react";
import {
  generateBarcodeSVG,
  buildLotLabelContent,
  printLabel,
} from "@/lib/barcode";
import { BarcodeScanner } from "@/components/barcode-scanner";
import type { Product, Supplier } from "@/types/database";

const schema = z.object({
  product_id: z.string().min(1, "Product is required"),
  lot_number: z.string().min(1, "Lot number is required"),
  expiration_date: z.string().optional(),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  supplier_id: z.string().optional(),
  cost_at_receipt: z.coerce.number().min(0),
  location: z.string().optional(),
  notes: z.string().optional(),
  serial_numbers: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function ReceivePage() {
  const { user, tenantId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [lastReceived, setLastReceived] = useState<{
    productName: string;
    lotNumber: string;
    sku: string;
    expDate: string | null;
    location: string | null;
  } | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      product_id: "",
      lot_number: "",
      expiration_date: "",
      quantity: 1,
      supplier_id: "",
      cost_at_receipt: 0,
      location: "",
      notes: "",
      serial_numbers: "",
    },
  });

  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();

    supabase
      .from("products")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_archived", false)
      .order("name")
      .then(({ data }) => setProducts(data || []));

    supabase
      .from("suppliers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_archived", false)
      .order("name")
      .then(({ data }) => setSuppliers(data || []));
  }, [tenantId]);

  // Auto-fill cost when product changes
  const selectedProductId = form.watch("product_id");
  useEffect(() => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (prod) {
      form.setValue("cost_at_receipt", prod.cost);
      if (prod.supplier_id) {
        form.setValue("supplier_id", prod.supplier_id);
      }
    }
  }, [selectedProductId, products]);

  async function onSubmit(data: FormData) {
    if (!tenantId || !user) return;
    setSaving(true);
    const supabase = createClient();
    const product = products.find((p) => p.id === data.product_id);

    const { error } = await supabase.rpc("receive_inventory", {
      p_request_id: requestId,
      p_receipt: {
        ...data,
        supplier_id: data.supplier_id === "none" ? null : data.supplier_id,
        serial_numbers: (data.serial_numbers || "")
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      },
    });
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    setRequestId(crypto.randomUUID());

    setLastReceived({
      productName: product?.name || "",
      lotNumber: data.lot_number,
      sku: product?.sku || "",
      expDate: data.expiration_date || null,
      location: data.location || null,
    });

    toast.success(`Received ${data.quantity} units of ${product?.name}`);
    form.reset();
    setSaving(false);
  }

  function handlePrintLastLabel() {
    if (!lastReceived) return;
    const barcodeContent = buildLotLabelContent({
      productName: lastReceived.productName,
      sku: lastReceived.sku,
      lotNumber: lastReceived.lotNumber,
      expirationDate: lastReceived.expDate,
      location: lastReceived.location,
    });
    const barcodeSvg = generateBarcodeSVG(barcodeContent);
    const html = `
      <div class="label">
        <div class="product-name">${escapeHtml(lastReceived.productName)}</div>
        <div class="detail">SKU: ${escapeHtml(lastReceived.sku)}</div>
        <div class="detail">LOT: ${escapeHtml(lastReceived.lotNumber)}</div>
        ${lastReceived.expDate ? `<div class="detail">EXP: ${escapeHtml(lastReceived.expDate)}</div>` : ""}
        ${lastReceived.location ? `<div class="detail">BIN: ${escapeHtml(lastReceived.location)}</div>` : ""}
        <div class="barcode">${barcodeSvg}</div>
      </div>
    `;
    printLabel(html);
  }

  function handleBarcodeScan(value: string) {
    // Try to parse scanned barcode — could be SKU, lot number, or encoded label
    const parts = value.split("|");
    if (parts.length >= 2) {
      // Encoded label: SKU:xxx|LOT:xxx|EXP:xxx
      parts.forEach((part) => {
        const [key, val] = part.split(":");
        if (key === "SKU") {
          const prod = products.find((p) => p.sku === val);
          if (prod) form.setValue("product_id", prod.id);
        }
        if (key === "LOT") form.setValue("lot_number", val);
        if (key === "EXP") form.setValue("expiration_date", val);
      });
    } else {
      // Plain barcode — try matching as SKU first, then lot number
      const prod = products.find((p) => p.sku === value);
      if (prod) {
        form.setValue("product_id", prod.id);
      } else {
        form.setValue("lot_number", value);
      }
    }
    setShowScanner(false);
    toast.info(`Scanned: ${value}`);
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Receive Inventory"
        description="Log incoming inventory with lot tracking"
        actions={
          <Button
            variant="outline"
            onClick={() => setShowScanner(!showScanner)}
          >
            <ScanBarcode className="h-4 w-4 mr-2" /> Scan Barcode
          </Button>
        }
      />

      {showScanner && (
        <Card>
          <CardContent className="p-4">
            <BarcodeScanner
              onScan={handleBarcodeScan}
              onClose={() => setShowScanner(false)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5" /> New Receipt
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Product *</Label>
                <Select
                  value={form.watch("product_id")}
                  onValueChange={(v) => form.setValue("product_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.product_id && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.product_id.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Lot Number *</Label>
                <Input
                  {...form.register("lot_number")}
                  placeholder="e.g., LOT-2024-001"
                />
                {form.formState.errors.lot_number && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.lot_number.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Expiration Date</Label>
                <Input type="date" {...form.register("expiration_date")} />
              </div>

              <div className="space-y-2">
                <Label>Quantity *</Label>
                <Input type="number" {...form.register("quantity")} />
                {form.formState.errors.quantity && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.quantity.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Supplier</Label>
                <Select
                  value={form.watch("supplier_id")}
                  onValueChange={(v) => form.setValue("supplier_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Unit Cost ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("cost_at_receipt")}
                />
              </div>

              <div className="space-y-2">
                <Label>Location / Bin</Label>
                <Input
                  {...form.register("location")}
                  placeholder="e.g., A1-03"
                />
              </div>
            </div>

            {selectedProduct?.is_serial_tracked && (
              <div className="space-y-2">
                <Label>Serial Numbers (one per line)</Label>
                <Textarea
                  {...form.register("serial_numbers")}
                  rows={4}
                  placeholder="Enter each serial number on a new line"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea {...form.register("notes")} rows={2} />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Receiving..." : "Receive Inventory"}
              </Button>
              {lastReceived && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrintLastLabel}
                >
                  <Printer className="h-4 w-4 mr-2" /> Print Last Label
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
