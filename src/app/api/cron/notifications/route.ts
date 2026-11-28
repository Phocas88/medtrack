import { drainIntegrationJobs } from "@/lib/integration-jobs";
export const maxDuration = 300;
import { NextResponse } from "next/server";
import { POST as checkNotifications } from "@/app/api/notifications/check/route";
import { POST as sendNotifications } from "@/app/api/notifications/send-email/route";
import { createServiceClient } from "@/lib/supabase/service";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const workerKey = process.env.NOTIFICATION_API_KEY;
  if (!secret)
    return NextResponse.json(
      { error: "Notification scheduler is not configured" },
      { status: 503 },
    );
  if (request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await drainIntegrationJobs(10);
  const { error: cycleCountError } = await createServiceClient().rpc("schedule_due_cycle_counts");
  if (cycleCountError) console.error("Cycle count scheduler failed", cycleCountError.code);
  const { error: digestError } = await createServiceClient().rpc("queue_analytics_digests");
  if (digestError) console.error("Analytics digest scheduler failed", digestError.code);
  const { error } = await createServiceClient()
    .from("gdpr_requests")
    .update({ payload: {} })
    .lt("created_at", new Date(Date.now() - 30 * 86400000).toISOString());
  if (error)
    return NextResponse.json(
      { error: "Privacy retention cleanup failed" },
      { status: 500 },
    );
  if (!workerKey)
    return NextResponse.json(
      { error: "Notification worker is not configured" },
      { status: 503 },
    );
  const workerRequest = () =>
    new Request("http://internal/notifications", {
      method: "POST",
      headers: {
        "x-api-key": workerKey,
        "x-forwarded-for": "scheduled-worker",
      },
    });
  const checked = await checkNotifications(workerRequest());
  if (!checked.ok)
    return NextResponse.json(
      { error: "Notification check failed" },
      { status: 502 },
    );
  const sent = await sendNotifications(workerRequest());
  if (!sent.ok)
    return NextResponse.json(
      { error: "Email delivery failed; notifications remain queued" },
      { status: 502 },
    );
  return NextResponse.json({ success: true });
}
