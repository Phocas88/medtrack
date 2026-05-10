// EasyPost shipping integration
// Docs: https://docs.easypost.com/docs

const EASYPOST_BASE = 'https://api.easypost.com/v2';

function getApiKey(): string | null {
  return process.env.EASYPOST_API_KEY || null;
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  if (!key) throw new Error('EASYPOST_API_KEY not configured');
  return {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${EASYPOST_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `EasyPost error: ${res.status}`);
  }
  return res.json();
}

async function get(path: string) {
  const res = await fetch(`${EASYPOST_BASE}${path}`, { headers: authHeaders() });
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
  parcel: Parcel
): Promise<{ shipment_id: string; rates: ShippingRate[] }> {
  const data = await post('/shipments', {
    shipment: {
      from_address: { ...from, country: from.country || 'US' },
      to_address: { ...to, country: to.country || 'US' },
      parcel,
    },
  });

  const rates: ShippingRate[] = (data.rates || [])
    .map((r: Record<string, unknown>) => ({
      id: r.id as string,
      carrier: r.carrier as string,
      service: r.service as string,
      rate: r.rate as string,
      delivery_days: r.delivery_days as number | null,
      est_delivery_date: r.est_delivery_date as string | null,
    }))
    .sort((a: ShippingRate, b: ShippingRate) => parseFloat(a.rate) - parseFloat(b.rate));

  return { shipment_id: data.id, rates };
}

// ── Buy Label ──
export async function buyLabel(shipmentId: string, rateId: string): Promise<ShipmentResult> {
  const data = await post(`/shipments/${shipmentId}/buy`, {
    rate: { id: rateId },
  });

  return {
    id: data.id,
    tracking_code: data.tracking_code,
    label_url: data.postage_label?.label_url || '',
    rate: {
      id: rateId,
      carrier: data.selected_rate?.carrier || '',
      service: data.selected_rate?.service || '',
      rate: data.selected_rate?.rate || '0',
      delivery_days: data.selected_rate?.delivery_days || null,
      est_delivery_date: data.selected_rate?.est_delivery_date || null,
    },
    tracker_id: data.tracker?.id || '',
  };
}

// ── Track Package ──
export async function getTracking(trackerId: string) {
  return get(`/trackers/${trackerId}`);
}

// ── Schedule Pickup ──
export async function schedulePickup(
  shipmentId: string,
  address: ShippingAddress,
  minDate: string, // "2026-05-10"
  maxDate: string,
) {
  return post('/pickups', {
    pickup: {
      address: { ...address, country: address.country || 'US' },
      shipment: { id: shipmentId },
      min_datetime: `${minDate}T08:00:00Z`,
      max_datetime: `${maxDate}T18:00:00Z`,
      instructions: 'Package at front door',
    },
  });
}

// ── Buy Pickup ──
export async function buyPickup(pickupId: string, carrier: string, service: string) {
  return post(`/pickups/${pickupId}/buy`, {
    carrier,
    service,
  });
}

// ── Check if EasyPost is configured ──
export function isShippingConfigured(): boolean {
  return !!process.env.EASYPOST_API_KEY;
}
