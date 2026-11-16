"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Choice = { id: string; name: string };
type Config = {
  customers: Choice[];
  items: Choice[];
  taxes: Choice[];
  localCustomers: Choice[];
  localProducts: Choice[];
  mappings: {
    entity_type: string;
    entity_id: string;
    remote_id: string;
    tax_code: string | null;
  }[];
};
type State = {
  connected: boolean;
  realm: string | null;
  environment: string;
  exports: {
    order_id: string;
    invoice_id: string | null;
    created_at: string;
  }[];
};
export default function QuickBooksPage() {
  const { role } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"customer" | "product">("customer");
  const [local, setLocal] = useState("");
  const [remote, setRemote] = useState("");
  const [tax, setTax] = useState("");
  const [order, setOrder] = useState("");
  const [orders, setOrders] = useState<{ id: string; order_number: string }[]>(
    [],
  );
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/quickbooks/status");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(data);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load connection",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      toast.error(
        failure instanceof Error ? failure.message : "Operation failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function post(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }
  async function loadMappings() {
    const response = await fetch("/api/quickbooks/mappings");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setConfig(data);
    const orderResponse = await fetch("/api/orders?status=shipped");
    const orderData = await orderResponse.json();
    if (!orderResponse.ok) throw new Error(orderData.error);
    setOrders(orderData.orders.filter((order:{order_number:string;notes:string|null})=>!order.order_number.startsWith('SHOPIFY-')&&!order.notes?.startsWith('Cash POS sale:')));
  }
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="QuickBooks"
        description="Export unpaid local warehouse orders as USD invoices in QuickBooks Online."
      />
      {error && (
        <div role="alert" className="border p-4">
          {error}
          <button onClick={() => void load()} className="ml-4 underline">
            Retry
          </button>
        </div>
      )}
      <section className="space-y-4 border bg-card p-5">
        <h2 className="font-semibold">Accounting connection</h2>
        <p className="text-sm">
          {state
            ? state.connected
              ? `Connected · ${state.environment}`
              : `Disconnected · ${state.environment}`
            : "Loading connection…"}
        </p>
        {role === "admin" && (
          <div className="flex flex-wrap gap-3">
            {state?.connected ? (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void run(loadMappings)}
                >
                  Load accounting mappings
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Disconnect QuickBooks? Existing exports and mappings will be retained for reconciliation.",
                      )
                    )
                      void run(async () => {
                        await post("/api/quickbooks/disconnect", {});
                        setConfig(null);
                        await load();
                      });
                  }}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <a
                href="/api/quickbooks/connect"
                className="inline-block bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Connect with Intuit
              </a>
            )}
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Map existing customers, sales items and tax codes before exporting.
          Confirm your accounting company uses USD and review tax treatment with
          your accountant. OAuth credentials remain on the server.
        </p>
      </section>
      {config && (
        <>
          <form
            className="space-y-4 border bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await post("/api/quickbooks/mappings", {
                  entity_type: kind,
                  entity_id: local,
                  remote_id: remote,
                  ...(kind === "product" ? { tax_code: tax } : {}),
                });
                toast.success("Mapping saved");
                await loadMappings();
              });
            }}
          >
            <h2 className="font-semibold">Match warehouse records</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Record type</span>
                <select
                  className="w-full border bg-card p-2"
                  value={kind}
                  onChange={(event) => {
                    setKind(event.target.value as "customer" | "product");
                    setLocal("");
                    setRemote("");
                  }}
                >
                  <option value="customer">Customer</option>
                  <option value="product">Product</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Warehouse record</span>
                <select
                  required
                  className="w-full border bg-card p-2"
                  value={local}
                  onChange={(event) => setLocal(event.target.value)}
                >
                  <option value="">Choose record</option>
                  {(kind === "product"
                    ? config.localProducts
                    : config.localCustomers
                  ).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>QuickBooks record</span>
                <select
                  required
                  className="w-full border bg-card p-2"
                  value={remote}
                  onChange={(event) => setRemote(event.target.value)}
                >
                  <option value="">Choose accounting record</option>
                  {(kind === "product" ? config.items : config.customers).map(
                    (item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
              {kind === "product" && (
                <label className="space-y-1 text-sm">
                  <span>Sales tax code</span>
                  <select
                    required
                    className="w-full border bg-card p-2"
                    value={tax}
                    onChange={(event) => setTax(event.target.value)}
                  >
                    <option value="">Choose tax treatment</option>
                    <option value="NON">Non-taxable (US)</option>
                    <option value="TAX">Taxable (US)</option>
                    {config.taxes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <Button disabled={busy}>Save mapping</Button>
            <p className="text-xs text-muted-foreground">
              {config.mappings.length} mappings saved. New mappings apply to
              future export snapshots.
            </p>
          </form>
          <form
            className="space-y-4 border bg-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const result = await post("/api/quickbooks/export", {
                  order_id: order,
                });
                toast.success(`Invoice ${result.invoice_id} exported`);
                await load();
              });
            }}
          >
            <h2 className="font-semibold">Export a shipped order</h2>
            <label className="block space-y-1 text-sm">
              <span>Recent shipped orders</span>
              <select
                required
                className="w-full border bg-card p-2"
                value={order}
                onChange={(event) => setOrder(event.target.value)}
              >
                <option value="">Choose order</option>
                {orders.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.order_number}
                  </option>
                ))}
              </select>
            </label>
            <Button disabled={busy}>Create invoice in QuickBooks</Button>
            <p className="text-xs text-muted-foreground">
              Retries use the same saved invoice snapshot and provider request
              identifier. Shopify and paid POS orders require separate financial reconciliation and cannot be exported here. Exporting does not record a customer payment.
            </p>
          </form>
        </>
      )}
      {state && (
        <section className="border bg-card p-5">
          <h2 className="mb-4 font-semibold">Recent exports</h2>
          {state.exports.length ? (
            state.exports.map((item) => (
              <div
                key={item.order_id}
                className="flex flex-wrap justify-between gap-2 border-t py-3 text-sm"
              >
                <span className="font-mono">{item.order_id}</span>
                <span>
                  {item.invoice_id
                    ? `Invoice ${item.invoice_id}`
                    : "Pending — retry the same order"}
                </span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              No invoices exported.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
