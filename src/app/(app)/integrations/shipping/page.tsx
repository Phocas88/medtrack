"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
export default function ShippingIntegration() {
  const { role } = useAuth();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/shipping/account", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setConnected(data.connected);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, []);
  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/shipping/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setKey("");
      setConnected(true);
      toast.success("Shipping account connected");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Connection failed",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Shipping account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your own EasyPost account and carrier connections. Postage charges
          go to that account.
        </p>
      </div>
      {error && (
        <p role="alert" className="border p-4 text-sm">
          {error}
        </p>
      )}
      <section className="space-y-4 border bg-card p-5">
        <h2 className="font-semibold">EasyPost</h2>
        <p className="text-sm">
          {connected === null
            ? "Checking connection…"
            : connected
              ? "Connected"
              : "Not connected"}
        </p>
        {!connected && role === "admin" && (
          <form onSubmit={(event) => void connect(event)} className="space-y-3">
            <label className="block space-y-2 text-sm">
              <span>EasyPost API key</span>
              <input
                type="password"
                required
                minLength={20}
                maxLength={300}
                autoComplete="new-password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                className="block min-h-10 w-full border bg-card px-3"
              />
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Start with an EasyPost test account in staging. Connecting
              validates account access and registers the signed tracking
              webhook. Keys are encrypted on the server and are never returned
              to the browser.
            </p>
            <button
              disabled={busy}
              className="bg-primary px-4 py-3 text-sm text-primary-foreground disabled:opacity-50"
            >
              {busy ? "Connecting…" : "Connect account"}
            </button>
          </form>
        )}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Manage carrier credentials in EasyPost. Contact support to rotate or
          change the connection while preserving access to outstanding labels
          and trackers.
        </p>
      </section>
    </main>
  );
}
