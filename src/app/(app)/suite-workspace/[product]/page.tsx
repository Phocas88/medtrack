import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AnalyticsWorkspace } from '@/components/suite/analytics-workspace';
import { CommerceWorkspace } from '@/components/suite/commerce-workspace';
import { ManufacturingWorkspace } from '@/components/suite/manufacturing-workspace';
import { POSWorkspace } from '@/components/suite/pos-workspace';
import { PurchasingWorkspace } from '@/components/suite/purchasing-workspace';
import { ShippingWorkspace } from '@/components/suite/shipping-workspace';
import { PageHeader } from '@/components/ui/page-header';
import { getSuiteProduct } from '@/lib/product-suite';
import { createClient } from '@/lib/supabase/server';

type Props = { params: Promise<{ product: string }> };
type Db = Awaited<ReturnType<typeof createClient>>;

function rows<T>(result: { data: T[] | null; error: unknown }): T[] {
  if (result.error) throw new Error('Could not load the add-on workspace.');
  return result.data ?? [];
}

function record<T>(result: { data: T | null; error: unknown }): T | null {
  if (result.error) throw new Error('Could not load the add-on workspace.');
  return result.data;
}

export default async function SuiteProductWorkspacePage({ params }: Props) {
  const product = getSuiteProduct((await params).product);
  if (!product) notFound();
  const db = await createClient();
  const [access, identity] = await Promise.all([
    db.rpc('suite_has_access', { p_product: product.slug }), db.auth.getUser(),
  ]);
  if (identity.error || !identity.data.user) redirect('/auth/login');
  if (access.error) throw new Error('Could not check add-on access.');
  if (!access.data) {
    return <div className="space-y-4">
      <PageHeader product={product.slug} title={`${product.name} Add-on`} description="An active subscription is required to open this workspace." />
      <Link href="/suite-workspace" className="font-semibold text-primary underline">Back to Invexiqs Suite</Link>
    </div>;
  }
  const profile = await db.from('users').select('id,tenant_id,role').eq('id', identity.data.user.id).single();
  if (profile.error || !profile.data) redirect('/auth/login');
  const user = profile.data;
  return <div className="space-y-5">
    <Link href="/suite-workspace" className="text-sm font-semibold text-primary underline">Back to Invexiqs Suite</Link>
    <PageHeader product={product.slug} title={`${product.name} Add-on`} description={product.description} />
    <ProductWorkspace db={db} slug={product.slug} tenantId={user.tenant_id} userId={user.id} admin={user.role === 'admin'} />
  </div>;
}

