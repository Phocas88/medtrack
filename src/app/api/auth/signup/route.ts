import { enforceRateLimit } from "@/lib/distributed-rate-limit";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { routeError, HttpError } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) throw new HttpError(401, "Sign in required");
    await enforceRateLimit("signup-bootstrap", user.id, 10);
    const { fullName, companyName } = z
      .object({
        fullName: z.string().trim().min(2).max(200),
        companyName: z.string().trim().min(2).max(200),
      })
      .parse(await request.json());
    const { data, error } = await db.rpc("bootstrap_tenant", {
      p_name: companyName,
      p_full_name: fullName,
    });
    if (error) throw error;
    return NextResponse.json({ tenantId: data }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}
