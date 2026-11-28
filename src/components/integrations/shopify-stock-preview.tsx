"use client";

import { useState } from "react";

type Warehouse = {
  warehouse_id: string;
  warehouse_name: string;
  eligible_units: number;
  allocated_demand: number;
  unallocated_demand: number;
};

export function ShopifyStockPreview({ productId }: { productId: string }) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/shopify/inventory?preview=${encodeURIComponent(productId)}`);
      if (!response.ok) throw new Error("Preview request failed");
      const data: { warehouses: Warehouse[] } = await response.json();
      setWarehouses(data.warehouses);
    } catch {
      setWarehouses(undefined);
      setError("Could not load warehouse stock. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="basis-full space-y-2 text-sm">
      <button type="button" disabled={busy} onClick={() => void load()} className="border px-3 py-2 text-xs">
        {busy ? "Loading…" : warehouses ? "Refresh warehouse stock preview" : "Preview stock by warehouse"}
      </button>
      {error && <p role="alert">{error}</p>}
      {warehouses && (
        <div aria-live="polite">
          {warehouses.length ? (
            <>
              <ul className="list-inside list-disc">
                {warehouses.map((warehouse) => (
                  <li key={warehouse.warehouse_id}>{warehouse.warehouse_name}: {warehouse.eligible_units} eligible units, {warehouse.allocated_demand} committed to pick batches</li>
                ))}
              </ul>
              <p>Open demand without a warehouse assignment: {warehouses[0].unallocated_demand} units. This preview does not send stock to Shopify.</p>
            </>
          ) : <p>No active locations to preview.</p>}
        </div>
      )}
    </div>
  );
}
