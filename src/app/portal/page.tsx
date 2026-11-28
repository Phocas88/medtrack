'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Search, ShoppingCart } from 'lucide-react';
import { usePortal } from './portal-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Product = { id: string; name: string; sku: string; price: number; unit_of_measure: string; image_url?: string; breaks?: { quantity: number; price: number }[] };
type Order = { id: string; order_number: string; status: string; lines: { quantity_ordered: number; unit_price: number }[]; shipments?: { tracking_number: string | null }[] };
type Catalog = { name: string; currency: string; has_more: boolean; products: Product[] };
type Cart = Record<string, { product: Product; quantity: number }>;

function productPrice(product: Product, quantity: number) {
  return product.breaks?.findLast(level => level.quantity <= quantity)?.price ?? product.price;
}

function productImage(value?: string) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export default function PortalPage() {
  const { customer } = usePortal();
  const [catalog, setCatalog] = useState<Catalog>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ search: '', offset: 0 });
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/portal/orders?customer=${customer.id}`, { signal });
    const history = await response.json();
    if (!response.ok) throw new Error(history.error || 'Could not load your orders.');
    if (!signal?.aborted) setOrders(history.orders);
  }, [customer.id]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOrders(controller.signal).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [loadOrders]);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    const params = new URLSearchParams({ customer: customer.id, search: query.search, offset: String(query.offset) });
    void fetch(`/api/portal/catalog?${params}`, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load your storefront.');
      if (!controller.signal.aborted) setCatalog(data);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [customer.id, query]);

  async function placeOrder() {
    setBusy(true);
    try {
      const lines = Object.values(cart).map(({ product, quantity }) => ({ product_id: product.id, quantity }));
      const response = await fetch('/api/portal/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customer.id, request_id: requestId, lines }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Order failed.');
      setCart({});
      setRequestId(crypto.randomUUID());
      toast.success(`Order ${result.order_number} placed.`);
      await loadOrders();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Order failed.'); }
    finally { setBusy(false); }
  }

  function setQuantity(product: Product, value: number) {
    const quantity = Math.min(1000000, Math.max(0, Math.floor(value)));
    setCart(previous => {
      if (quantity) return { ...previous, [product.id]: { product, quantity } };
      const next = { ...previous };
      delete next[product.id];
      return next;
    });
  }

  const currency = /^[A-Z]{3}$/.test(catalog?.currency ?? '') ? catalog!.currency : 'USD';
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 4 });
  const items = Object.values(cart);
  return <div className="space-y-8">
    <header className="space-y-4 rounded-xl bg-brand-lavender p-5 sm:p-7">
      <h1 className="text-2xl font-bold text-brand-deep-plum sm:text-3xl">{catalog?.name ?? 'Wholesale Storefront'}</h1>
      <form className="flex w-full max-w-lg gap-2" onSubmit={event => { event.preventDefault(); setQuery({ search: search.trim(), offset: 0 }); }}>
        <Input type="search" aria-label="Search catalog" placeholder="Search by name or SKU" value={search} maxLength={120} onChange={event => setSearch(event.target.value)} />
        <Button type="submit"><Search aria-hidden size={16} /> Search</Button>
      </form>
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {!catalog && !error && <p role="status" className="text-sm text-muted-foreground">Loading your catalog…</p>}
    {catalog?.products.length === 0 && <p className="text-sm text-muted-foreground">No products match this search.</p>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{catalog?.products.map(product => {
      const url = productImage(product.image_url);
      return <article key={product.id} className="space-y-2 rounded-lg border p-4">
        {url && <Image src={url} alt="" width={320} height={192} unoptimized className="h-40 w-full rounded-md object-contain" />}
        <h2 className="font-semibold">{product.name}</h2>
        <p className="text-sm text-muted-foreground">{product.sku}</p>
        <p className="font-medium">{money.format(productPrice(product, cart[product.id]?.quantity || 1))} / {product.unit_of_measure}</p>
        {!!product.breaks?.length && <p className="text-sm text-muted-foreground">{product.breaks.map(level => `${level.quantity}+ at ${money.format(level.price)}`).join(' · ')}</p>}
        <label className="grid gap-1 text-sm">Quantity for {product.sku}
          <Input type="number" min="0" max="1000000" step="1" value={cart[product.id]?.quantity ?? ''}
            placeholder="0" disabled={busy} onChange={event => setQuantity(product, Number(event.target.value))} />
        </label>
      </article>;
    })}</div>
    {catalog && (query.offset > 0 || catalog.has_more) && <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={query.offset === 0} onClick={() => setQuery(previous => ({ ...previous, offset: Math.max(0, previous.offset - 40) }))}>Previous Products</Button>
      <Button variant="outline" disabled={!catalog.has_more} onClick={() => setQuery(previous => ({ ...previous, offset: previous.offset + 40 }))}>Next Products</Button>
    </div>}
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="cart-title">
      <h2 id="cart-title" className="flex items-center gap-2 text-xl font-semibold"><ShoppingCart aria-hidden size={20} /> Your Cart</h2>
      {items.length ? <ul className="divide-y">{items.map(({ product, quantity }) => <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span>{quantity} × {product.name} · {money.format(productPrice(product, quantity) * quantity)}</span>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setQuantity(product, 0)}>Remove</Button>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">Enter a quantity on a product to add it to your order.</p>}
      <Button disabled={busy || !items.length} onClick={() => void placeOrder()}>{busy ? 'Placing Order…' : 'Place Order'}</Button>
    </section>
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">Your Orders</h2>
      {orders.length ? <div className="grid gap-3 sm:grid-cols-2">{orders.map(order => <article key={order.id} className="space-y-1 rounded-lg border p-4">
        <p className="break-all font-medium">{order.order_number}</p>
        <p className="text-sm capitalize">{order.status} · {money.format(order.lines.reduce((total, line) => total + line.quantity_ordered * line.unit_price, 0))}</p>
        {order.shipments?.filter(shipment => shipment.tracking_number).map((shipment, index) =>
          <p key={index} className="break-all text-sm text-muted-foreground">Tracking {shipment.tracking_number}</p>)}
      </article>)}</div> : <p className="text-sm text-muted-foreground">Your submitted orders will appear here.</p>}
    </section>
  </div>;
}
