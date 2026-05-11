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

/**
 * Find tenant by Shopify shop domain.
 * Looks through all tenants' settings.shopify.shop_domain or store_url.
 */
export async function findTenantByShopDomain(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  shopDomain: string,
): Promise<{ id: string; settings: Record<string, unknown> } | null> {
  const { data: tenants } = await supabase.from('tenants').select('id, settings');

  const domain = shopDomain.toLowerCase().replace('https://', '').replace('http://', '').replace(/\/$/, '');

  for (const t of tenants || []) {
    const s = (t.settings as Record<string, unknown>) || {};
    const shopify = (s.shopify as Record<string, unknown>) || {};
    const storeUrl = ((shopify.store_url as string) || '').toLowerCase();
    const storedDomain = ((shopify.shop_domain as string) || '').toLowerCase();

    if (storedDomain === domain || storeUrl.includes(domain) || domain.includes(storeUrl.replace('.myshopify.com', ''))) {
      return { id: t.id, settings: s };
    }
  }

  return null;
}
