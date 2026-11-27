import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/distributed-rate-limit";
import { routeError } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    const { name, email, company, message, interest } = z
      .object({
        name: z.string().trim().min(1).max(200),
        email: z.string().email().max(320),
        company: z.string().max(200).optional(),
        message: z.string().trim().min(1).max(8000),
        interest: z.string().max(200).optional(),
        website: z.string().max(0).optional(),
      })
      .parse(await request.json());

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Name, email, and message are required" },
        { status: 400 },
      );
    }

    const accessKey = process.env.WEB3FORMS_ACCESS_KEY || process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
    if (!accessKey) {
      console.error("WEB3FORMS_ACCESS_KEY not configured");
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 500 },
      );
    }

    await enforceRateLimit(
      "contact",
      request.headers
        .get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim()
        .slice(0, 80) || "unknown",
      5,
      300,
    );
    const res = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: accessKey,
        subject: `New ${BRAND_NAME} Inquiry from ${name}${company ? ` (${company})` : ""}`,
        from_name: PRODUCT_NAME,
        replyto: email,
        name,
        email,
        company: company || "Not provided",
        interest: interest || "Not specified",
        message,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error("Contact delivery failed", { status: res.status });
      return NextResponse.json({ error: "Failed to send" }, { status: 500 });
    }

    const result = await res.json();
    if (!result.success)
      return NextResponse.json({ error: "Failed to send" }, { status: 502 });

    return NextResponse.json({ status: "accepted" }, { status: 202 });
  } catch (err) {
    return routeError(err);
  }
}
