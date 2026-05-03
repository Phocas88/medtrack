import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
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
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isAuthPage = pathname.startsWith('/auth');
  const isPortalRoute = pathname.startsWith('/portal');
  const isPortalLogin = pathname === '/portal/login';

  // Portal routes: redirect to portal login if not authenticated
  if (isPortalRoute) {
    if (!user && !isPortalLogin) {
      const url = request.nextUrl.clone();
      url.pathname = '/portal/login';
      return NextResponse.redirect(url);
    }
    if (user && isPortalLogin) {
      const url = request.nextUrl.clone();
      url.pathname = '/portal';
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Scanner route: redirect to login with redirect param
  const isScanRoute = pathname.startsWith('/scan');
  if (isScanRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
  if (isScanRoute) {
    return supabaseResponse;
  }

  // Admin routes: redirect unauthenticated users to login (except auth pages)
  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
