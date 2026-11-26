'use client';
import { useCallback, useEffect, useState } from 'react';
import { usePortal } from './portal-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
interface Product { id: string; name: string; sku: string; price: number; unit_of_measure: string }
interface Order { id: string; order_number: string; status: string; lines: { quantity_ordered: number; unit_price: number }[] }
export default function PortalPage() {
  const { customer } = usePortal();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const responses = await Promise.all([fetch(`/api/portal/catalog?customer=${customer.id}`), fetch(`/api/portal/orders?customer=${customer.id}`)]);
      const [catalog, history] = await Promise.all(responses.map(response => response.json()));
      if (responses.some(response => !response.ok)) throw new Error(catalog.error || history.error || 'Could not load your account');
      setProducts(catalog.products); setOrders(history.orders); setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not load your account'); }
  }, [customer.id]);
  useEffect(() => { void load(); }, [load]);
  async function placeOrder() {
    setBusy(true);
    try {
      const lines = Object.entries(cart).filter(([, quantity]) => quantity > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
      const response = await fetch('/api/portal/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_id: customer.id, request_id: requestId, lines }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Order failed');
      setCart({}); setRequestId(crypto.randomUUID()); toast.success(`Order ${result.order_number} placed`); await load();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : 'Order failed'); }
    finally { setBusy(false); }
  }
  return <div className="space-y-8"><h1 className="text-2xl font-bold">Order products</h1>{error && <p role="alert">{error}</p>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{products.map(product => <article key={product.id} className="rounded border p-4 space-y-2"><h2 className="font-semibold">{product.name}</h2><p>{product.sku}</p><p>${Number(product.price).toFixed(2)} / {product.unit_of_measure}</p><label htmlFor={`qty-${product.id}`}>Quantity</label><Input id={`qty-${product.id}`} type="number" min="0" step="1" value={cart[product.id] || 0} onChange={event => setCart(previous => ({ ...previous, [product.id]: Math.max(0, Math.floor(Number(event.target.value))) }))} /></article>)}</div><Button disabled={busy || !Object.values(cart).some(quantity => quantity > 0)} onClick={placeOrder}>{busy ? 'Placing order…' : 'Place order'}</Button><section className="space-y-3"><h2 className="text-xl font-semibold">Your orders</h2>{orders.map(order => <article key={order.id} className="rounded border p-4"><p>{order.order_number} — {order.status}</p><p>${order.lines.reduce((total, line) => total + line.quantity_ordered * line.unit_price, 0).toFixed(2)}</p></article>)}</section></div>;
}
