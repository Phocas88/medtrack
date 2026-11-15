import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyOAuth, verifyShopifyHmac } from '@/lib/shopify-webhooks';
import { encryptToken, decryptToken } from '@/lib/shopify-crypto';
const fixtureSecret = 'test-only-secret-not-a-real-provider-key';
afterEach(() => vi.unstubAllEnvs());
function signedOAuth() {
  const params = new URLSearchParams({ shop: 'fixture.myshopify.com', code: 'code-fixture', state: 'state-fixture', timestamp: String(Math.floor(Date.now() / 1000)) });
  const message = Array.from(params.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([key,value]) => `${key}=${value}`).join('&');
  params.set('hmac', createHmac('sha256',fixtureSecret).update(message).digest('hex'));
  return params;
}
describe('Shopify verification fails closed', () => {
  it('rejects events without a configured secret', () => { vi.stubEnv('SHOPIFY_API_SECRET',''); expect(verifyShopifyHmac('{}',null)).toBe(false); });
  it('accepts signed raw bytes and rejects modified content', () => {
    vi.stubEnv('SHOPIFY_API_SECRET', fixtureSecret);
    const signature = createHmac('sha256',fixtureSecret).update('{"id":1}').digest('base64');
    expect(verifyShopifyHmac('{"id":1}',signature)).toBe(true);
    expect(verifyShopifyHmac('{"id":2}',signature)).toBe(false);
  });
  it('requires state, shop binding and a valid HMAC', () => {
    vi.stubEnv('SHOPIFY_API_SECRET', fixtureSecret);
    const params = signedOAuth();
    expect(verifyOAuth(params,'state-fixture','fixture.myshopify.com')).toBe(true);
    expect(verifyOAuth(params,undefined,'fixture.myshopify.com')).toBe(false);
    expect(verifyOAuth(params,'different-state','fixture.myshopify.com')).toBe(false);
    expect(verifyOAuth(params,'state-fixture','other.myshopify.com')).toBe(false);
    params.delete('hmac'); expect(verifyOAuth(params,'state-fixture','fixture.myshopify.com')).toBe(false);
  });
  it('does not store or silently accept plaintext credentials', () => {
    vi.stubEnv('SHOPIFY_TOKEN_ENCRYPTION_KEY',''); expect(() => encryptToken('fixture')).toThrow();
    vi.stubEnv('SHOPIFY_TOKEN_ENCRYPTION_KEY', fixtureSecret);
    expect(() => decryptToken('plaintext-fixture')).toThrow();
    const encrypted = encryptToken('token-fixture');
    expect(encrypted).not.toContain('token-fixture'); expect(decryptToken(encrypted)).toBe('token-fixture');
    vi.stubEnv('SHOPIFY_TOKEN_ENCRYPTION_KEY','different-test-key'); expect(() => decryptToken(encrypted)).toThrow();
  });
});
