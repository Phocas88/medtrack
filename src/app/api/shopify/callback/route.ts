import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { encryptToken } from '@/lib/shopify-crypto';
import { createShopifyClient } from '@/lib/shopify';
import crypto from 'crypto';

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * Shopify OAuth callback — Step 2.
 * Shopify redirects back here with the authorization code.
 * We exchange it for an access token and set up the tenant.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get('shop');
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const hmac = searchParams.get('hmac');

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://stokora.vercel.app';

  if (!shop || !code) {
    return NextResponse.redirect(`${appUrl}/auth/login?error=missing_params`);
  }

  // Verify state (CSRF protection)
  const cookieState = request.headers.get('cookie')?.match(/shopify_oauth_state=([^;]+)/)?.[1];
  if (state && cookieState && state !== cookieState) {
    return NextResponse.redirect(`${appUrl}/auth/login?error=invalid_state`);
  }

  // Verify HMAC if API secret is set
  if (process.env.SHOPIFY_API_SECRET && hmac) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('hmac');
    params.sort();
    const message = params.toString();
    const computed = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET).update(message).digest('hex');
    if (computed !== hmac) {
      return NextResponse.redirect(`${appUrl}/auth/login?error=invalid_hmac`);
    }
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect(`${appUrl}/auth/login?error=token_exchange_failed`);
    }

    const { access_token } = await tokenRes.json();
    const supabase = svc();

    // Get shop info
    const client = createShopifyClient({ store_url: shop, access_token });
    const { shop: shopInfo } = await client.getShop();

    // Check if tenant already exists for this shop (reinstall case)
    const { data: tenants } = await supabase.from('tenants').select('id, settings');
    const existingTenant = (tenants || []).find((t) => {
      const s = (t.settings as Record<string, unknown>) || {};
      const shopify = (s.shopify as Record<string, unknown>) || {};
      return (shopify.shop_domain as string)?.includes(shop.replace('.myshopify.com', ''));
    });

    let tenantId: string;
    let userId: string;

    if (existingTenant) {
      // Reinstall — reactivate existing tenant
      tenantId = existingTenant.id;
      const settings = (existingTenant.settings as Record<string, unknown>) || {};
      (settings.shopify as Record<string, unknown>) = {
        ...((settings.shopify as Record<string, unknown>) || {}),
        access_token: encryptToken(access_token),
        connected: true,
        uninstalled_at: null,
        reinstalled_at: new Date().toISOString(),
      };
      await supabase.from('tenants').update({ settings }).eq('id', tenantId);

      // Get existing admin user
      const { data: adminUser } = await supabase.from('users').select('id').eq('tenant_id', tenantId).eq('role', 'admin').limit(1);
      userId = adminUser?.[0]?.id || '';

    } else {
      // Fresh install — create new tenant + user
      tenantId = crypto.randomUUID();

      await supabase.from('tenants').insert({
        id: tenantId,
        name: shopInfo.name,
        slug: shop.replace('.myshopify.com', '') + '-' + Date.now().toString(36),
        settings: {
          preset: 'lite',
          onboarding_completed: false,
          shopify: {
            store_url: shop,
            access_token: encryptToken(access_token),
            shop_name: shopInfo.name,
            shop_domain: shopInfo.domain,
            connected: true,
            installed_at: new Date().toISOString(),
            auto_sync_orders: true,
            auto_sync_inventory: true,
          },
        },
      });

      // Create auth user with shop email
      const email = shopInfo.email || `admin@${shop}`;
      const tempPassword = crypto.randomBytes(16).toString('hex');

      const { data: authData } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });

      if (!authData?.user) {
        return NextResponse.redirect(`${appUrl}/auth/login?error=user_creation_failed`);
      }

      userId = authData.user.id;

      await supabase.from('users').insert({
        id: userId,
        tenant_id: tenantId,
        email,
        full_name: shopInfo.name,
        role: 'admin',
        is_active: true,
      });

      // Send password reset so they can set their own password
      await supabase.auth.admin.generateLink({ type: 'recovery', email });
    }

    // Register webhooks
    const webhookBase = appUrl;
    const webhooks = [
      { topic: 'orders/create', address: `${webhookBase}/api/shopify/webhook` },
      { topic: 'app/uninstalled', address: `${webhookBase}/api/shopify/webhooks/app-uninstalled` },
    ];
    for (const wh of webhooks) {
      try { await client.createWebhook(wh.topic, wh.address); } catch { /* may exist */ }
    }

    // Sign the user in by redirecting to a login-with-token endpoint
    // For now, redirect to the Shopify onboarding or dashboard
    const redirectUrl = existingTenant
      ? `${appUrl}/dashboard`
      : `${appUrl}/onboarding`;

    const response = NextResponse.redirect(redirectUrl);
    // Clear the OAuth state cookie
    response.cookies.delete('shopify_oauth_state');

    return response;
  } catch (err) {
    console.error('Shopify OAuth callback error:', err);
    return NextResponse.redirect(`${appUrl}/auth/login?error=oauth_failed`);
  }
}
