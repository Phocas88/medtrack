import { NextResponse } from "next/server";
import { requireUser, routeError } from "@/lib/server-auth";
export async function POST() {
  try {
    await requireUser(["admin", "manager"], true);
    return NextResponse.json(
      {
        error:
          "Pickup booking is not available in Stokora. Schedule pickups in your EasyPost account; label purchase and tracking remain available here.",
      },
      { status: 501 },
    );
  } catch (error) {
    return routeError(error);
  }
}
