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
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  line_items: {
    id: number;
    product_id: number;
    variant_id: number;
    title: string;
    sku: string;
    quantity: number;
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

class ShopifyClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ShopifyConfig) {
    const store = config.store_url.replace('https://', '').replace('http://', '').replace(/\/$/, '');
    this.baseUrl = `https://${store}/admin/api/2025-01`; // Latest stable API version
    this.headers = {
      'X-Shopify-Access-Token': config.access_token,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(path: string, options?: RequestInit, retries = 3): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { ...this.headers, ...options?.headers },
    });

    // Handle rate limiting with exponential backoff
    if (res.status === 429 && retries > 0) {
      const retryAfter = parseFloat(res.headers.get('Retry-After') || '2');
      const waitMs = retryAfter * 1000 * (4 - retries); // exponential backoff
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.request<T>(path, options, retries - 1);
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Shopify API error (${res.status}): ${err}`);
    }
    return res.json();
  }

  // ── Shop Info ──
  async getShop(): Promise<{ shop: { name: string; email: string; domain: string; plan_name: string } }> {
    return this.request('/shop.json');
  }

  // ── Products ──
  async getProducts(limit = 50): Promise<{ products: ShopifyProduct[] }> {
    return this.request(`/products.json?limit=${limit}`);
  }

  async getProductCount(): Promise<{ count: number }> {
    return this.request('/products/count.json');
  }

  // ── Orders ──
  async getOrders(status = 'any', limit = 50): Promise<{ orders: ShopifyOrder[] }> {
    return this.request(`/orders.json?status=${status}&limit=${limit}`);
  }

  async getOrderCount(): Promise<{ count: number }> {
    return this.request('/orders/count.json?status=any');
  }

  // ── Inventory ──
  async setInventoryLevel(inventoryItemId: number, locationId: number, quantity: number): Promise<unknown> {
    return this.request('/inventory_levels/set.json', {
      method: 'POST',
      body: JSON.stringify({
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        available: quantity,
      }),
    });
  }

  async getLocations(): Promise<{ locations: { id: number; name: string }[] }> {
    return this.request('/locations.json');
  }

  // ── Webhooks ──
  async createWebhook(topic: string, address: string): Promise<unknown> {
    return this.request('/webhooks.json', {
      method: 'POST',
      body: JSON.stringify({
        webhook: { topic, address, format: 'json' },
      }),
    });
  }

  async getWebhooks(): Promise<{ webhooks: { id: number; topic: string; address: string }[] }> {
    return this.request('/webhooks.json');
  }

  // ── Fulfillment ──
  async createFulfillment(orderId: number, trackingNumber: string | null, lineItems: { id: number }[]): Promise<unknown> {
    return this.request(`/orders/${orderId}/fulfillments.json`, {
      method: 'POST',
      body: JSON.stringify({
        fulfillment: {
          tracking_number: trackingNumber,
          line_items: lineItems,
          notify_customer: true,
        },
      }),
    });
  }
}

export function createShopifyClient(config: ShopifyConfig): ShopifyClient {
  return new ShopifyClient(config);
}
