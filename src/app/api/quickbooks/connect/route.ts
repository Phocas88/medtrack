import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser, routeError, HttpError } from "@/lib/server-auth";
import { quickBooksRedirect } from "@/lib/quickbooks";
export async function GET() {
  try {
    await requireUser(["admin"], true);
    if (
      !process.env.QUICKBOOKS_CLIENT_ID ||
      !process.env.QUICKBOOKS_CLIENT_SECRET ||
      !process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY
    )
      throw new HttpError(503, "QuickBooks authorization is not configured");
    const state = randomBytes(32).toString("hex");
    const url = new URL("https://appcenter.intuit.com/connect/oauth2");
    url.search = new URLSearchParams({
      client_id: process.env.QUICKBOOKS_CLIENT_ID,
      scope: "com.intuit.quickbooks.accounting",
      redirect_uri: quickBooksRedirect(),
      response_type: "code",
      state,
    }).toString();
    const response = NextResponse.redirect(url);
    response.cookies.set("quickbooks_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return routeError(error);
  }
}
