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
    const topic = request.headers.get('x-shopify-topic');
    const shopDomain = request.headers.get('x-shopify-shop-domain');

    // Verify HMAC — if SHOPIFY_API_SECRET is set, enforce it
    if (process.env.SHOPIFY_API_SECRET) {
      if (!verifyShopifyHmac(rawBody, hmac)) {
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    const supabase = svc();

    // Find tenant
    const tenant = shopDomain ? await findTenantByShopDomain(supabase, shopDomain) : null;

    // ────────────────────────────────────────────
    // customers/data_request
    // Merchant's customer requests their data
    // ────────────────────────────────────────────
    if (topic === 'customers/data_request') {
      await supabase.from('gdpr_requests').insert({
        tenant_id: tenant?.id || null,
        shop_domain: shopDomain,
        request_type: 'data_request',
        payload: body,
        status: 'pending',
      });

      // If we have the tenant, find and compile customer data
      if (tenant) {
        const customerEmails: string[] = [];
        if (body.customer?.email) customerEmails.push(body.customer.email);
        if (body.orders_requested) {
          // Shopify sends order IDs — we'd look up by reference
        }

        // Notify tenant admin
        const { data: admin } = await supabase
          .from('users')
          .select('email')
          .eq('tenant_id', tenant.id)
          .eq('role', 'admin')
          .limit(1);

        if (admin?.[0]?.email) {
          // Log notification — actual email send requires Resend key
          console.log(`GDPR data request: notify ${admin[0].email} for customer ${body.customer?.email}`);
        }
      }

      return NextResponse.json({ status: 'received', action: 'data_request_logged' });
    }

    // ────────────────────────────────────────────
    // customers/redact
    // Merchant's customer requests deletion of their data
    // ────────────────────────────────────────────
    if (topic === 'customers/redact') {
      const customerEmail = body.customer?.email;

      if (tenant && customerEmail) {
        // Anonymize customer record
        const { data: customers } = await supabase
          .from('customers')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('email', customerEmail);

        for (const cust of customers || []) {
          // Anonymize the customer
          await supabase.from('customers').update({
            name: 'REDACTED',
            contact_name: null,
            email: null,
            phone: null,
            ship_to_address: null,
            notes: null,
          }).eq('id', cust.id);

          // Anonymize ship-to on related orders (keep financial records)
          await supabase.from('sales_orders').update({
            ship_to_name: 'REDACTED',
            ship_to_address: null,
          }).eq('customer_id', cust.id).eq('tenant_id', tenant.id);
        }
      }

      await supabase.from('gdpr_requests').insert({
        tenant_id: tenant?.id || null,
        shop_domain: shopDomain,
        request_type: 'customer_redact',
        payload: body,
        status: 'completed',
      });

      return NextResponse.json({ status: 'received', action: 'customer_redacted' });
    }

    // ────────────────────────────────────────────
    // shop/redact
    // 48 hours after merchant uninstalls — delete tenant data
    // ────────────────────────────────────────────
    if (topic === 'shop/redact') {
      if (tenant) {
        // Anonymize all customers for this tenant
        await supabase.from('customers').update({
          name: 'REDACTED',
          contact_name: null,
          email: null,
          phone: null,
          ship_to_address: null,
          notes: null,
        }).eq('tenant_id', tenant.id);

        // Clear Shopify config
        const settings = tenant.settings || {};
        delete (settings as Record<string, unknown>).shopify;
        await supabase.from('tenants').update({
          settings,
          updated_at: new Date().toISOString(),
        }).eq('id', tenant.id);

        // Anonymize ship-to on all orders
        await supabase.from('sales_orders').update({
          ship_to_name: 'REDACTED',
          ship_to_address: null,
        }).eq('tenant_id', tenant.id);
      }

      await supabase.from('gdpr_requests').insert({
        tenant_id: tenant?.id || null,
        shop_domain: shopDomain,
        request_type: 'shop_redact',
        payload: body,
        status: 'completed',
      });

      return NextResponse.json({ status: 'received', action: 'shop_redacted' });
    }

    return NextResponse.json({ status: 'unhandled_topic', topic });
  } catch (err) {
    console.error('GDPR webhook error:', err);
    // Always return 200 to Shopify — they retry on non-2xx
    return NextResponse.json({ status: 'error', message: String(err) }, { status: 200 });
  }
}
