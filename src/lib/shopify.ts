import { shopDomain } from "@/lib/security";

// Shopify Admin API helper for single-merchant integration

export interface ShopifyConfig {
  store_url: string; // e.g., "mystore.myshopify.com"
  access_token: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  variants: ShopifyVariant[];
  images: { src: string }[];
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string;
  price: string;
  inventory_item_id: number;
  inventory_quantity: number;
}

export interface ShopifyOrder {
  id: number;
  name: string; // "#1001"
  email: string;
  created_at: string;
  updated_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  cancelled_at?: string | null;
  total_price: string;
  line_items: {
    id: number;
    product_id: number;
    variant_id: number;
    title: string;
    sku: string;
    quantity: number;
    fulfillable_quantity?: number;
    price: string;
  }[];
  shipping_address?: {
    name: string;
    address1: string;
    city: string;
    province: string;
    zip: string;
    country: string;
  };
  customer?: {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
  };
}

type Page<T> = {
  nodes: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};
type GVariant = {
  id: string;
  title: string;
  sku: string | null;
  price: string;
  inventoryQuantity: number;
  inventoryItem: { id: string };
};
type GProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  images: { nodes: { url: string }[] };
  variants: Page<GVariant>;
};
type GLine = {
  id: string;
  title: string;
  sku: string | null;
  quantity: number;
  unfulfilledQuantity: number;
  product: { id: string } | null;
  variant: { id: string } | null;
  originalUnitPriceSet: { shopMoney: { amount: string } };
};
type GOrder = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  totalPriceSet: { shopMoney: { amount: string } };
  customer: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  shippingAddress: {
    name: string;
    address1: string;
    city: string;
    province: string;
    zip: string;
    country: string;
  } | null;
  lineItems: Page<GLine>;
};
const pageFields = "pageInfo { hasNextPage endCursor }";
const variantFields =
  "id title sku price inventoryQuantity inventoryItem { id }";
const lineFields =
  "id title sku quantity unfulfilledQuantity product { id } variant { id } originalUnitPriceSet { shopMoney { amount } }";
const orderFields = `id name email createdAt updatedAt cancelledAt displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount } } customer { id email firstName lastName } shippingAddress { name address1 city province zip country } lineItems(first:250) { nodes { ${lineFields} } ${pageFields} }`;
function legacyId(gid: string): number {
  const id = Number(gid.split("/").pop());
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new Error("Unsupported Shopify identifier");
  return id;
}

