import { describe, it, expect } from "vitest";
import { safeRedirect, shopDomain, isPublicPage } from "@/lib/security";

describe("redirect boundaries", () => {
  it.each([
    "//evil.test",
    "https://evil.test",
    "/\\evil.test",
    "/\nLocation: evil",
  ])("rejects %s", (value) => {
    expect(safeRedirect(value)).toBe("/dashboard");
  });
  it("preserves internal scanner routes", () =>
    expect(safeRedirect("/scan/find?sku=123")).toBe("/scan/find?sku=123"));
});
describe("Shopify request destinations", () => {
  it.each([
    "localhost",
    "127.0.0.1",
    "shop.myshopify.com.evil.test",
    "shop.myshopify.com@evil.test",
    "shop.myshopify.com/admin",
    "shop.myshopify.com:443",
  ])("rejects %s", (value) => expect(() => shopDomain(value)).toThrow());
  it("normalizes a Shopify domain", () =>
    expect(shopDomain("https://Test-Shop.myshopify.com/")).toBe(
      "test-shop.myshopify.com",
    ));
});
describe("public routes", () => {
  it.each(["/", "/demo", "/legal/privacy", "/support", "/guide"])(
    "allows %s",
    (path) => expect(isPublicPage(path)).toBe(true),
  );
  it.each(["/dashboard", "/demo/private", "/products", "/billing"])(
    "protects %s",
    (path) => expect(isPublicPage(path)).toBe(false),
  );
});

describe("scanner route boundaries", () => {
  it("does not confuse the manager scanner screen with staff routes", async () => {
    const { isScannerPath } = await import("@/lib/security");
    expect(isScannerPath("/scan")).toBe(true);
    expect(isScannerPath("/scan/find")).toBe(true);
    expect(isScannerPath("/scanner")).toBe(false);
    expect(isScannerPath("/scan-extra")).toBe(false);
  });
});
