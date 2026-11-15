import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { appOrigin, shopDomain } from '@/lib/security';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import { createShopifyClient } from '@/lib/shopify';
import { saveShopifyConnection } from '@/lib/shopify-connection';
import { verifyOAuth } from '@/lib/shopify-webhooks';
import { routeError, HttpError } from '@/lib/server-auth';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const shop = shopDomain(params.get('shop') || '');
    const cookieStore = await cookies();
    if (!verifyOAuth(params, cookieStore.get('shopify_oauth_state')?.value, cookieStore.get('shopify_oauth_shop')?.value)) throw new HttpError(401, 'Invalid Shopify authorization');
    cookieStore.delete('shopify_oauth_state'); cookieStore.delete('shopify_oauth_shop');
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.SHOPIFY_API_KEY, client_secret: process.env.SHOPIFY_API_SECRET, code: params.get('code') }),
      signal: AbortSignal.timeout(15000),
    });
    if (!tokenResponse.ok) throw new HttpError(502, 'Shopify authorization failed');
    const { access_token: token } = await tokenResponse.json();
    if (typeof token !== 'string' || !token) throw new HttpError(502, 'Shopify returned no access token');
    const { shop: info } = await createShopifyClient({ store_url: shop, access_token: token }).getShop();
    const db = createServiceClient();
    const session = await createClient();
    const { data: { user: signedIn } } = await session.auth.getUser();
    const { data: existing, error: lookupError } = await db.from('integration_credentials').select('tenant_id').eq('provider', 'shopify').eq('shop_domain', shop).maybeSingle();
    if (lookupError) throw lookupError;
    let tenantId: string;
    let loginEmail: string;
    if (existing) {
      const { data: admin, error } = await db.from('users').select('tenant_id,email').eq('tenant_id', existing.tenant_id).eq('role', 'admin').eq('is_active', true).order('created_at').limit(1).single();
      if (error || !admin) throw new HttpError(409, 'Contact support to restore this store account');
      tenantId = admin.tenant_id; loginEmail = admin.email;
      // Shopify authorization proves authority over this exact previously bound shop.
      if (signedIn) {
        const { data: profile } = await db.from('users').select('tenant_id,role').eq('id', signedIn.id).eq('is_active', true).single();
        if (!profile || profile.tenant_id !== tenantId || profile.role !== 'admin') throw new HttpError(403, 'Sign out or use this store’s administrator account');
      }
    } else if (signedIn) {
      const { data: profile } = await db.from('users').select('tenant_id,email,role').eq('id', signedIn.id).eq('is_active', true).single();
      if (!profile || profile.role !== 'admin') throw new HttpError(403, 'Administrator required');
      tenantId = profile.tenant_id; loginEmail = profile.email;
    } else {
      // Never attach an unrelated existing account just because its email matches Shopify.
      const { data: created, error } = await db.auth.admin.createUser({
        email: info.email, password: randomBytes(32).toString('hex'), email_confirm: true,
        user_metadata: { company_name: info.name, full_name: info.name },
      });
      if (error || !created.user) throw new HttpError(409, 'Sign in to your existing Stokora account, then install this store again');
      const { data: profile, error: profileError } = await db.from('users').select('tenant_id,email').eq('id', created.user.id).single();
      if (profileError || !profile) throw new Error('Account provisioning failed');
      tenantId = profile.tenant_id; loginEmail = profile.email;
    }
    await saveShopifyConnection(tenantId, shop, token, info.name);
    if (!signedIn) {
      const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: loginEmail });
      if (error || !link.properties.hashed_token) throw new Error('Session creation failed');
      const { error: sessionError } = await session.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
      if (sessionError) throw sessionError;
    }
    return NextResponse.redirect(`${appOrigin()}/dashboard`);
  } catch (error) { return routeError(error); }
}
