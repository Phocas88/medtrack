import { NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Shopify OAuth install flow — Step 1.
 * Merchant clicks "Install" from App Store → redirected here.
 * We redirect them to Shopify's OAuth authorization URL.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get('shop');

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  const apiKey = process.env.SHOPIFY_API_KEY;
  const scopes = 'read_products,write_products,read_orders,write_orders,read_inventory,write_inventory,read_locations,read_fulfillments,write_fulfillments';
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://stokora.vercel.app'}/api/shopify/callback`;

  // Generate a random state for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');

  // Store state in a cookie for verification on callback
  const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${apiKey}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}
