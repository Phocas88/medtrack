import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyOAuth, verifyShopifyHmac } from "@/lib/shopify-webhooks";
import { encryptToken, decryptToken } from "@/lib/shopify-crypto";
const fixtureSecret = "test-only-secret-not-a-real-provider-key";
afterEach(() => vi.unstubAllEnvs());
function signedOAuth() {
  const params = new URLSearchParams({
    shop: "fixture.myshopify.com",
    code: "code-fixture",
    state: "state-fixture",
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
  const message = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  params.set(
    "hmac",
    createHmac("sha256", fixtureSecret).update(message).digest("hex"),
  );
  return params;
}
describe("Shopify verification fails closed", () => {
  it("rejects events without a configured secret", () => {
    vi.stubEnv("SHOPIFY_API_SECRET", "");
    expect(verifyShopifyHmac("{}", null)).toBe(false);
  });
  it("accepts signed raw bytes and rejects modified content", () => {
    vi.stubEnv("SHOPIFY_API_SECRET", fixtureSecret);
    const signature = createHmac("sha256", fixtureSecret)
      .update('{"id":1}')
      .digest("base64");
    expect(verifyShopifyHmac('{"id":1}', signature)).toBe(true);
    expect(verifyShopifyHmac('{"id":2}', signature)).toBe(false);
  });
  it("requires state, shop binding and a valid HMAC", () => {
    vi.stubEnv("SHOPIFY_API_SECRET", fixtureSecret);
    const params = signedOAuth();
    expect(verifyOAuth(params, "state-fixture", "fixture.myshopify.com")).toBe(
      true,
    );
    expect(verifyOAuth(params, undefined, "fixture.myshopify.com")).toBe(false);
    expect(
      verifyOAuth(params, "different-state", "fixture.myshopify.com"),
    ).toBe(false);
    expect(verifyOAuth(params, "state-fixture", "other.myshopify.com")).toBe(
      false,
    );
    params.delete("hmac");
    expect(verifyOAuth(params, "state-fixture", "fixture.myshopify.com")).toBe(
      false,
    );
  });
  it("does not store or silently accept plaintext credentials", () => {
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "");
    expect(() => encryptToken("fixture")).toThrow();
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", fixtureSecret);
    expect(() => decryptToken("plaintext-fixture")).toThrow();
    const encrypted = encryptToken("token-fixture");
    expect(encrypted).not.toContain("token-fixture");
    expect(decryptToken(encrypted)).toBe("token-fixture");
    vi.stubEnv("SHOPIFY_TOKEN_ENCRYPTION_KEY", "different-test-key");
    expect(() => decryptToken(encrypted)).toThrow();
  });
});

describe("embedded Shopify identities", () => {
  it("binds short-lived signed tokens to the configured app and exact shop", async () => {
    const { verifyShopifySession } = await import("@/lib/shopify-session");
    vi.stubEnv("SHOPIFY_API_SECRET", fixtureSecret);
    vi.stubEnv("SHOPIFY_API_KEY", "app-fixture");
    const sign = (overrides: Record<string, unknown> = {}) => {
      const header = Buffer.from(
        JSON.stringify({ alg: "HS256", typ: "JWT" }),
      ).toString("base64url");
      const claims = Buffer.from(
        JSON.stringify({
          aud: "app-fixture",
          iss: "https://fixture.myshopify.com/admin",
          dest: "https://fixture.myshopify.com",
          sub: "123",
          iat: 1000,
          nbf: 1000,
          exp: 1060,
          ...overrides,
        }),
      ).toString("base64url");
      const data = `${header}.${claims}`;
      return `${data}.${createHmac("sha256", fixtureSecret).update(data).digest("base64url")}`;
    };
    expect(verifyShopifySession(sign(), 1020)).toEqual({
      shop: "fixture.myshopify.com",
      subject: "123",
    });
    for (const token of [
      sign({ aud: "other-app" }),
      sign({ dest: "https://attacker.test" }),
      sign({ iss: "https://other.myshopify.com/admin" }),
      sign({ exp: 1010 }),
      sign({ exp: 2000 }),
      sign({ sub: "not-a-user" }),
      sign() + ".extra",
    ])
      expect(() => verifyShopifySession(token, 1020)).toThrow(
        "Invalid Shopify session",
      );
  });
});

describe("Shopify installation launch", () => {
  it("requires a current signed launch before installation-state lookup", async () => {
    const { verifyShopifyLaunch } = await import("@/lib/shopify-webhooks");
    vi.stubEnv("SHOPIFY_API_SECRET", fixtureSecret);
    const params = signedOAuth();
    expect(verifyShopifyLaunch(params)).toBe(true);
    params.set("shop", "other.myshopify.com");
    expect(verifyShopifyLaunch(params)).toBe(false);
    expect(
      verifyShopifyLaunch(
        new URLSearchParams({ shop: "fixture.myshopify.com" }),
      ),
    ).toBe(false);
  });
});
