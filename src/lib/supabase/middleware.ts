import { isPublicPage, isScannerPath } from "@/lib/security";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  if (
    isPublicPage(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith("/api/")
  )
    return NextResponse.next({ request });
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  if (
    user &&
    !pathname.startsWith("/auth/") &&
    !pathname.startsWith("/portal")
  ) {
    const { data: profile } = await supabase
      .from("users")
      .select("role,is_active,access_level")
      .eq("id", user.id)
      .single();
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return NextResponse.redirect(
        new URL("/auth/login?error=account_disabled", request.url),
      );
    }
    if (
      (profile?.role === "staff" || profile?.access_level === "scanner_only") &&
      !isScannerPath(pathname)
    ) {
      return NextResponse.redirect(new URL("/scan", request.url));
    }
  }

  const isAuthPage = pathname.startsWith("/auth");
  const isPortalRoute = pathname.startsWith("/portal");
  const isPortalLogin = pathname === "/portal/login";

  // Portal routes: redirect to portal login if not authenticated
  if (isPortalRoute) {
    if (!user && !isPortalLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal/login";
      return NextResponse.redirect(url);
    }
    if (user && isPortalLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/portal";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Scanner + POS routes: redirect to login with redirect param, but stay in their own UI
  const isScanRoute = isScannerPath(pathname);
  const isPosRoute = pathname.startsWith("/pos");
  if ((isScanRoute || isPosRoute) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  if (isScanRoute || isPosRoute) {
    return supabaseResponse;
  }

  // API routes handle their own auth
  const isApiRoute = pathname.startsWith("/api");
  if (isApiRoute) {
    return supabaseResponse;
  }

  // Demo page is public
  if (pathname.startsWith("/demo")) {
    return supabaseResponse;
  }

  // Admin routes: redirect unauthenticated users to login (except auth pages)
  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.searchParams.set("redirect", pathname + request.nextUrl.search);
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/auth/login" || pathname === "/auth/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
