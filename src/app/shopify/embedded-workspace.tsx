"use client";
import { useCallback, useEffect, useState } from "react";
import type { DetailedHTMLProps, HTMLAttributes } from "react";
type PolarisElement = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  heading?: string;
  tone?: string;
  href?: string;
  target?: string;
  variant?: string;
};
declare global {
  // React 18 custom-element types require JSX namespace augmentation.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "s-page": PolarisElement;
      "s-section": PolarisElement;
      "s-text": PolarisElement;
      "s-banner": PolarisElement;
      "s-button": PolarisElement;
      "s-table": PolarisElement;
      "s-table-header-row": PolarisElement;
      "s-table-header": PolarisElement;
      "s-table-body": PolarisElement;
      "s-table-row": PolarisElement;
      "s-table-cell": PolarisElement;
    }
  }
}

type Order = {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  tracking_number: string | null;
  customer: { name: string } | null;
};
declare global {
  interface Window {
    shopify?: { idToken: () => Promise<string> };
  }
}
export function EmbeddedWorkspace() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [needsLink, setNeedsLink] = useState(false);
  const [path, setPath] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    setNeedsLink(false);
    try {
      let bridge = window.shopify;
      for (let attempt = 0; attempt < 30 && !bridge; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        bridge = window.shopify;
      }
      if (!bridge)
        throw new Error(
          "Open this app from Shopify admin to establish an authenticated session.",
        );
      const token = await bridge.idToken();
      const response = await fetch("/api/shopify/embedded/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.status === 403) {
        setNeedsLink(true);
        const challenge = await fetch("/api/shopify/embedded/challenge", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await challenge.json();
        if (!challenge.ok) throw new Error(result.error);
        setPath(result.path);
        return;
      }
      if (!response.ok) throw new Error(data.error);
      setOrders(data.orders);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not load warehouse orders",
      );
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <s-page heading="Stokora warehouse orders">
      <div style={{ display: "grid", gap: 16 }}>
        {error && (
          <s-banner tone="critical">
            <p>{error}</p>
          </s-banner>
        )}
        {needsLink && (
          <s-banner heading="Link your warehouse account">
            <p>
              Sign in to Stokora and approve this Shopify identity. Your
              warehouse role determines access.
            </p>
            {path && (
              <a
                href={path}
                target="_top"
                style={{
                  display: "inline-block",
                  marginTop: 12,
                  textDecoration: "underline",
                }}
              >
                Link Stokora account
              </a>
            )}
          </s-banner>
        )}
        <s-section heading="Recent warehouse orders">
          <p style={{ marginBottom: 16 }}>
            The latest 50 orders. Receiving, inventory and shipping are
            available in the full warehouse workspace.
          </p>
          <button
            disabled={busy}
            onClick={() => void load()}
            style={{
              padding: "8px 12px",
              border: "1px solid #aaa",
              marginBottom: 16,
            }}
          >
            {busy ? "Loading…" : "Refresh orders"}
          </button>
          {orders.length ? (
            <s-table>
              <s-table-header-row>
                {["Order", "Customer", "Status", "Created", "Tracking"].map(
                  (title) => (
                    <s-table-header key={title}>{title}</s-table-header>
                  ),
                )}
              </s-table-header-row>
              <s-table-body>
                {orders.map((order) => (
                  <s-table-row key={order.id}>
                    <s-table-cell>{order.order_number}</s-table-cell>
                    <s-table-cell>
                      {order.customer?.name || "Customer"}
                    </s-table-cell>
                    <s-table-cell>{order.status}</s-table-cell>
                    <s-table-cell>
                      {new Date(order.created_at).toLocaleDateString()}
                    </s-table-cell>
                    <s-table-cell>{order.tracking_number || "—"}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          ) : (
            !busy && <p>No orders loaded.</p>
          )}
          <s-button href="/dashboard" target="_blank">
            Open warehouse workspace
          </s-button>
        </s-section>
      </div>
    </s-page>
  );
}
