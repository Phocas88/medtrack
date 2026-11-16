import { NextResponse } from "next/server";
import { drainIntegrationJobs } from "@/lib/integration-jobs";
import { createServiceClient } from "@/lib/supabase/service";
import { routeError } from "@/lib/server-auth";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret)
      return NextResponse.json(
        { error: "Scheduler unavailable" },
        { status: 503 },
      );
    if (request.headers.get("authorization") !== `Bearer ${secret}`)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // Periodic reconciliation catches expiry dates and missed source-side events.
    const db = createServiceClient();
    const { data, error } = await db
      .from("shopify_inventory_mappings")
      .select("tenant_id,product_id")
      .eq("publish_enabled", true);
    if (error) throw error;
    const { data: jobs, error: jobsError } = await db
      .from("integration_jobs")
      .select("event_id,status")
      .eq("provider", "shopify")
      .neq("status", "complete");
    if (jobsError) throw jobsError;
    const waiting = new Set((jobs || []).map((job) => job.event_id));
    for (const mapping of data || []) {
      if (waiting.has(`stock:${mapping.tenant_id}:${mapping.product_id}`))
        continue;
      const { error: queueError } = await db.rpc("enqueue_shopify_stock", {
        p_tenant: mapping.tenant_id,
        p_product: mapping.product_id,
      });
      if (queueError) throw queueError;
    }
    return NextResponse.json(await drainIntegrationJobs(20));
  } catch (error) {
    return routeError(error);
  }
}