class ShopifyClient {
  private url: string;
  private headers: Record<string, string>;
  constructor(config: ShopifyConfig) {
    this.url = `https://${shopDomain(config.store_url)}/admin/api/2026-10/graphql.json`;
    this.headers = {
      "X-Shopify-Access-Token": config.access_token,
      "Content-Type": "application/json",
    };
  }
  async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const readOnly = query.trim().startsWith("query");
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(this.url, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      });
      if (!response.ok) {
        if (
          readOnly &&
          (response.status === 429 || response.status >= 500) &&
          attempt < 3
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(6000, 500 * 2 ** attempt)),
          );
          continue;
        }
        throw new Error(`Shopify request failed (${response.status})`);
      }
      const body = await response.json();
      if (body.errors?.length) {
        if (
          readOnly &&
          body.errors.every(
            (error: { extensions?: { code?: string } }) =>
              error.extensions?.code === "THROTTLED",
          ) &&
          attempt < 3
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * 2 ** attempt),
          );
          continue;
        }
        // Provider messages can contain submitted data; keep them out of responses and logs.
        throw new Error("Shopify GraphQL request was rejected");
      }
      if (!body.data) throw new Error("Shopify returned no data");
      return body.data as T;
    }
    throw new Error("Shopify request retry limit reached");
  }
  private async collect<T>(
    load: (cursor: string | null) => Promise<Page<T>>,
  ): Promise<T[]> {
    const result: T[] = [];
    const seen = new Set<string>();
    let cursor: string | null = null;
    while (true) {
      const page = await load(cursor);
      result.push(...page.nodes);
      if (!page.pageInfo.hasNextPage) return result;
      const next = page.pageInfo.endCursor;
      if (!next || seen.has(next))
        throw new Error("Invalid Shopify pagination cursor");
      seen.add(next);
      cursor = next;
    }
  }
  async getShop() {
    const { shop } = await this.graphql<{
      shop: {
        name: string;
        email: string;
        myshopifyDomain: string;
        plan: { displayName: string };
      };
    }>("query { shop { name email myshopifyDomain plan { displayName } } }");
    return {
      shop: {
        name: shop.name,
        email: shop.email,
        domain: shop.myshopifyDomain,
        plan_name: shop.plan.displayName,
      },
    };
  }
  async getProductCount() {
    const data = await this.graphql<{ productsCount: { count: number } }>(
      "query { productsCount { count } }",
    );
    return data.productsCount;
  }
  async getOrderCount() {
    const data = await this.graphql<{ ordersCount: { count: number } }>(
      "query { ordersCount { count } }",
    );
    return data.ordersCount;
  }
  async getProducts(limit = 50): Promise<{ products: ShopifyProduct[] }> {
    const rows = await this.collect<GProduct>(
      async (cursor) =>
        (
          await this.graphql<{ products: Page<GProduct> }>(
            `query($first:Int!,$after:String) { products(first:$first,after:$after) { nodes { id title handle vendor productType images(first:1) { nodes { url } } variants(first:250) { nodes { ${variantFields} } ${pageFields} } } ${pageFields} } }`,
            { first: Math.min(50, Math.max(1, limit)), after: cursor },
          )
        ).products,
    );
    const products: ShopifyProduct[] = [];
    for (const row of rows) {
      let variants = row.variants.nodes;
      if (row.variants.pageInfo.hasNextPage)
        variants = await this.collect<GVariant>(async (cursor) => {
          const data = await this.graphql<{
            product: { variants: Page<GVariant> };
          }>(
            `query($id:ID!,$after:String){product(id:$id){variants(first:250,after:$after){nodes{${variantFields}} ${pageFields}}}}`,
            { id: row.id, after: cursor },
          );
          return data.product.variants;
        });
      products.push({
        id: legacyId(row.id),
        title: row.title,
        handle: row.handle,
        vendor: row.vendor,
        product_type: row.productType,
        images: row.images.nodes.map((image) => ({ src: image.url })),
        variants: variants.map((variant) => ({
          id: legacyId(variant.id),
          product_id: legacyId(row.id),
          title: variant.title,
          sku: variant.sku || "",
          price: variant.price,
          inventory_item_id: legacyId(variant.inventoryItem.id),
          inventory_quantity: variant.inventoryQuantity,
        })),
      });
    }
    return { products };
  }
  private async normalizeOrder(row: GOrder): Promise<ShopifyOrder> {
    let lines = row.lineItems.nodes;
    if (row.lineItems.pageInfo.hasNextPage)
      lines = await this.collect<GLine>(async (cursor) => {
        const data = await this.graphql<{ order: { lineItems: Page<GLine> } }>(
          `query($id:ID!,$after:String){order(id:$id){lineItems(first:250,after:$after){nodes{${lineFields}} ${pageFields}}}}`,
          { id: row.id, after: cursor },
        );
        return data.order.lineItems;
      });
    return {
      id: legacyId(row.id),
      cancelled_at: row.cancelledAt,
      name: row.name,
      email: row.email || "",
      created_at: row.createdAt,
      updated_at: row.updatedAt,
      financial_status: row.cancelledAt
        ? "voided"
        : (row.displayFinancialStatus || "pending").toLowerCase(),
      fulfillment_status:
        row.displayFulfillmentStatus === "FULFILLED"
          ? "fulfilled"
          : row.displayFulfillmentStatus === "PARTIALLY_FULFILLED"
            ? "partial"
            : null,
      total_price: row.totalPriceSet.shopMoney.amount,
      shipping_address: row.shippingAddress || undefined,
      customer: row.customer
        ? {
            id: legacyId(row.customer.id),
            email: row.customer.email,
            first_name: row.customer.firstName,
            last_name: row.customer.lastName,
          }
        : undefined,
      line_items: lines.map((line) => ({
        id: legacyId(line.id),
        product_id: line.product ? legacyId(line.product.id) : 0,
        variant_id: line.variant ? legacyId(line.variant.id) : 0,
        title: line.title,
        sku: line.sku || "",
        quantity: line.quantity,
        fulfillable_quantity: line.unfulfilledQuantity,
        price: line.originalUnitPriceSet.shopMoney.amount,
      })),
    };
  }
  async getOrder(id: string): Promise<{ order: ShopifyOrder }> {
    if (!/^\d+$/.test(id)) throw new Error("Invalid Shopify order ID");
    const data = await this.graphql<{ order: GOrder | null }>(
      `query($id:ID!){order(id:$id){${orderFields}}}`,
      { id: `gid://shopify/Order/${id}` },
    );
    if (!data.order) throw new Error("Shopify order not found");
    return { order: await this.normalizeOrder(data.order) };
  }
  async getOrders(
    status = "any",
    limit = 50,
  ): Promise<{ orders: ShopifyOrder[] }> {
    if (!["any", "open", "closed", "cancelled"].includes(status))
      throw new Error("Invalid Shopify order status");
    const rows = await this.collect<GOrder>(
      async (cursor) =>
        (
          await this.graphql<{ orders: Page<GOrder> }>(
            `query($first:Int!,$after:String,$query:String){orders(first:$first,after:$after,query:$query){nodes{${orderFields}} ${pageFields}}}`,
            {
              first: Math.min(50, Math.max(1, limit)),
              after: cursor,
              query: status === "any" ? null : `status:${status}`,
            },
          )
        ).orders,
    );
    const orders: ShopifyOrder[] = [];
    for (const row of rows) orders.push(await this.normalizeOrder(row));
    return { orders };
  }
  async fulfillWarehouseOrder(
    orderId: string,
    shipped: Record<string, number>,
    tracking: string | null,
    carrier: string | null,
  ) {
    if (!/^\d+$/.test(orderId)) throw new Error("Invalid Shopify order ID");
    type FulfillmentLine = {
      id: string;
      remainingQuantity: number;
      lineItem: { sku: string | null };
    };
    type FulfillmentOrder = {
      id: string;
      status: string;
      assignedLocation: { location: { id: string } | null };
      lineItems: Page<FulfillmentLine>;
    };
    const fields = `id status assignedLocation{location{id}} lineItems(first:250){nodes{id remainingQuantity lineItem{sku}} ${pageFields}}`;
    const groups = await this.collect<FulfillmentOrder>(
      async (after) =>
        (
          await this.graphql<{
            order: { fulfillmentOrders: Page<FulfillmentOrder> };
          }>(
            `query($id:ID!,$after:String){order(id:$id){fulfillmentOrders(first:100,after:$after){nodes{${fields}} ${pageFields}}}}`,
            { id: `gid://shopify/Order/${orderId}`, after },
          )
        ).order.fulfillmentOrders,
    );
    const byLocation = new Map<
      string,
      {
        fulfillmentOrderId: string;
        fulfillmentOrderLineItems: { id: string; quantity: number }[];
      }[]
    >();
    const needed: Record<string, number> = {};
    for (const group of groups) {
      let lines = group.lineItems.nodes;
      if (group.lineItems.pageInfo.hasNextPage)
        lines = await this.collect<FulfillmentLine>(
          async (after) =>
            (
              await this.graphql<{
                fulfillmentOrder: { lineItems: Page<FulfillmentLine> };
              }>(
                `query($id:ID!,$after:String){fulfillmentOrder(id:$id){lineItems(first:250,after:$after){nodes{id remainingQuantity lineItem{sku}} ${pageFields}}}}`,
                { id: group.id, after },
              )
            ).fulfillmentOrder.lineItems,
        );
      const pending = lines.filter((line) => line.remainingQuantity > 0);
      if (!pending.length) continue;
      if (
        !["OPEN", "IN_PROGRESS"].includes(group.status) ||
        !group.assignedLocation.location
      )
        throw new Error(
          "Resolve Shopify fulfillment holds or assignments before retrying",
        );
      for (const line of pending) {
        const sku = line.lineItem.sku;
        if (!sku || !Number.isInteger(shipped[sku]))
          throw new Error("Fulfillment SKU is not in the warehouse shipment");
        needed[sku] = (needed[sku] || 0) + line.remainingQuantity;
      }
      const location = group.assignedLocation.location.id;
      const entries = byLocation.get(location) || [];
      entries.push({
        fulfillmentOrderId: group.id,
        fulfillmentOrderLineItems: pending.map((line) => ({
          id: line.id,
          quantity: line.remainingQuantity,
        })),
      });
      byLocation.set(location, entries);
    }
    for (const [sku, quantity] of Object.entries(needed))
      if (quantity > shipped[sku])
        throw new Error(
          "Shopify quantities changed after warehouse shipment; reconcile before retrying",
        );
    for (const entries of Array.from(byLocation.values())) {
      const data = await this.graphql<{
        fulfillmentCreate: {
          fulfillment: { id: string } | null;
          userErrors: { message: string }[];
        };
      }>(
        "mutation($fulfillment:FulfillmentInput!){fulfillmentCreate(fulfillment:$fulfillment){fulfillment{id} userErrors{message}}}",
        {
          fulfillment: {
            notifyCustomer: false,
            lineItemsByFulfillmentOrder: entries,
            ...(tracking
              ? {
                  trackingInfo: {
                    number: tracking,
                    ...(carrier ? { company: carrier } : {}),
                  },
                }
              : {}),
          },
        },
      );
      if (
        data.fulfillmentCreate.userErrors.length ||
        !data.fulfillmentCreate.fulfillment
      )
        throw new Error(
          "Shopify fulfillment rejected. Review assignment, quantities and tracking.",
        );
    }
  }
  async inventoryQuantity(item: string, location: string): Promise<number> {
    const data = await this.graphql<{
      inventoryItem: {
        inventoryLevel: {
          quantities: { name: string; quantity: number }[];
        } | null;
      } | null;
    }>(
      'query($item:ID!,$location:ID!){inventoryItem(id:$item){inventoryLevel(locationId:$location){quantities(names:["available"]){name quantity}}}}',
      { item, location },
    );
    const available = data.inventoryItem?.inventoryLevel?.quantities.find(
      (row) => row.name === "available",
    );
    if (!available)
      throw new Error(
        "Enable inventory tracking at the selected Shopify location first",
      );
    return available.quantity;
  }
  async publishInventory(
    item: string,
    location: string,
    quantity: number,
    reference: string,
    expectedQuantity?: number,
  ) {
    const current =
      expectedQuantity ?? (await this.inventoryQuantity(item, location));
    if (current === quantity) return;
    const data = await this.graphql<{
      inventorySetQuantities: { userErrors: { message: string }[] };
    }>(
      "mutation($input:InventorySetQuantitiesInput!){inventorySetQuantities(input:$input){userErrors{message}}}",
      {
        input: {
          name: "available",
          reason: "correction",
          referenceDocumentUri: reference,
          quantities: [
            {
              inventoryItemId: item,
              locationId: location,
              quantity,
              compareQuantity: current,
            },
          ],
        },
      },
    );
    if (data.inventorySetQuantities.userErrors.length)
      throw new Error(
        "Shopify inventory update rejected; reconciliation will retry",
      );
  }
  async getLocations() {
    const rows = await this.collect<{ id: string; name: string }>(
      async (cursor) =>
        (
          await this.graphql<{ locations: Page<{ id: string; name: string }> }>(
            `query($after:String){locations(first:100,after:$after){nodes{id name} ${pageFields}}}`,
            { after: cursor },
          )
        ).locations,
    );
    return {
      locations: rows.map((row) => ({ id: legacyId(row.id), name: row.name })),
    };
  }
}

export function createShopifyClient(config: ShopifyConfig): ShopifyClient {
  return new ShopifyClient(config);
}
