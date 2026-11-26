import { updateSession } from "@/lib/supabase/middleware";
import { shopDomain } from "@/lib/security";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  if (request.nextUrl.pathname === "/shopify") {
    let ancestors = "'none'";
    try {
      ancestors = `https://${shopDomain(request.nextUrl.searchParams.get("shop") || "")} https://admin.shopify.com`;
    } catch {
      /* Unbound pages cannot be embedded. */
    }
    response.headers.set(
      "Content-Security-Policy",
      `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.shopify.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://cdn.shopify.com https://admin.shopify.com; frame-ancestors ${ancestors}`,
    );
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_vercel/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
