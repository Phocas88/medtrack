import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { appOrigin, shopDomain } from '@/lib/security';
import { routeError, HttpError } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const shop = shopDomain(new URL(request.url).searchParams.get('shop') || '');
    const key = process.env.SHOPIFY_API_KEY;
    if (!key || !process.env.SHOPIFY_API_SECRET || !process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY) throw new HttpError(503, 'Shopify installation is not configured');
    const state = randomBytes(32).toString('hex');
    const url = new URL(`https://${shop}/admin/oauth/authorize`);
    url.search = new URLSearchParams({ client_id: key, scope: 'read_products,read_orders,read_inventory,write_inventory,read_locations,read_fulfillments,write_fulfillments', redirect_uri: `${appOrigin()}/api/shopify/callback`, state }).toString();
    const response = NextResponse.redirect(url);
    const options = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge: 600, path: '/' };
    response.cookies.set('shopify_oauth_state', state, options);
    response.cookies.set('shopify_oauth_shop', shop, options);
    return response;
  } catch (error) { return routeError(error); }
}
