"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
type Job = {
  id: string;
  kind: "inventory" | "fulfillment" | "import";
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};
const jobLabels = { inventory: "Stock publish", fulfillment: "Fulfillment and tracking", import: "Order import" };
const recovery = {
  inventory: "Check the Shopify location and inventory-item mapping.",
  fulfillment: "Check the fulfillment location and open quantities on the Shopify order.",
  import: "Check the store connection and SKU mapping.",
};

export function IntegrationJobStatus() {
  const { role } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [lastCompletedAt, setLastCompletedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/shopify/jobs");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setJobs(data.jobs);
      setLastCompletedAt(data.lastCompletedAt ?? null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not load jobs",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function retry(id: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/shopify/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      toast.success("Shopify job queued for retry");
      await load();
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Retry failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Shopify sync activity</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs underline"
        >
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      {!error && lastCompletedAt && <p className="text-sm text-muted-foreground">
        Last completed Shopify job: <time dateTime={lastCompletedAt}>{new Date(lastCompletedAt).toLocaleString()}</time>
      </p>}
      {!error && jobs.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Shopify jobs recorded.
        </p>
      )}
      {jobs.map((job) => (
        <div
          key={job.id}
          className="flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm"
        >
          <span>{jobLabels[job.kind]} · {new Date(job.created_at).toLocaleString()}</span>
          <span>
            {job.status} · {job.attempts} attempts
          </span>
          {job.last_error && (
            <span className="text-xs text-muted-foreground">
              {recovery[job.kind]}
            </span>
          )}
          {role === "admin" && job.status === "failed" && (
            <button
              disabled={busy}
              onClick={() => void retry(job.id)}
              className="border px-3 py-2 text-xs disabled:opacity-50"
            >
              Retry job
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
