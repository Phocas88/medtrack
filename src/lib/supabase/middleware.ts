import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const publicPages = new Set([
  '/', '/demo', '/guide', '/support', '/legal/privacy', '/legal/terms',
  '/auth/callback', '/auth/reset', '/auth/signup', '/robots.txt', '/sitemap.xml',
  '/manifest.json', '/sw.js',
]);

const isUnder = (pathname: string, root: string) =>
  pathname === root || pathname.startsWith(root + '/');

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPages.has(pathname) || isUnder(pathname, '/api')) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookies) {
          for (const { name, value } of cookies) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();

  function redirect(path: string, returnTo?: string) {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = '';
    if (returnTo) url.searchParams.set('redirect', returnTo);
    const redirectResponse = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirectResponse.cookies.set(cookie);
    return redirectResponse;
  }

  const portalLogin = pathname === '/portal/login';
  if (isUnder(pathname, '/portal')) {
    if (!user && !portalLogin) return redirect('/portal/login');
    if (user && portalLogin) return redirect('/portal');
    return response;
  }

  if (pathname === '/auth/login') return user ? redirect('/dashboard') : response;
  if (!user) return redirect('/auth/login', pathname);
  return response;
}
