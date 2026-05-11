import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyShopifyHmac, findTenantByShopDomain } from '@/lib/shopify-webhooks';

function svc() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const hmac = request.headers.get('x-shopify-hmac-sha256');
    const shopDomain = request.headers.get('x-shopify-shop-domain');

    // Verify HMAC
    if (process.env.SHOPIFY_API_SECRET) {
      if (!verifyShopifyHmac(rawBody, hmac)) {
        return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 });
      }
    }

    const supabase = svc();
    const tenant = shopDomain ? await findTenantByShopDomain(supabase, shopDomain) : null;

    if (!tenant) {
      return NextResponse.json({ status: 'tenant_not_found' });
    }

    // Update Shopify config — mark as disconnected, don't delete data
    const settings = tenant.settings || {};
    const shopify = ((settings as Record<string, unknown>).shopify as Record<string, unknown>) || {};
    shopify.connected = false;
    shopify.uninstalled_at = new Date().toISOString();
    // Keep access_token and other config for potential reinstall
    (settings as Record<string, unknown>).shopify = shopify;

    await supabase.from('tenants').update({ settings }).eq('id', tenant.id);

    // Log event
    await supabase.from('gdpr_requests').insert({
      tenant_id: tenant.id,
      shop_domain: shopDomain,
      request_type: 'app_uninstalled',
      payload: JSON.parse(rawBody),
      status: 'completed',
    });

    // Notify tenant admin
    const { data: admin } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('tenant_id', tenant.id)
      .eq('role', 'admin')
      .limit(1);

    if (admin?.[0]?.email) {
      // Send notification email if Resend is configured
      const resendKey = process.env.RESEND_API_KEY;
      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `Stokora WMS <notifications@${process.env.NEXT_PUBLIC_APP_DOMAIN || 'stokora.com'}>`,
            to: admin[0].email,
            subject: 'Shopify Integration Disconnected',
            html: `
              <p>Hi ${admin[0].full_name || 'there'},</p>
              <p>Your Shopify integration for <strong>${shopDomain}</strong> has been disconnected.</p>
              <p>Your Stokora account and all your data remain active. You can reconnect anytime from <strong>Settings → Integrations → Shopify</strong>.</p>
              <p>If you didn't intend to uninstall, you can reinstall from the Shopify App Store.</p>
              <p>— Stokora WMS</p>
            `,
          }),
        }).catch(() => {}); // best-effort
      }

      console.log(`App uninstalled: notified ${admin[0].email} for shop ${shopDomain}`);
    }

    return NextResponse.json({ status: 'received', action: 'app_uninstalled_processed' });
  } catch (err) {
    console.error('App uninstalled webhook error:', err);
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}
