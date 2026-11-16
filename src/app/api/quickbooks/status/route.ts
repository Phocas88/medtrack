import { NextResponse } from "next/server";
import { requireUser, routeError } from "@/lib/server-auth";
import { createServiceClient } from "@/lib/supabase/service";
export async function GET() {
  try {
    const user = await requireUser(["admin", "manager"]);
    const db = createServiceClient();
    const [
      { data: connection, error },
      { data: exports, error: exportsError },
    ] = await Promise.all([
      db
        .from("integration_credentials")
        .select("connected,shop_domain")
        .eq("tenant_id", user.tenant_id)
        .eq("provider", "quickbooks")
        .maybeSingle(),
      db
        .from("accounting_exports")
        .select("order_id,invoice_id,created_at,completed_at")
        .eq("tenant_id", user.tenant_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (error || exportsError) throw error || exportsError;
    return NextResponse.json(
      {
        connected: !!connection?.connected,
        realm: connection?.shop_domain || null,
        exports: exports || [],
        environment:
          process.env.QUICKBOOKS_ENVIRONMENT === "production"
            ? "production"
            : "sandbox",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return routeError(error);
  }
}
