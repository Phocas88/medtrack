import { test, expect } from "@playwright/test";
test.describe("commercial upgrade boundaries", () => {
  for (const path of [
    "/api/orders",
    "/api/shipping/account",
    "/api/quickbooks/status",
    "/api/shopify/inventory",
    "/api/shopify/jobs",
  ])
    test(`${path} requires authentication`, async ({ request }) => {
      expect((await request.get(path)).status()).toBe(401);
    });
  test("embedded shell uses App Bridge and Polaris with the exact shop frame policy", async ({
    request,
  }) => {
    const response = await request.get("/shopify?shop=fixture.myshopify.com");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("shopifycloud/app-bridge.js");
    expect(html).toContain("shopifycloud/polaris.js");
    expect(response.headers()["x-frame-options"]).toBeUndefined();
    expect(response.headers()["content-security-policy"]).toContain(
      "frame-ancestors https://fixture.myshopify.com https://admin.shopify.com",
    );
  });
  test("unbound Shopify shell cannot be framed", async ({ request }) => {
    const response = await request.get("/shopify");
    expect(response.headers()["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
  });
  test("integration worker fails closed", async ({ request }) => {
    const response = await request.get("/api/cron/integrations");
    expect([401, 503]).toContain(response.status());
  });
  test("preview filtering and order inspection work with clearly labeled samples", async ({
    page,
  }) => {
    await page.goto("/demo/workspace");
    await expect(
      page.getByText("Sample orders only.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "On hold" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByRole("button", { name: "SO-1046", exact: true }).click();
    await expect(
      page.getByRole("complementary", { name: "Order details" }),
    ).toContainText("Stock shortage");
    await page.getByRole("tab", { name: "All orders" }).click();
    await page.getByRole("textbox", { name: "Find an order" }).fill("Mira");
    await expect(page.locator("tbody tr")).toHaveCount(1);
  });
  test("demo does not advertise fabricated feature-completeness scores", async ({
    page,
  }) => {
    await page.goto("/demo");
    await expect(
      page.getByRole("link", { name: "Enter the warehouse demo" }),
    ).toBeVisible();
    await expect(page.getByText("100%", { exact: true })).toHaveCount(0);
  });
});
