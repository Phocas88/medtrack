"use client";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
import { ShopifyStockPreview } from "./shopify-stock-preview";
type Mapping = {
  product_id: string;
  variant_id: string;
  location_id: string | null;
  warehouse_id: string | null;
  publish_enabled: boolean;
  product: { name: string; sku: string } | null;
};
export function InventoryPublishing() {
  const { role } = useAuth();
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [locations, setLocations] = useState<{ id: number; name: string }[]>(
    [],
  );
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/shopify/inventory");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMappings(data.mappings);
      setLocations(data.locations);
      setWarehouses(data.warehouses);
      setLoaded(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load inventory mappings",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save(product: string, form: HTMLFormElement) {
    const fields = new FormData(form);
    const warehouse = fields.get("warehouse");
    const enabled = fields.get("enabled") === "on";
    if (
      enabled &&
      !window.confirm(
        warehouse
          ? "Publish available inventory from the selected Invexiqs warehouse? Invexiqs will overwrite the Shopify stock count at the selected destination."
          : "Publish company-wide available inventory? Invexiqs will overwrite the Shopify stock count at the selected destination.",
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch("/api/shopify/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product,
          location_id: fields.get("location"),
          publish_enabled: enabled,
          warehouse_id: warehouse || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.success(
        enabled ? "Stock publishing queued" : "Stock publishing disabled",
      );
      await load();
    } catch (failure) {
      toast.error(
        failure instanceof Error
          ? failure.message
          : "Could not save inventory mapping",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Shopify stock publishing</h2>
        <button
          disabled={busy}
          onClick={() => void load()}
          className="border px-3 py-2 text-xs disabled:opacity-50"
        >
          {busy
            ? "Loading…"
            : loaded
              ? "Refresh mappings"
              : "Load locations and mappings"}
        </button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Import products first. Each product can publish company-wide stock or stock from one Invexiqs
        warehouse to one Shopify location. Warehouse publishing deducts demand assigned to the
        selected warehouse and all demand awaiting assignment. Held and expired stock is excluded.
      </p>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {loaded && mappings.length === 0 && (
        <p className="text-sm">No mapped products. Run product import first.</p>
      )}
      {mappings.map((mapping) => (
        <form
          key={mapping.product_id}
          className="flex flex-wrap items-end gap-4 border-t py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save(mapping.product_id, event.currentTarget);
          }}
        >
          <div className="min-w-40 flex-1">
            <p className="text-sm font-medium">
              {mapping.product?.name || "Product"}
            </p>
            <p className="text-xs text-muted-foreground">
              {mapping.product?.sku}
            </p>
          </div>
          <label className="space-y-1 text-xs">
            <span>Shopify location</span>
            <select
              required
              name="location"
              defaultValue={mapping.location_id || ""}
              disabled={role !== "admin"}
              className="block min-h-10 max-w-full border bg-card px-2"
            >
              <option value="">Choose location</option>
              {locations.map((location) => (
                <option
                  key={location.id}
                  value={`gid://shopify/Location/${location.id}`}
                >
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span>Invexiqs stock source</span>
            <select name="warehouse" defaultValue={mapping.warehouse_id || ""} disabled={role !== "admin"}
              className="block min-h-10 max-w-full border bg-card px-2">
              <option value="">All locations</option>
              {warehouses.filter((warehouse) => warehouse.is_active || warehouse.id === mapping.warehouse_id).map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}{warehouse.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-10 items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={mapping.publish_enabled}
              disabled={role !== "admin"}
            />
            Publish stock
          </label>
          {role === "admin" && (
            <button
              disabled={busy}
              className="min-h-10 border px-3 text-xs disabled:opacity-50"
            >
              Save mapping
            </button>
          )}
          <ShopifyStockPreview productId={mapping.product_id} />
        </form>
      ))}
      <p className="text-xs text-muted-foreground">
        Changes enter the shared worker queue. The configured reconciliation
        schedule runs every five minutes and requires a Vercel plan that
        supports that frequency.
      </p>
    </section>
  );
}
