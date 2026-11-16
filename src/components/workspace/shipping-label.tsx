"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type {
  ShippingAddress,
  ShippingRate,
  ShipmentResult,
} from "@/lib/shipping";
import { toast } from "sonner";
const blankAddress = (): ShippingAddress => ({
  name: "",
  street1: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
});
type Quote = {
  shipment_id: string;
  rate_id: string | null;
  purchase_state: string;
  purchased: ShipmentResult | null;
};
function labelUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function money(rate: ShippingRate) {
  const currency = /^[A-Z]{3}$/.test(rate.currency || "")
    ? rate.currency!
    : "USD";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(Number(rate.rate));
}
export function ShippingLabel({
  orderId,
  canPurchase,
  onPurchased,
}: {
  orderId: string;
  canPurchase: boolean;
  onPurchased: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<ShippingAddress>(blankAddress);
  const [to, setTo] = useState<ShippingAddress>(blankAddress);
  const [parcel, setParcel] = useState({
    length: 0,
    width: 0,
    height: 0,
    weight: 0,
  });
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [shipment, setShipment] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [result, setResult] = useState<ShipmentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setQuote(null);
    setResult(null);
    setRates([]);
    fetch(`/api/shipping/label?order_id=${orderId}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setQuote(data.quote);
        setResult(data.quote?.purchased || null);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, orderId]);
  async function jsonPost(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }
  async function getRates(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await jsonPost("/api/shipping/rates", { from, to, parcel });
      setShipment(data.shipment_id);
      setRates(data.rates);
      if (!data.rates.length)
        setError("No carrier rates are available for this parcel and address.");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Rate request failed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function buy(shipmentId: string, rateId: string, rate?: ShippingRate) {
    if (
      rate &&
      !window.confirm(
        `Purchase ${rate.carrier} ${rate.service} postage for ${money(rate)} using your EasyPost account?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const data = await jsonPost("/api/shipping/buy", {
        shipment_id: shipmentId,
        rate_id: rateId,
        order_id: orderId,
      });
      const saved: ShipmentResult = {
        id: shipmentId,
        tracking_code: data.tracking_code,
        label_url: data.label_url,
        rate: rate || {
          id: rateId,
          carrier: data.carrier,
          service: data.service,
          rate: data.rate,
          delivery_days: null,
          est_delivery_date: null,
        },
        tracker_id: "",
      };
      setResult(saved);
      toast.success("Shipping label ready");
      onPurchased();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Purchase failed");
      setQuote({
        shipment_id: shipmentId,
        rate_id: rateId,
        purchase_state: "uncertain",
        purchased: null,
      });
    } finally {
      setBusy(false);
    }
  }
  const fields = (
    address: ShippingAddress,
    setAddress: (value: ShippingAddress) => void,
    prefix: string,
  ) => (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-3 text-sm font-semibold">
        {prefix === "from" ? "Ship from" : "Ship to"}
      </legend>
      {(["name", "street1", "city", "state", "zip", "country"] as const).map(
        (field) => (
          <label key={field} className="block space-y-1 text-xs">
            <span>
              {
                {
                  name: "Name",
                  street1: "Street address",
                  city: "City",
                  state: "State / province",
                  zip: "Postal code",
                  country: "Country code",
                }[field]
              }
            </span>
            <input
              required
              maxLength={field === "country" ? 2 : 200}
              value={address[field] || ""}
              onChange={(event) => {
                setRates([]);
                setShipment("");
                setAddress({
                  ...address,
                  [field]:
                    field === "country"
                      ? event.target.value.toUpperCase()
                      : event.target.value,
                });
              }}
              className="min-h-9 w-full border bg-card px-2"
            />
          </label>
        ),
      )}
    </fieldset>
  );
  const url = result ? labelUrl(result.label_url) : null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-10 w-full border bg-card px-3 text-xs font-medium hover:bg-accent"
      >
        Shipping label
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle>Shipping label</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Postage is billed to the EasyPost account connected under
            Integrations → Shipping. Buying a label does not post warehouse
            stock.
          </p>
          {error && (
            <p role="alert" className="border p-3 text-sm">
              {error}
            </p>
          )}
          {loading ? (
            <p role="status">Loading existing label…</p>
          ) : result ? (
            <div className="space-y-4">
              <p className="text-sm">
                {result.rate.carrier} {result.rate.service} ·{" "}
                {result.tracking_code}
              </p>
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-primary px-4 py-3 text-sm text-primary-foreground"
                >
                  Open label to print
                </a>
              ) : (
                <p>
                  Label URL unavailable. Recover it through your EasyPost
                  account.
                </p>
              )}
            </div>
          ) : quote?.rate_id ? (
            <div className="space-y-3">
              <p className="text-sm">
                A label purchase already exists for this order. Recover that
                shipment before requesting another label.
              </p>
              <button
                disabled={busy}
                onClick={() => void buy(quote.shipment_id, quote.rate_id!)}
                className="border px-4 py-3 text-sm disabled:opacity-50"
              >
                {busy ? "Recovering…" : "Recover existing label"}
              </button>
            </div>
          ) : !canPurchase ? (
            <p className="text-sm">
              No label is stored for this order. New label purchases require an
              open order.
            </p>
          ) : (
            <>
              <form
                onSubmit={(event) => void getRates(event)}
                className="space-y-5"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  {fields(from, setFrom, "from")}
                  {fields(to, setTo, "to")}
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-semibold">
                    Parcel · inches and ounces
                  </legend>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {(["length", "width", "height", "weight"] as const).map(
                      (field) => (
                        <label key={field} className="space-y-1 text-xs">
                          <span className="capitalize">
                            {field} {field === "weight" ? "(oz)" : "(in)"}
                          </span>
                          <input
                            required
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={parcel[field] || ""}
                            onChange={(event) => {
                              setRates([]);
                              setShipment("");
                              setParcel({
                                ...parcel,
                                [field]: Number(event.target.value),
                              });
                            }}
                            className="min-h-9 w-full border bg-card px-2"
                          />
                        </label>
                      ),
                    )}
                  </div>
                </fieldset>
                <button
                  disabled={busy}
                  className="bg-primary px-4 py-3 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {busy ? "Requesting…" : "Get carrier rates"}
                </button>
              </form>
              {rates.length > 0 && (
                <section className="space-y-2 border-t pt-4">
                  <h3 className="text-sm font-semibold">Choose postage</h3>
                  {rates.map((rate) => (
                    <div
                      key={rate.id}
                      className="flex items-center justify-between gap-3 border-b py-3 text-sm"
                    >
                      <span>
                        {rate.carrier} {rate.service}
                      </span>
                      <button
                        disabled={busy}
                        onClick={() => void buy(shipment, rate.id, rate)}
                        className="border px-3 py-2 text-xs disabled:opacity-50"
                      >
                        Buy {money(rate)}
                      </button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
