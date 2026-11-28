'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ActionForm, checked, Empty, Field, formGrid, type Option, Panel, postJson, SelectOption, Submit, textField, useWorkspaceAction,
} from './workspace-controls';

type Store = { name: string; curated: boolean };
type Price = { customer_id: string; product_id: string; minimum_quantity: number; unit_price: number };
type Connection = { id: string; name: string; enabled: boolean };
type ImportedOrder = { connection_id: string; external_id: number; order_id: string | null; error: string | null };

export function CommerceWorkspace({ tenantId, workspaceName, admin, store, customers, products, published, prices, connections, imports }: {
  tenantId: string; workspaceName: string; admin: boolean; store: Store | null; customers: Option[]; products: Option[];
  published: { product_id: string }[]; prices: Price[]; connections: Connection[]; imports: ImportedOrder[];
}) {
  const { busy, run } = useWorkspaceAction();
  const [webhook, setWebhook] = useState<{ url: string; secret: string }>();
  const productNames = new Map(products.map(item => [item.id, item.name]));
  const customerNames = new Map(customers.map(item => [item.id, item.name]));
  const visible = new Set(published.map(item => item.product_id));
  return <div className="space-y-4">
    <Panel title="Wholesale Storefront" description="Choose what invited buyers see in the storefront. They can search products, see their pricing, and place orders.">
      <ActionForm className={formGrid} onSubmit={data => void run(async () => {
        checked(await createClient().from('commerce_storefronts').upsert({
          tenant_id: tenantId, name: textField(data, 'name'), curated: data.has('curated'),
        }));
      }, 'Storefront settings saved.')}>
        <Field label="Storefront Name"><Input name="name" defaultValue={store?.name ?? workspaceName} maxLength={100} required /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={store?.curated} name="curated" /> Show only selected products</label>
        <div className="self-end"><Submit busy={busy}>Save Storefront</Submit></div>
      </ActionForm>
      <ActionForm className="flex flex-wrap items-end gap-2" onSubmit={data => void run(async () => {
        checked(await createClient().from('commerce_catalog_products').upsert({
          tenant_id: tenantId, product_id: textField(data, 'product'),
        }, { onConflict: 'tenant_id,product_id', ignoreDuplicates: true }));
      }, 'Product added to your storefront selection.')}>
        <Field label="Product"><SelectOption options={products.filter(item => !visible.has(item.id))} placeholder="Select a product" name="product" required /></Field>
        <Submit busy={busy}>Add to Selection</Submit>
      </ActionForm>
      {published.length ? <ul className="divide-y">{published.map(item => <li key={item.product_id} className="flex items-center justify-between gap-2 py-2 text-sm">
        {productNames.get(item.product_id) ?? 'Archived product'}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
          checked(await createClient().from('commerce_catalog_products').delete().eq('tenant_id', tenantId).eq('product_id', item.product_id));
        }, 'Product removed from selection.')}>Remove</Button>
      </li>)}</ul> : <Empty>No products in the curated selection yet.</Empty>}
      <Link href="/customer-portal" className="text-sm font-semibold text-primary underline">Manage Customer Access</Link>
    </Panel>
    <Panel title="Customer Volume Pricing" description="Set a unit price for a particular customer, SKU, and minimum quantity. The highest qualifying quantity break applies.">
      <ActionForm className={formGrid} onSubmit={data => void run(async () => {
        checked(await createClient().from('commerce_volume_prices').upsert({
          tenant_id: tenantId, customer_id: textField(data, 'customer'), product_id: textField(data, 'product'),
          minimum_quantity: Number(data.get('minimum')), unit_price: Number(data.get('price')),
        }, { onConflict: 'tenant_id,customer_id,product_id,minimum_quantity' }));
      }, 'Customer price saved.')}>
        <Field label="Customer"><SelectOption options={customers} placeholder="Select a customer" name="customer" required /></Field>
        <Field label="Product"><SelectOption options={products} placeholder="Select a product" name="product" required /></Field>
        <Field label="Minimum Quantity"><Input name="minimum" type="number" min="1" max="1000000" defaultValue="1" required /></Field>
        <Field label="Unit Price"><Input name="price" type="number" min="0" step="0.0001" required /></Field>
        <div className="self-end"><Submit busy={busy}>Save Price</Submit></div>
      </ActionForm>
      {prices.length ? <ul className="divide-y">{prices.map(item => <li key={`${item.customer_id}-${item.product_id}-${item.minimum_quantity}`} className="flex items-center justify-between gap-2 py-2 text-sm">
        <span>{customerNames.get(item.customer_id) ?? 'Customer'} · {productNames.get(item.product_id) ?? 'Product'} · {item.minimum_quantity}+ at {formatCurrency(item.unit_price)}</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
          checked(await createClient().from('commerce_volume_prices').delete().eq('tenant_id', tenantId)
            .eq('customer_id', item.customer_id).eq('product_id', item.product_id).eq('minimum_quantity', item.minimum_quantity));
        }, 'Customer price removed.')}>Remove</Button>
      </li>)}</ul> : <Empty>No quantity breaks yet.</Empty>}
    </Panel>
    <Panel title="WooCommerce Orders" description="Import paid orders awaiting fulfillment. Match WooCommerce SKUs to your Invexiqs products.">
      <Link href="/integrations" className="text-sm font-semibold text-primary underline">Manage Shopify and Other WMS Integrations</Link>
      {admin && <ActionForm className="flex flex-wrap items-end gap-2" onSubmit={(data, form) => void run(async () => {
        const result = await postJson<{ url: string; secret: string }>('/api/suite/woocommerce', { action: 'connect', name: textField(data, 'name') });
        setWebhook(result);
        form.reset();
      }, 'WooCommerce connection created.')}>
        <Field label="WooCommerce Store Name"><Input name="name" maxLength={80} required /></Field>
        <Submit busy={busy}>Create Webhook Credentials</Submit>
      </ActionForm>}
      {webhook && <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <p className="text-sm">In WooCommerce, create an active <strong>Order updated</strong> webhook and paste the URL and secret below. Copy the secret before leaving this page.</p>
        <Field label="Delivery URL"><Input readOnly value={webhook.url} /></Field>
        <Field label="Webhook Secret"><Input readOnly value={webhook.secret} /></Field>
        <Button variant="outline" size="sm" onClick={() => setWebhook(undefined)}>Hide Credentials</Button>
      </div>}
      {!!connections.length && <ul className="divide-y">{connections.map(connection => <li key={connection.id} className="flex items-center justify-between gap-2 py-2 text-sm">
        <span>{connection.name} · {connection.enabled ? 'Webhook enabled' : 'Disconnected'}</span>
        {admin && connection.enabled && <Button variant="outline" size="sm" disabled={busy} onClick={() => {
          if (!window.confirm(`Disconnect ${connection.name}?`)) return;
          void run(() => postJson('/api/suite/woocommerce', { action: 'disconnect', id: connection.id }), 'WooCommerce disconnected.');
        }}>Disconnect</Button>}
      </li>)}</ul>}
      <h3 className="font-semibold">Recent Imports</h3>
      {imports.length ? <ul className="divide-y">{imports.map(item => <li key={`${item.connection_id}-${item.external_id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span>Order #{item.external_id} · {item.order_id ? 'Imported' : item.error ?? 'Needs review'}</span>
        {item.order_id ? <Link className="text-primary underline" href={`/ship?order=${item.order_id}`}>Open Order</Link>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(async () => {
            const result = checked(await createClient().rpc('retry_woocommerce_import', { p_connection: item.connection_id, p_external: item.external_id }));
            if (result.review) throw new Error(result.review);
          }, 'WooCommerce order imported.')}>Retry Import</Button>}
      </li>)}</ul> : <Empty>Imported orders and SKU issues appear here.</Empty>}
    </Panel>
  </div>;
}
