"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Truck, Plus, Trash2, AlertTriangle, Check } from "lucide-react";
import { pickLotsForQuantity } from "@/lib/fefo";
import { formatDate } from "@/lib/format";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { OrderReservation } from "./order-reservation";
import { ShippingLabel } from "@/components/workspace/shipping-label";
import { PalletLookup } from "./pallet-lookup";
import { PackQuantity } from "@/components/workspace/pack-quantity";
import { PackingReview, type Carton } from "./packing-review";
import { InvoiceButton } from "./invoice-button";
import type { Customer, Product, Lot, SalesOrder } from "@/types/database";

interface OrderLine {
  id?: string;
  openQuantity?: number;
  product_id: string;
  quantity: number;
  unit_price: number;
}

interface ShippedOrder extends SalesOrder {
  customer?: Customer;
  shipments?: { created_at: string; cartons: { id: string; carton_number: string; pallet_code: string | null; tracking_number: string; delivery_status: string | null; contents: string[] }[] }[];
}

interface PickSuggestion {
  product: Product;
  picks: { lot: Lot; pickQuantity: number }[];
  hasExpired: boolean;
  fulfilled: boolean;
  requestedQty: number;
}

export default function ShipPage() {
  const { user, tenantId } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [existingOrders, setExistingOrders] = useState<
    {
      id: string;
      order_number: string;
      customer_id: string;
      lines: {
        id: string;
        product_id: string;
        quantity_ordered: number;
        quantity_shipped: number;
        unit_price: number;
      }[];
    }[]
  >([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [shipDate, setShipDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [notes, setNotes] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [serials, setSerials] = useState<Record<string, string>>({});

  const [pickSuggestions, setPickSuggestions] = useState<PickSuggestion[]>([]);
  const [showPicking, setShowPicking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [buyCartonLabelsLater, setBuyCartonLabelsLater] = useState(false);
  const [cartons, setCartons] = useState<Carton[]>([]);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [recentOrders, setRecentOrders] = useState<
    ShippedOrder[]
  >([]);

  useEffect(() => {
    if (!tenantId) return;
    const supabase = createClient();

    supabase
      .from("customers")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_archived", false)
      .order("name")
      .then(({ data }) => setCustomers(data || []));

    supabase
      .from("products")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_archived", false)
      .order("name")
      .then(({ data }) => setProducts(data || []));

    supabase
      .from("sales_orders")
      .select(
        "id,order_number,customer_id,lines:sales_order_lines(id,product_id,quantity_ordered,quantity_shipped,unit_price)",
      )
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "picking"])
      .order("created_at")
      .then(({ data }) => setExistingOrders(data || []));
    loadRecentOrders();
  }, [tenantId]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("order");
    if (!id) return;
    const order = existingOrders.find((candidate) => candidate.id === id);
    if (!order) return;
    setSelectedOrderId(id);
    setCustomerId(order.customer_id);
    setLines(
      order.lines
        .filter((line) => line.quantity_ordered > (line.quantity_shipped ?? 0))
        .map((line) => ({
          id: line.id,
          openQuantity: line.quantity_ordered - (line.quantity_shipped ?? 0),
          product_id: line.product_id,
          quantity: line.quantity_ordered - (line.quantity_shipped ?? 0),
          unit_price: line.unit_price,
        })),
    );
  }, [existingOrders]);

  async function loadRecentOrders() {
    if (!tenantId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("sales_orders")
      .select("*, customer:customers(id, name), shipments!inner(created_at,cartons:shipment_cartons(id,carton_number,pallet_code,tracking_number,delivery_status,contents))")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20);
    setRecentOrders((data as ShippedOrder[]) || []);
  }

  function addLine() {
    setLines([...lines, { product_id: "", quantity: 1, unit_price: 0 }]);
  }

  function updateLine(
    index: number,
    field: keyof OrderLine,
    value: string | number,
  ) {
    const updated = [...lines];
    (updated[index] as unknown as Record<string, unknown>)[field] = value;
    if (field === "product_id") {
      const prod = products.find((p) => p.id === value);
      if (prod) updated[index].unit_price = prod.price;
    }
    setLines(updated);
  }

  function removeLine(index: number) {
    setLines(lines.filter((_, i) => i !== index));
  }

  const selectedOrder = existingOrders.find(order => order.id === selectedOrderId);
  const allowPartial = !!selectedOrder;
  const isShopify = !!selectedOrder && /^SHOPIFY-\d+$/.test(selectedOrder.order_number);
  const shouldUseSelectedQuantities = (partial: boolean) => partial || (isShopify && selectedOrder.lines.some(line => line.quantity_shipped > 0));
  const hasPartialQuantities = allowPartial && lines.some(line => line.quantity < (line.openQuantity ?? 0));
  const shipmentLines = allowPartial ? lines.filter(line => line.quantity !== 0) : lines;

  async function handlePrepareShipment() {
    if (!customerId) {
      toast.error("Select a customer");
      return;
    }
    if (shipmentLines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    if (shipmentLines.some(line => !line.product_id || !Number.isInteger(line.quantity) || line.quantity <= 0 || (line.openQuantity !== undefined && line.quantity > line.openQuantity))) {
      toast.error("Enter a whole quantity within the open balance for each selected line");
      return;
    }

    if (buyCartonLabelsLater && (!allowPartial || isShopify || !cartons.length || trackingNumber.trim() || cartons.some(carton => carton.tracking.trim()))) {
      toast.error("Clear existing tracking numbers before choosing to buy carton labels later");
      return;
    }
    if (isShopify && shouldUseSelectedQuantities(hasPartialQuantities) && !(trackingNumber.trim() || cartons[0]?.tracking.trim())) {
      toast.error("Enter one tracking number for this Shopify shipment");
      return;
    }
    if (hasPartialQuantities && !cartons.length) {
      toast.error('Scan items into cartons before posting a partial shipment');
      return;
    }

    const supabase = createClient();
    const suggestions: PickSuggestion[] = [];
    if (new Set(shipmentLines.map((line) => line.product_id)).size !== shipmentLines.length) {
      toast.error(
        "Combine duplicate product lines before preparing a shipment",
      );
      return;
    }

    for (const line of shipmentLines) {
      const product = products.find((p) => p.id === line.product_id)!;

      const { data: lots } = await supabase
        .from("lots")
        .select("*")
        .eq("tenant_id", tenantId!)
        .eq("product_id", line.product_id)
        .eq("status", "active")
        .gt("quantity_on_hand", 0)
        .order("expiration_date", { ascending: true, nullsFirst: false });

      let eligibleLots = lots || [];
      if (product.is_serial_tracked) {
        const scanned = (serials[product.id] || "")
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean);
        if (
          scanned.length !== line.quantity ||
          new Set(scanned).size !== scanned.length
        ) {
          toast.error("Scan one unique serial per shipped unit");
          return;
        }
        const { data: available, error: serialError } = await supabase
          .from("serial_numbers")
          .select("lot_id,serial_number")
          .eq("tenant_id", tenantId!)
          .eq("product_id", product.id)
          .eq("is_shipped", false)
          .in("serial_number", scanned);
        if (serialError || available?.length !== scanned.length) {
          toast.error("A scanned serial is unavailable");
          return;
        }
        eligibleLots = eligibleLots
          .map((lot) => ({
            ...lot,
            quantity_on_hand: available.filter(
              (serial) => serial.lot_id === lot.id,
            ).length,
          }))
          .filter((lot) => lot.quantity_on_hand > 0);
      }
      const result = pickLotsForQuantity(eligibleLots, line.quantity, product.stock_rotation ?? "FEFO");
      suggestions.push({
        product,
        picks: result.picks,
        hasExpired: result.hasExpired,
        fulfilled: result.fulfilled,
        requestedQty: line.quantity,
      });
    }

    setPickSuggestions(suggestions);
    setShowPicking(true);
  }

  async function handleConfirmShipment() {
    if (!tenantId || !user || processing) return;
    setProcessing(true);
    const supabase = createClient();

    const { data: posted, error } = await supabase.rpc(shouldUseSelectedQuantities(hasPartialQuantities) ? "ship_order_quantities" : "ship_inventory", {
      p_request_id: requestId,
      p_shipment: {
        order_id: selectedOrderId || null,
        customer_id: customerId,
        ship_date: shipDate,
        notes,
        tracking_number: buyCartonLabelsLater ? "" : trackingNumber.trim() || cartons[0]?.tracking.trim() || "",
        ...(cartons.length ? { cartons: cartons.map(({ number, tracking, scans, palletCode }) => ({ number, pallet_code: palletCode, tracking: buyCartonLabelsLater ? "" : tracking, scans, carrier_label_pending: buyCartonLabelsLater })) } : {}),
        lines: shipmentLines,
        ...(shouldUseSelectedQuantities(hasPartialQuantities) ? {
          order_quantities: Object.fromEntries(shipmentLines.map(line => [line.id, line.quantity])),
        } : {}),
        serial_numbers: Object.fromEntries(
          Object.entries(serials).map(([id, value]) => [
            id,
            value
              .split(/\r?\n/)
              .map((serial) => serial.trim())
              .filter(Boolean),
          ]),
        ),
      },
    });
    if (error) {
      toast.error(error.message);
      setProcessing(false);
      return;
    }
    const orderNum = posted.order_number;
    setRequestId(crypto.randomUUID());
    setCartons([]);
    setBuyCartonLabelsLater(false);

    toast.success(posted.has_backorder ? `Shipment ${orderNum} posted. Remaining units are open.` : `Shipment ${orderNum} created successfully`);
    setShowPicking(false);
    setLines([]);
    setCustomerId("");
    setSelectedOrderId("");
    setExistingOrders((previous) =>
      previous.flatMap(order => {
        if (order.id !== selectedOrderId) return [order];
        if (!posted.has_backorder) return [];
        return [{ ...order, lines: order.lines.map(line => ({
          ...line,
          quantity_shipped: (line.quantity_shipped ?? 0) + (shipmentLines.find(shipped => shipped.id === line.id)?.quantity ?? 0),
        })) }];
      }),
    );
    setNotes("");
    setTrackingNumber("");
    setSerials({});
    setPickSuggestions([]);
    setProcessing(false);
    loadRecentOrders();
  }

  const packingDemand = new Map<string, number>();
  for (const line of lines) {
    const sku = products.find(product => product.id === line.product_id)?.sku.toLowerCase();
    if (sku && line.quantity > 0) packingDemand.set(sku, (packingDemand.get(sku) ?? 0) + line.quantity);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        product="shipping" title="Ship Order"
        description="Create shipments using each product’s stock rotation policy"
        actions={<Link href="/delivery-exceptions" className="text-sm font-semibold text-primary underline">Delivery Exceptions</Link>}
      />

      <div className="space-y-2">
        <Label htmlFor="existing-order">Fulfill an existing order</Label>
        <select
          id="existing-order"
          className="w-full rounded border p-2"
          value={selectedOrderId}
          onChange={(event) => {
            const id = event.target.value;
            setSelectedOrderId(id);
            setCartons([]);
            setBuyCartonLabelsLater(false);
            setSerials({});
            const order = existingOrders.find(
              (candidate) => candidate.id === id,
            );
            setCustomerId(order?.customer_id || "");
            setLines(
              order
                ? order.lines
                    .filter(
                      (line) => line.quantity_ordered > (line.quantity_shipped ?? 0),
                    )
                    .map((line) => ({
                      id: line.id,
                      openQuantity: line.quantity_ordered - (line.quantity_shipped ?? 0),
                      product_id: line.product_id,
                      quantity: line.quantity_ordered - (line.quantity_shipped ?? 0),
                                    unit_price: line.unit_price,
                    }))
                : [],
            );
            setShowPicking(false);
          }}
        >
          <option value="">Create a new manual shipment</option>
          {existingOrders.map((order) => (
            <option key={order.id} value={order.id}>
              {order.order_number}
            </option>
          ))}
        </select>
        {selectedOrderId && <OrderReservation key={selectedOrderId} orderId={selectedOrderId} />}
        {selectedOrderId && (
          <p className="text-sm text-muted-foreground">
            {allowPartial
              ? 'Enter what goes out today. Enter zero to leave a line open. Remaining units stay on the order for the next shipment.'
              : ''}
            {isShopify && ' Use one unique tracking number for each partial shipment.'}
          </p>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" /> New Shipment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select
                value={customerId}
                disabled={!!selectedOrderId}
                onValueChange={setCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Ship Date</Label>
              <Input
                type="date"
                value={shipDate}
                onChange={(e) => setShipDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tracking Number</Label>
              <Input
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line Items</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={addLine}
                disabled={!!selectedOrderId}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Item
              </Button>
            </div>

            {lines.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-28">Quantity</TableHead>
                    <TableHead className="w-32">Unit Price</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Select
                          value={line.product_id}
                          disabled={!!selectedOrderId}
                          onValueChange={(v) => updateLine(i, "product_id", v)}
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
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={allowPartial ? 0 : 1}
                          max={line.openQuantity}
                          aria-label={`Ship quantity for line ${i + 1}`}
                          value={line.quantity}
                          disabled={!!selectedOrderId && !allowPartial}
                          onChange={(e) =>
                            updateLine(
                              i,
                              "quantity",
                              Number(e.target.value),
                            )
                          }
                        />
                        {tenantId && line.product_id && !processing && <PackQuantity
                          key={line.product_id} tenantId={tenantId} productId={line.product_id}
                          usage="ship" max={line.openQuantity} onApply={quantity => updateLine(i, "quantity", quantity)} />}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={line.unit_price}
                          disabled={!!selectedOrderId}
                          onChange={(e) =>
                            updateLine(
                              i,
                              "unit_price",
                              parseFloat(e.target.value) || 0,
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!!selectedOrderId}
                          onClick={() => removeLine(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {lines
            .filter(
              (line, index, all) =>
                all.findIndex(
                  (candidate) => candidate.product_id === line.product_id,
                ) === index &&
                products.find((product) => product.id === line.product_id)
                  ?.is_serial_tracked,
            )
            .map((line) => (
              <div key={line.product_id} className="space-y-2">
                <Label htmlFor={`serials-${line.product_id}`}>
                  Scan serials:{" "}
                  {
                    products.find((product) => product.id === line.product_id)
                      ?.name
                  }
                </Label>
                <textarea
                  id={`serials-${line.product_id}`}
                  className="min-h-24 w-full rounded border p-3 font-mono text-sm"
                  value={serials[line.product_id] || ""}
                  onChange={(event) =>
                    setSerials((previous) => ({
                      ...previous,
                      [line.product_id]: event.target.value,
                    }))
                  }
                  placeholder="Scan one serial number per line"
                />
                <p className="text-xs text-muted-foreground">
                  One unique physical serial per unit. Only scanned serials will
                  ship; unavailable or duplicate serials are rejected.
                </p>
              </div>
            ))}

          {allowPartial && !isShopify && cartons.length > 0 && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={buyCartonLabelsLater} onChange={event => setBuyCartonLabelsLater(event.target.checked)} />
              Post the packed stock, then buy each carton’s label from Recent Shipments. Hand off the cartons after labeling.
            </label>
          )}
          <PackingReview key={selectedOrderId} demand={packingDemand} cartons={cartons}
            setCartons={setCartons} tracking={trackingNumber} disabled={processing} />

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handlePrepareShipment}
              disabled={shipmentLines.length === 0}
            >
              Prepare Shipment
            </Button>
          </div>
        </CardContent>
      </Card>

      {tenantId && <PalletLookup tenantId={tenantId} />}

      {/* Recent Shipments */}
      {recentOrders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Shipments</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Ship Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cartons and documents</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono">
                      {order.order_number}
                    </TableCell>
                    <TableCell>{order.customer?.name || "—"}</TableCell>
                    <TableCell>{formatDate(order.shipments?.map(shipment => shipment.created_at).sort().at(-1) ?? order.ship_date)}</TableCell>
                    <TableCell>
                      <Badge variant={order.status === "shipped" ? "default" : "secondary"}>{order.status === "shipped" ? "Shipped" : "Partially shipped"}</Badge>
                    </TableCell>
                    <TableCell>
                      {!!order.shipments?.some(shipment => shipment.cartons.length) && (
                        <details className="mb-1 text-sm">
                          <summary className="cursor-pointer">Cartons</summary>
                          <ul className="space-y-1">
                            {order.shipments.flatMap(shipment => shipment.cartons).map(carton => (
                              <li key={carton.id} className="break-words">
                                {carton.carton_number}{carton.pallet_code ? ` · Pallet ${carton.pallet_code}` : ""} · {carton.contents.length} items · {carton.tracking_number || "Label pending"}{carton.delivery_status ? ` · ${carton.delivery_status.replaceAll("_", " ")}` : ""}
                                {!/^SHOPIFY-\d+$/.test(order.order_number) && <ShippingLabel
                                  orderId={order.id} cartonId={carton.id}
                                  canPurchase={!carton.tracking_number} onPurchased={loadRecentOrders}
                                />}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                      <Link className="mb-1 block text-sm underline" href={`/warehouse-followups?order=${order.id}`}>Customer follow-up</Link>
                      {order.status === "shipped" && <InvoiceButton
                        orderId={order.id}
                        tenantId={order.tenant_id}
                      />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={showPicking} onOpenChange={setShowPicking}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pick Suggestions</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {pickSuggestions.map((suggestion, i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">
                      {suggestion.product.name} ({suggestion.product.sku})
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Need: {suggestion.requestedQty}
                      </span>
                      {suggestion.fulfilled ? (
                        <Badge variant="default">
                          <Check className="h-3 w-3 mr-1" /> Fulfilled
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Insufficient Stock</Badge>
                      )}
                    </div>
                  </div>

                  {suggestion.hasExpired && (
                    <div className="flex items-center gap-2 text-amber-600 text-sm">
                      <AlertTriangle className="h-4 w-4" />
                      Some lots are expired and were skipped
                    </div>
                  )}

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lot #</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Available</TableHead>
                        <TableHead>Pick Qty</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suggestion.picks.map((pick, j) => (
                        <TableRow key={j}>
                          <TableCell className="font-mono">
                            {pick.lot.lot_number}
                          </TableCell>
                          <TableCell>{pick.lot.location || "—"}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {formatDate(pick.lot.expiration_date)}
                              <ExpiryBadge date={pick.lot.expiration_date} />
                            </div>
                          </TableCell>
                          <TableCell>{pick.lot.quantity_on_hand}</TableCell>
                          <TableCell className="font-bold">
                            {pick.pickQuantity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowPicking(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmShipment}
              disabled={processing || pickSuggestions.some((s) => !s.fulfilled)}
            >
              {processing ? "Processing..." : "Confirm & Ship"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