async function ProductWorkspace({ db, slug, tenantId, userId, admin }: {
  db: Db; slug: NonNullable<ReturnType<typeof getSuiteProduct>>['slug']; tenantId: string; userId: string; admin: boolean;
}) {
  if (slug === 'purchasing') {
    const [rules, suppliers] = await Promise.all([
      db.from('purchase_approval_rules').select('admin_threshold,separate_approver').eq('tenant_id', tenantId).maybeSingle(),
      db.from('suppliers').select('id,name').eq('tenant_id', tenantId).eq('is_archived', false).not('email', 'is', null).order('name'),
    ]);
    return <PurchasingWorkspace rules={record(rules)} suppliers={rows(suppliers)} admin={admin} />;
  }
  if (slug === 'analytics') {
    const [dashboards, metrics, preferences, exports] = await Promise.all([
      db.from('analytics_dashboards').select('id,name,metrics').eq('tenant_id', tenantId).eq('user_id', userId).order('name'),
      db.rpc('suite_dashboard_metrics'),
      db.from('analytics_digest_preferences').select('cadence,email_delivery,csv_export').eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle(),
      db.from('analytics_digest_history').select('report_date,export_id').eq('tenant_id', tenantId).eq('user_id', userId).eq('csv_export', true).order('report_date', { ascending: false }).limit(30),
    ]);
    return <AnalyticsWorkspace tenantId={tenantId} userId={userId} dashboards={rows(dashboards)} metrics={record(metrics) ?? {}}
      preference={record(preferences)} exports={rows(exports)} />;
  }
  if (slug === 'commerce') {
    const [workspace, store, customers, products, catalog, prices, connections, imports] = await Promise.all([
      db.from('tenants').select('name').eq('id', tenantId).single(),
      db.from('commerce_storefronts').select('name,curated').eq('tenant_id', tenantId).maybeSingle(),
      db.from('customers').select('id,name').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      db.from('products').select('id,name,sku').eq('tenant_id', tenantId).eq('is_archived', false).order('name'),
      db.from('commerce_catalog_products').select('product_id').eq('tenant_id', tenantId),
      db.from('commerce_volume_prices').select('customer_id,product_id,minimum_quantity,unit_price').eq('tenant_id', tenantId).order('minimum_quantity'),
      db.from('woocommerce_connections').select('id,name,enabled').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
      db.from('woocommerce_imports').select('connection_id,external_id,order_id,error').eq('tenant_id', tenantId).order('updated_at', { ascending: false }).limit(100),
    ]);
    return <CommerceWorkspace tenantId={tenantId} admin={admin} workspaceName={record(workspace)?.name ?? 'Wholesale Storefront'}
      store={record(store)} customers={rows(customers)} products={rows(products).map(p => ({ id: p.id, name: `${p.name} · ${p.sku}` }))}
      published={rows(catalog)} prices={rows(prices)} connections={rows(connections)} imports={rows(imports)} />;
  }
  if (slug === 'manufacturing') {
    const [kits, jobs, material] = await Promise.all([
      db.from('kits').select('id,name').eq('tenant_id', tenantId).eq('is_active', true).order('name'),
      db.from('production_jobs').select('id,job_number,kit_id,quantity,due_date,status,bom,material_cost,labor_cost,overhead_cost,notes,lot:lots(lot_number)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(100),
      db.rpc('production_material_plan'),
    ]);
    return <ManufacturingWorkspace kits={rows(kits)} jobs={rows(jobs).map(job => ({ ...job, lot: relationship(job.lot) }))} requirements={rows(material)} />;
  }
  const locationsQuery = db.from('locations').select('id,name').eq('tenant_id', tenantId).eq('is_active', true).order('name');
  if (slug === 'shipping') {
    const [rules, loads, shipments, orders, locations] = await Promise.all([
      db.from('shipping_routing_rules').select('*').eq('tenant_id', tenantId).order('priority'),
      db.from('freight_loads').select('*,freight_load_shipments(shipment_id),freight_load_orders(order_id)').eq('tenant_id', tenantId).order('planned_pickup', { ascending: false }).limit(100),
      db.from('shipments').select('id,tracking_number,order:sales_orders(order_number)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(200),
      db.from('sales_orders').select('id,order_number,status').eq('tenant_id', tenantId).in('status', ['confirmed', 'picking', 'shipped']).order('created_at', { ascending: false }).limit(200),
      locationsQuery,
    ]);
    const assigned = new Set(rows(loads).flatMap(load => load.freight_load_orders.map((order: { order_id: string }) => order.order_id)));
    const availableOrders = rows(orders).filter(order => order.status !== 'shipped' || assigned.has(order.id));
    return <ShippingWorkspace tenantId={tenantId} rules={rows(rules)} loads={rows(loads)} locations={rows(locations)}
      orders={availableOrders.map(order => ({ id: order.id, name: order.order_number }))}
      shipments={rows(shipments).map(row => ({ id: row.id, name: [relationship(row.order)?.order_number, row.tracking_number, row.id.slice(0, 8)].filter(Boolean).join(' · ') }))} />;
  }
  const [registers, open, closed, terminals, pending, locations, workspace] = await Promise.all([
    db.from('pos_registers').select('id,name,location_id,is_active').eq('tenant_id', tenantId).order('name'),
    db.from('pos_register_shifts').select('id,register_id,opened_at,closed_at,opening_cash,counted_cash,expected_cash,variance').eq('tenant_id', tenantId).is('closed_at', null),
    db.from('pos_register_shifts').select('id,register_id,opened_at,closed_at,opening_cash,counted_cash,expected_cash,variance').eq('tenant_id', tenantId).not('closed_at', 'is', null).order('closed_at', { ascending: false }).limit(50),
    db.rpc('pos_register_terminal_state'),
    db.from('pos_card_attempts').select('id,register_id,status,failure,created_at').eq('tenant_id', tenantId).in('status', ['pending', 'paid', 'paid_review', 'refund_pending']).order('created_at', { ascending: false }),
    locationsQuery,
    db.from('tenants').select('settings').eq('id', tenantId).single(),
  ]);
  return <POSWorkspace registers={rows(registers)} shifts={[...rows(open), ...rows(closed)]} terminals={rows(terminals)}
    attempts={rows(pending)} locations={rows(locations)} admin={admin}
    currency={String(record(workspace)?.settings?.currency ?? 'USD').toUpperCase()} />;
}

function relationship<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}
