import { createServiceClient } from '@/lib/supabase/service';
import { createShopifyClient } from '@/lib/shopify';
import { encryptToken, decryptToken } from '@/lib/shopify-crypto';
import { shopDomain } from '@/lib/security';

export async function saveShopifyConnection(tenantId: string, domain: string, token: string, name: string) {
  const { error } = await createServiceClient().rpc('save_shopify_connection', {
    p_tenant_id: tenantId, p_domain: shopDomain(domain), p_token: encryptToken(token), p_name: name,
  });
  if (error) throw error;
}

export async function loadShopifyConnection(tenantId: string) {
  const { data, error } = await createServiceClient().from('integration_credentials').select('shop_domain, encrypted_token').eq('tenant_id', tenantId).eq('provider', 'shopify').eq('connected', true).single();
  if (error || !data?.encrypted_token) throw new Error('Shopify is not connected');
  return createShopifyClient({ store_url: data.shop_domain, access_token: decryptToken(data.encrypted_token) });
}
