import { shopDomain as normalizeShop } from '@/lib/security';
import crypto from 'crypto';

/**
 * Verify Shopify webhook HMAC signature.
 * Shopify signs webhooks with the app's API secret using HMAC-SHA256.
 */
export function verifyShopifyHmac(
  body: string,
  hmacHeader: string | null,
): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !hmacHeader) return false;

  const computed = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed),
      Buffer.from(hmacHeader),
    );
  } catch {
    return false;
  }
}

export async function findTenantByShopDomain(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  domain: string,
): Promise<{ id: string; settings: Record<string, unknown> } | null> {
  let normalized: string;
  try { normalized = normalizeShop(domain); } catch { return null; }
  const { data: connection, error } = await supabase.from('integration_credentials').select('tenant_id').eq('provider', 'shopify').eq('shop_domain', normalized).maybeSingle();
  if (error) throw error;
  if (!connection) return null;
  const { data: tenant, error: tenantError } = await supabase.from('tenants').select('id,settings').eq('id', connection.tenant_id).single();
  if (tenantError) throw tenantError;
  return tenant;
}

export function verifyOAuth(params: URLSearchParams, state?: string, expectedShop?: string): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  const hmac = params.get('hmac');
  if (!secret || !hmac || !state || !expectedShop || params.get('state') !== state || !params.get('code')) return false;
  try {
    if (normalizeShop(params.get('shop') || '') !== expectedShop) return false;
    const timestamp = Number(params.get('timestamp'));
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 600) return false;
    const entries = Array.from(params.entries()).filter(([key]) => key !== 'hmac' && key !== 'signature').sort(([a], [b]) => a.localeCompare(b));
    const message = entries.map(([key, value]) => `${key}=${value}`).join('&');
    const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  } catch { return false; }
}
