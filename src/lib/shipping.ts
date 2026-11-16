// EasyPost shipping integration
// Docs: https://docs.easypost.com/docs

const EASYPOST_BASE = "https://api.easypost.com/v2";

function authHeaders(key: string): Record<string, string> {
  if (!key) throw new Error("Shipping account key required");
  return {
    Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

async function post(path: string, body: unknown, key: string) {
  const res = await fetch(`${EASYPOST_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(key),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `EasyPost error: ${res.status}`);
  }
  return res.json();
}

async function get(path: string, key: string) {
  const res = await fetch(`${EASYPOST_BASE}${path}`, {
    headers: authHeaders(key),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`EasyPost error: ${res.status}`);
  return res.json();
}

// ── Address ──
export interface ShippingAddress {
  name: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string;
  email?: string;
}

// ── Parcel ──
export interface Parcel {
  length: number; // inches
  width: number;
  height: number;
  weight: number; // oz
}

// ── Rate ──
export interface ShippingRate {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency?: string;
  delivery_days: number | null;
  est_delivery_date: string | null;
}

// ── Shipment Result ──
export interface ShipmentResult {
  id: string;
  tracking_code: string;
  label_url: string;
  rate: ShippingRate;
  tracker_id: string;
}

// ── Create Shipment & Get Rates ──
export async function getRates(
  from: ShippingAddress,
  to: ShippingAddress,
  parcel: Parcel,
  key: string,
): Promise<{ shipment_id: string; rates: ShippingRate[] }> {
  const data = await post(
    "/shipments",
    {
      shipment: {
        from_address: { ...from, country: from.country || "US" },
        to_address: { ...to, country: to.country || "US" },
        parcel,
      },
    },
    key,
  );

  const rates: ShippingRate[] = (data.rates || [])
    .map((r: Record<string, unknown>) => ({
      id: r.id as string,
      carrier: r.carrier as string,
      service: r.service as string,
      rate: r.rate as string,
      currency: r.currency as string,
      delivery_days: r.delivery_days as number | null,
      est_delivery_date: r.est_delivery_date as string | null,
    }))
    .sort(
      (a: ShippingRate, b: ShippingRate) =>
        parseFloat(a.rate) - parseFloat(b.rate),
    );

  return { shipment_id: data.id, rates };
}

// ── Buy Label ──
export async function buyLabel(
  shipmentId: string,
  rateId: string,
  key: string,
): Promise<ShipmentResult> {
  const data = await post(
    `/shipments/${shipmentId}/buy`,
    {
      rate: { id: rateId },
    },
    key,
  );

  return labelResult(data, rateId);
}

function labelResult(
  data: {
    id: string;
    tracking_code: string;
    postage_label?: { label_url?: string };
    selected_rate?: Partial<ShippingRate>;
    tracker?: { id?: string };
  },
  rateId: string,
): ShipmentResult {
  if (
    !data.postage_label?.label_url ||
    !data.tracking_code ||
    data.selected_rate?.id !== rateId ||
    !data.selected_rate.carrier ||
    !data.selected_rate.service ||
    typeof data.selected_rate.rate !== "string" ||
    !Number.isFinite(Number(data.selected_rate.rate)) ||
    Number(data.selected_rate.rate) < 0
  )
    throw new Error(
      "Incomplete provider label response; recover the original shipment",
    );
  return {
    id: data.id,
    tracking_code: data.tracking_code,
    label_url: data.postage_label?.label_url || "",
    rate: {
      id: data.selected_rate?.id || rateId,
      carrier: data.selected_rate?.carrier || "",
      service: data.selected_rate?.service || "",
      rate: data.selected_rate?.rate || "0",
      currency: data.selected_rate?.currency,
      delivery_days: data.selected_rate?.delivery_days || null,
      est_delivery_date: data.selected_rate?.est_delivery_date || null,
    },
    tracker_id: data.tracker?.id || "",
  };
}

/** Recovery only reads the existing provider shipment; it never issues another charge. */
export async function recoverLabel(
  shipmentId: string,
  rateId: string,
  key: string,
): Promise<ShipmentResult | null> {
  const data = await get(`/shipments/${shipmentId}`, key);
  if (!data.postage_label?.label_url || !data.tracking_code) return null;
  if (data.selected_rate?.id !== rateId)
    throw new Error("Recovered label does not match the selected rate");
  return labelResult(data, rateId);
}

// ── Track Package ──
export async function getTracking(trackerId: string, key: string) {
  return get(`/trackers/${trackerId}`, key);
}

export async function registerShippingWebhook(
  url: string,
  secret: string,
  key: string,
): Promise<string> {
  const result = await post(
    "/webhooks",
    { webhook: { url, webhook_secret: secret } },
    key,
  );
  if (typeof result.id !== "string")
    throw new Error("Webhook registration failed");
  return result.id;
}
export async function validateShippingAccount(key: string): Promise<void> {
  await get("/carrier_accounts", key);
}
