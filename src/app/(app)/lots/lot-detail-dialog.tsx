"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LotStatusBadge } from "@/components/ui/lot-status-badge";
import { ExpiryBadge } from "@/components/ui/expiry-badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDate,
  formatDateTime,
  formatCurrency,
  movementTypeLabel,
} from "@/lib/format";
import { printLotLabel } from "@/lib/barcode";
import { toast } from "sonner";
import { Printer, AlertTriangle } from "lucide-react";
import type { Lot, StockMovement, SerialNumber } from "@/types/database";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: Lot | null;
  onUpdated: () => void;
}

export function LotDetailDialog({ open, onOpenChange, lot, onUpdated }: Props) {
  const { user, tenantId } = useAuth();
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [serials, setSerials] = useState<SerialNumber[]>([]);

  useEffect(() => {
    if (!lot || !tenantId) return;
    const supabase = createClient();

    supabase
      .from("stock_movements")
      .select("*, user:users(full_name)")
      .eq("lot_id", lot.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) =>
        setMovements((data as unknown as StockMovement[]) || []),
      );

    supabase
      .from("serial_numbers")
      .select("*")
      .eq("lot_id", lot.id)
      .order("serial_number")
      .then(({ data }) => setSerials(data || []));
  }, [lot, tenantId]);

  if (!lot) return null;

  const product = lot.product as unknown as {
    name: string;
    sku: string;
  } | null;

  function handlePrintLabel() {
    if (!lot || !product) return;
    const opened = printLotLabel({
      productName: product.name,
      sku: product.sku,
      lotNumber: lot.lot_number,
      expirationDate: lot.expiration_date,
      location: lot.location,
    });
    if (!opened) toast.error("Allow pop-ups to print the item label.");
  }

  async function handleRecall() {
    if (!lot || !tenantId || !user) return;
    const supabase = createClient();

    const { error } = await supabase.rpc("post_lot_disposition", {
      p_request: operationId,
      p_lot: lot.id,
      p_quantity: 0,
      p_kind: "recall",
      p_reason: "Lot recalled",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    setOperationId(crypto.randomUUID());

    toast.success("Lot marked as recalled");
    onUpdated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Lot: {lot.lot_number}
            <LotStatusBadge status={lot.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Product:</span>{" "}
            {product?.name || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">SKU:</span>{" "}
            {product?.sku || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Quantity:</span>{" "}
            {lot.quantity_on_hand}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Expiration:</span>
            {formatDate(lot.expiration_date)}
            <ExpiryBadge date={lot.expiration_date} />
          </div>
          <div>
            <span className="text-muted-foreground">Location:</span>{" "}
            {lot.location || "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Received:</span>{" "}
            {formatDate(lot.received_date)}
          </div>
          <div>
            <span className="text-muted-foreground">Unit Cost:</span>{" "}
            {formatCurrency(lot.cost_at_receipt)}
          </div>
          <div>
            <span className="text-muted-foreground">Notes:</span>{" "}
            {lot.notes || "—"}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handlePrintLabel}>
            <Printer className="h-4 w-4 mr-2" /> Print Label
          </Button>
          {lot.status === "active" && (
            <Button variant="destructive" size="sm" onClick={handleRecall}>
              <AlertTriangle className="h-4 w-4 mr-2" /> Mark Recalled
            </Button>
          )}
        </div>

        <Separator />

        {serials.length > 0 && (
          <>
            <h3 className="font-medium">Serial Numbers ({serials.length})</h3>
            <div className="flex flex-wrap gap-2">
              {serials.map((s) => (
                <Badge
                  key={s.id}
                  variant={s.is_shipped ? "secondary" : "outline"}
                >
                  {s.serial_number} {s.is_shipped && "(shipped)"}
                </Badge>
              ))}
            </div>
            <Separator />
          </>
        )}

        <h3 className="font-medium">Movement History</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Reference</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  No movements recorded.
                </TableCell>
              </TableRow>
            ) : (
              movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">
                    {formatDateTime(m.created_at)}
                  </TableCell>
                  <TableCell>{movementTypeLabel(m.movement_type)}</TableCell>
                  <TableCell
                    className={
                      m.quantity > 0 ? "text-green-600" : "text-red-600"
                    }
                  >
                    {m.quantity > 0 ? "+" : ""}
                    {m.quantity}
                  </TableCell>
                  <TableCell>
                    {(m.user as unknown as { full_name: string })?.full_name ||
                      "—"}
                  </TableCell>
                  <TableCell className="text-xs">{m.reason || "—"}</TableCell>
                  <TableCell className="text-xs">
                    {m.reference_number || "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  );
}
