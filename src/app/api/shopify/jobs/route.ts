import { NextResponse, after } from "next/server";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
import { drainIntegrationJobs } from "@/lib/integration-jobs";
import { z } from "zod";
import { uuid } from "@/lib/security";
export const maxDuration = 60;
export async function GET() {
  try {
    const user = await requireUser(["admin", "manager"]);
    const { data, error } = await createServiceClient()
      .from("integration_jobs")
      .select("id,status,attempts,last_error,created_at,next_attempt_at")
      .eq("tenant_id", user.tenant_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json(
      { jobs: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser(["admin"], true);
    const { id } = z.object({ id: uuid }).parse(await request.json());
    const { data, error } = await createServiceClient()
      .from("integration_jobs")
      .update({
        status: "pending",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", id)
      .eq("tenant_id", user.tenant_id)
      .eq("status", "failed")
      .select("id");
    if (error) throw error;
    if (!data?.length)
      throw new HttpError(409, "Only failed jobs can be retried");
    after(async () => {
      try {
        await drainIntegrationJobs(3);
      } catch {
        console.error("Integration worker failed");
      }
    });
    return NextResponse.json({ queued: true });
  } catch (error) {
    return routeError(error);
  }
}
