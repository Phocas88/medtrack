import { afterEach, describe, expect, it, vi } from "vitest";
import { createShopifyClient } from "@/lib/shopify";
import { escapeHtml } from "@/lib/html";
import { recoverLabel } from "@/lib/shipping";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const client = () =>
  createShopifyClient({
    store_url: "fixture.myshopify.com",
    access_token: "test-only",
  });
describe("provider reads and output safety", () => {
  it("escapes untrusted email content", () => {
    expect(escapeHtml('<a href="x">&\'')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
    );
  });
  it("uses only the bound GraphQL endpoint and variables", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            shop: {
              name: "Fixture",
              email: "fixture@example.test",
              myshopifyDomain: "fixture.myshopify.com",
              plan: { displayName: "Basic" },
            },
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    expect((await client().getShop()).shop.name).toBe("Fixture");
    expect(fetch.mock.calls[0][0]).toBe(
      "https://fixture.myshopify.com/admin/api/2026-10/graphql.json",
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body).query).toContain("query");
  });
  it("does not expose provider GraphQL error messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            errors: [{ message: "sensitive submitted text" }],
          }),
        ),
      ),
    );
    await expect(client().getProductCount()).rejects.toThrow(
      "Shopify GraphQL request was rejected",
    );
  });
  it("paginates locations with cursor variables", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              locations: {
                nodes: [{ id: "gid://shopify/Location/1", name: "One" }],
                pageInfo: { hasNextPage: true, endCursor: "next" },
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              locations: {
                nodes: [{ id: "gid://shopify/Location/2", name: "Two" }],
                pageInfo: { hasNextPage: false, endCursor: "end" },
              },
            },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    expect((await client().getLocations()).locations).toHaveLength(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body).variables.after).toBe(
      "next",
    );
  });
  it("recovery never posts another purchase", async () => {
    vi.stubEnv("EASYPOST_API_KEY", "test-only");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "shp_fixture", postage_label: null }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    expect(
      await recoverLabel("shp_fixture", "rate_fixture", "test-only"),
    ).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });
  it("rejects a recovered label for a different rate", async () => {
    vi.stubEnv("EASYPOST_API_KEY", "test-only");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "shp_fixture",
            tracking_code: "track",
            postage_label: { label_url: "https://example.test/label" },
            selected_rate: { id: "rate_other" },
          }),
        ),
      ),
    );
    await expect(
      recoverLabel("shp_fixture", "rate_fixture", "test-only"),
    ).rejects.toThrow("does not match");
  });
});

describe("shipping webhook authentication", () => {
  it("requires the exact signed body", async () => {
    const { verifyShippingWebhook } = await import("@/lib/shipping-webhooks");
    const { createHmac } = await import("node:crypto");
    const body = '{"description":"tracker.updated"}';
    const secret = "fixture-only";
    const signature = `hmac-sha256-hex=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyShippingWebhook(body, signature, secret)).toBe(true);
    expect(verifyShippingWebhook(body + " ", signature, secret)).toBe(false);
    expect(verifyShippingWebhook(body, null, secret)).toBe(false);
  });
});

describe("outbound Shopify safeguards", () => {
  it("refuses to fulfill quantities the warehouse did not ship", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            order: {
              fulfillmentOrders: {
                nodes: [
                  {
                    id: "gid://shopify/FulfillmentOrder/1",
                    status: "OPEN",
                    assignedLocation: {
                      location: { id: "gid://shopify/Location/1" },
                    },
                    lineItems: {
                      nodes: [
                        {
                          id: "gid://shopify/FulfillmentOrderLineItem/1",
                          remainingQuantity: 2,
                          lineItem: { sku: "SKU-1" },
                        },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      client().fulfillWarehouseOrder("123", { "SKU-1": 1 }, null, null),
    ).rejects.toThrow("quantities changed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("posts only the tracked split quantity and holds an uncertain retry", async () => {
    const pageInfo = { hasNextPage: false, endCursor: null };
    const emptyFulfillments = () => Response.json({ data: { order: { fulfillments: [] } } });
    const fetch = vi.fn()
      .mockResolvedValueOnce(emptyFulfillments())
      .mockResolvedValueOnce(Response.json({
        data: { order: { fulfillmentOrders: {
          nodes: [{
            id: "fulfillment-order-1",
            status: "OPEN",
            assignedLocation: { location: { id: "location-1" } },
            lineItems: { nodes: [{
              id: "line-1",
              remainingQuantity: 5,
              lineItem: { sku: "SKU-1" },
            }], pageInfo },
          }],
          pageInfo,
        } } },
      }))
      .mockResolvedValueOnce(Response.json({
        data: { fulfillmentCreate: { fulfillment: { id: "shipment-1" }, userErrors: [] } },
      }))
      .mockResolvedValueOnce(emptyFulfillments());
    const beforeMutation = vi.fn(async () => {
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    vi.stubGlobal("fetch", fetch);
    await client().fulfillWarehouseOrder("123", { "SKU-1": 2 }, "TRACK-1", null, {
      attempted: false,
      beforeMutation,
    });
    expect(JSON.parse(fetch.mock.calls[2][1].body).variables.fulfillment).toMatchObject({
      trackingInfo: { number: "TRACK-1" },
      lineItemsByFulfillmentOrder: [{
        fulfillmentOrderId: "fulfillment-order-1",
        fulfillmentOrderLineItems: [{ id: "line-1", quantity: 2 }],
      }],
    });
    await expect(client().fulfillWarehouseOrder("123", { "SKU-1": 2 }, "TRACK-1", null, {
      attempted: true,
      beforeMutation,
    })).rejects.toThrow("manual reconciliation");
    expect(beforeMutation).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("uses compare-and-set when publishing stock", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              inventoryItem: {
                inventoryLevel: {
                  quantities: [{ name: "available", quantity: 4 }],
                },
              },
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: { inventorySetQuantities: { userErrors: [] } },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await client().publishInventory(
      "gid://shopify/InventoryItem/1",
      "gid://shopify/Location/1",
      7,
      "gid://stokora/InventoryUpdate/fixture",
    );
    const variables = JSON.parse(fetch.mock.calls[1][1].body).variables;
    expect(variables.input.quantities[0]).toMatchObject({
      quantity: 7,
      compareQuantity: 4,
    });
    expect(variables.input.ignoreCompareQuantity).toBeUndefined();
  });
});

describe("tenant-paid shipping", () => {
  it("uses the tenant credential for recovery instead of a platform default", async () => {
    vi.stubEnv("EASYPOST_API_KEY", "platform-fixture");
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "shp_fixture", postage_label: null }),
        ),
      );
    vi.stubGlobal("fetch", fetch);
    await recoverLabel("shp_fixture", "rate_fixture", "tenant-fixture");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      `Basic ${Buffer.from("tenant-fixture:").toString("base64")}`,
    );
  });
});
