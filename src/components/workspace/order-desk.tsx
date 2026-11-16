"use client";

import { toast } from "sonner";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, Search, X } from "lucide-react";
import { ShippingLabel } from "./shipping-label";
import { WorkspaceOverview } from "./overview";

type OrderLine = {
  id: string;
  product_id: string;
  product: string;
  sku: string;
  ordered: number;
  shipped: number;
};
type Order = {
  id: string;
  order_number: string;
  customer: string;
  status: string;
  created_at: string;
  tracking_number: string | null;
  carrier: string | null;
  delivery_status: string | null;
  notes: string | null;
  lines: OrderLine[];
};
const statuses = [
  ["all", "All orders"],
  ["draft", "Draft"],
  ["confirmed", "To pick"],
  ["picking", "In progress"],
  ["shipped", "Shipped"],
  ["cancelled", "Cancelled"],
  ["externally_fulfilled", "Fulfilled externally"],
] as const;
const label = (status: string) =>
  statuses.find(([value]) => value === status)?.[1] || status;

export function OrderDesk() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [updating, setUpdating] = useState(false);
  async function transition(target: "confirmed" | "cancelled") {
    if (!selected || updating) return;
    if (
      target === "cancelled" &&
      !window.confirm(`Cancel ${selected.order_number}?`)
    )
      return;
    setUpdating(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: selected.id,
          expected: selected.status,
          target,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.success("Order updated");
      setRefresh((value) => value + 1);
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Order update failed",
      );
    } finally {
      setUpdating(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/orders?${new URLSearchParams({ status, q: query, page: String(page) })}`,
          { signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load orders");
        setOrders(data.orders);
        setTotal(data.total);
        setSelected((previous) =>
          previous
            ? data.orders.find((order: Order) => order.id === previous.id) ||
              null
            : null,
        );
      } catch (failure) {
        if (!controller.signal.aborted) {
          setOrders([]);
          setTotal(0);
          setSelected(null);
          setError(
            failure instanceof Error
              ? failure.message
              : "Could not load orders",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [status, query, page, refresh]);

  return (
    <div className="space-y-5">
      <WorkspaceOverview />
      <div className="border bg-card lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-label="Order worklist" className="min-w-0">
          <div
            className="flex overflow-x-auto border-b px-2"
            aria-label="Filter order status"
          >
            {statuses.map(([value, title]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                onClick={() => {
                  setStatus(value);
                  setPage(0);
                }}
                className={`min-h-12 shrink-0 border-b-2 px-3 text-xs ${status === value ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-accent"}`}
              >
                {title}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 border-b p-3">
            <label className="flex w-full max-w-sm items-center gap-2 border px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">Find an order</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
                maxLength={200}
                placeholder="Order number or customer…"
                className="h-10 min-w-0 flex-1 bg-transparent text-sm"
              />
            </label>
            <button
              type="button"
              disabled={loading}
              aria-label="Refresh orders"
              onClick={() => setRefresh((value) => value + 1)}
              className="p-3 hover:bg-accent disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
          <div aria-live="polite" aria-busy={loading}>
            {error ? (
              <div role="alert" className="space-y-3 p-6">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={() => setRefresh((value) => value + 1)}
                  className="border px-3 py-2 text-sm"
                >
                  Retry loading
                </button>
              </div>
            ) : loading ? (
              <p className="p-6 text-sm text-muted-foreground">
                Loading orders…
              </p>
            ) : orders.length === 0 ? (
              <div className="space-y-3 p-8">
                <h3 className="font-medium">
                  {query || status !== "all"
                    ? "No matching orders"
                    : "No orders yet"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {query || status !== "all"
                    ? "Try another search or status."
                    : "Import Shopify orders or place an order through the customer portal."}
                </p>
                <Link
                  href="/integrations/shopify"
                  className="inline-block text-sm text-primary underline"
                >
                  Shopify connection
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/30 text-muted-foreground">
                    <tr>
                      {[
                        "Order",
                        "Customer",
                        "Units remaining",
                        "Status",
                        "Created",
                      ].map((title) => (
                        <th
                          key={title}
                          scope="col"
                          className="whitespace-nowrap px-4 py-3 font-medium"
                        >
                          {title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className={`border-t ${selected?.id === order.id ? "bg-primary/5" : "hover:bg-accent/50"}`}
                      >
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            aria-pressed={selected?.id === order.id}
                            onClick={() => setSelected(order)}
                            className="whitespace-nowrap font-mono text-primary underline-offset-4 hover:underline"
                          >
                            {order.order_number}
                          </button>
                        </td>
                        <td className="px-4 py-4">{order.customer}</td>
                        <td className="px-4 py-4 font-mono">
                          {order.lines.reduce(
                            (sum, line) =>
                              sum + Math.max(0, line.ordered - line.shipped),
                            0,
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4">
                          {label(order.status)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground">
            <span>
              {total} orders · Page {page + 1}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page === 0 || loading}
                onClick={() => setPage((value) => value - 1)}
                className="border px-3 py-2 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={(page + 1) * 50 >= total || loading}
                onClick={() => setPage((value) => value + 1)}
                className="border px-3 py-2 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </section>
        <aside
          aria-label="Order details"
          className="border-t bg-background/50 lg:border-l lg:border-t-0"
        >
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b px-5 py-3">
                <h3 className="text-xs font-medium">Order details</h3>
                <button
                  type="button"
                  aria-label="Close order details"
                  onClick={() => setSelected(null)}
                  className="p-2 hover:bg-accent"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-5 p-5">
                <div>
                  <h3 className="break-words font-mono text-lg font-semibold">
                    {selected.order_number}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {selected.customer}
                  </p>
                </div>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-xs">
                  <dt>Status</dt>
                  <dd>{label(selected.status)}</dd>
                  {selected.tracking_number && (
                    <>
                      <dt>Delivery</dt>
                      <dd>
                        {selected.delivery_status || "Awaiting tracking update"}
                      </dd>
                      <dt>Tracking</dt>
                      <dd className="break-all">
                        {selected.carrier} {selected.tracking_number}
                      </dd>
                    </>
                  )}
                </dl>
                <div>
                  <h4 className="border-b pb-2 text-xs font-medium">
                    Line items
                  </h4>
                  {selected.lines.map((line) => (
                    <div key={line.id} className="border-b py-3 text-xs">
                      <p className="font-medium">{line.product}</p>
                      <p className="mt-1 text-muted-foreground">
                        {line.sku} · {line.shipped} / {line.ordered} shipped
                      </p>
                    </div>
                  ))}
                </div>
                {!["cancelled", "externally_fulfilled"].includes(
                  selected.status,
                ) && (
                  <ShippingLabel
                    key={selected.id}
                    orderId={selected.id}
                    canPurchase={["draft", "confirmed", "picking"].includes(
                      selected.status,
                    )}
                    onPurchased={() => setRefresh((value) => value + 1)}
                  />
                )}
                {selected.notes && (
                  <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {selected.notes}
                  </p>
                )}
                {["confirmed", "picking"].includes(selected.status) && (
                  <Link
                    href={`/ship?order=${selected.id}`}
                    className="flex min-h-10 items-center justify-between bg-primary px-3 text-xs text-primary-foreground"
                  >
                    Open fulfillment
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                )}
                {!selected.order_number.startsWith("SHOPIFY-") &&
                  ["draft", "confirmed"].includes(selected.status) && (
                    <div className="flex flex-wrap gap-2">
                      {selected.status === "draft" && (
                        <button
                          disabled={updating}
                          onClick={() => void transition("confirmed")}
                          className="border px-3 py-2 text-xs disabled:opacity-50"
                        >
                          Confirm order
                        </button>
                      )}
                      <button
                        disabled={updating}
                        onClick={() => void transition("cancelled")}
                        className="border px-3 py-2 text-xs text-destructive disabled:opacity-50"
                      >
                        Cancel order
                      </button>
                    </div>
                  )}
              </div>
            </>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              Select an order to inspect its items and fulfillment status.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
