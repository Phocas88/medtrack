'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/format';
import type { RoutingRule } from '@/lib/shipping-routing';
import { createClient } from '@/lib/supabase/client';
import {
  ActionForm, checked, Empty, Field, formGrid, type Option, optionalNumber, Panel, selectClass, SelectOption, Submit, textField, useWorkspaceAction,
} from './workspace-controls';

type Rule = RoutingRule & { id: string };
type Freight = {
  id: string; load_number: number; status: string; destination: string; carrier: string; equipment: string; planned_pickup: string;
  estimated_cost: number | null; tracking_reference: string | null; location_id: string; freight_load_shipments: { shipment_id: string }[]; freight_load_orders: { order_id: string }[];
};
const equipment = [{ id: 'ltl', name: 'Less Than Truckload' }, { id: 'truckload', name: 'Truckload' }, { id: 'parcel', name: 'Parcel' }, { id: 'other', name: 'Other' }];

export function ShippingWorkspace({ rules, loads, shipments, orders, locations, tenantId }: {
  rules: Rule[]; loads: Freight[]; shipments: Option[]; orders: Option[]; locations: Option[]; tenantId: string;
}) {
  const { busy, run } = useWorkspaceAction();
  const [editRule, setEditRule] = useState<Rule>();
  const [editLoad, setEditLoad] = useState<Freight>();
  const shipmentLabels = new Map(shipments.map(item => [item.id, item.name]));
  const assignedOrders = new Set(loads.filter(load => load.status === 'planned' && load.id !== editLoad?.id).flatMap(load => load.freight_load_orders.map(item => item.order_id)));
  const assigned = new Set(loads.filter(load => load.id !== editLoad?.id).flatMap(load => load.freight_load_shipments.map(item => item.shipment_id)));
  function changeLoad(load: Freight, action: string, reference?: string) {
    void run(async () => {
      checked(await createClient().rpc('update_freight_load', { p_id: load.id, p_action: action, p_reference: reference ?? null }));
    }, 'Freight load updated.');
  }
  return <div className="space-y-4">
    <Panel title="Carrier Routing" description="Recommend a carrier rate at label purchase based on destination, parcel weight, and delivery speed. Lower priority numbers are checked first.">
      <ActionForm key={editRule?.id ?? 'new'} className={formGrid} onSubmit={(data, form) => void run(async () => {
        const rule = {
          tenant_id: tenantId, name: textField(data, 'name'), priority: Number(data.get('priority')),
          country: textField(data, 'country').toUpperCase() || null, carrier: textField(data, 'carrier') || null,
          min_weight_oz: optionalNumber(data, 'min'), max_weight_oz: optionalNumber(data, 'max'),
          max_delivery_days: optionalNumber(data, 'days'), preference: textField(data, 'preference'),
        };
        const db = createClient();
        checked(editRule ? await db.from('shipping_routing_rules').update(rule).eq('id', editRule.id).select('id').single()
          : await db.from('shipping_routing_rules').insert(rule).select('id').single());
        if (!editRule) form.reset();
        setEditRule(undefined);
      }, 'Carrier routing rule saved.')}>
        <Field label="Rule Name"><Input name="name" maxLength={80} required defaultValue={editRule?.name} /></Field>
        <Field label="Priority"><Input name="priority" type="number" min="1" max="1000" required defaultValue={editRule?.priority ?? 10} /></Field>
        <Field label="Destination Country"><Input name="country" pattern="[A-Za-z]{2}" maxLength={2} placeholder="Any, or enter a country code" defaultValue={editRule?.country ?? ''} /></Field>
        <Field label="Carrier"><Input name="carrier" maxLength={60} placeholder="Any, or enter a carrier name" defaultValue={editRule?.carrier ?? ''} /></Field>
        <Field label="Minimum Weight (oz)"><Input name="min" type="number" min="0" step="any" defaultValue={editRule?.min_weight_oz ?? ''} /></Field>
        <Field label="Maximum Weight (oz)"><Input name="max" type="number" min="0" step="any" defaultValue={editRule?.max_weight_oz ?? ''} /></Field>
        <Field label="Maximum Delivery Days"><Input name="days" type="number" min="1" max="90" defaultValue={editRule?.max_delivery_days ?? ''} /></Field>
        <Field label="Prioritize"><select className={selectClass} name="preference" defaultValue={editRule?.preference ?? 'lowest_cost'}>
          <option value="lowest_cost">Lowest Cost</option><option value="fastest">Fastest Delivery</option>
        </select></Field>
        <div className="flex flex-wrap items-end gap-2"><Submit busy={busy}>Save Rule</Submit>
          {editRule && <Button variant="outline" type="button" onClick={() => setEditRule(undefined)}>Cancel Edit</Button>}
        </div>
      </ActionForm>
      {rules.length ? <ul className="divide-y">{rules.map(rule => <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <span><strong>{rule.priority} · {rule.name}</strong> · {rule.country ?? 'Any country'} · {rule.carrier ?? 'Any carrier'} · {rule.preference === 'fastest' ? 'Fastest delivery' : 'Lowest cost'}</span>
        <span className="flex gap-2"><Button size="sm" variant="outline" type="button" onClick={() => setEditRule(rule)}>Edit</Button>
          <Button size="sm" variant="ghost" disabled={busy} type="button" onClick={() => void run(async () => {
            checked(await createClient().from('shipping_routing_rules').delete().eq('id', rule.id));
            if (editRule?.id === rule.id) setEditRule(undefined);
          }, 'Routing rule removed.')}>Remove</Button></span>
      </li>)}</ul> : <Empty>No carrier routing rules yet.</Empty>}
    </Panel>
    <Panel title={editLoad ? `Edit Load FL-${editLoad.load_number}` : 'Plan a Freight Load'} description="Plan pickup using orders awaiting shipment or add posted shipments to the load. Dispatch records the carrier reference.">
      <ActionForm key={editLoad?.id ?? 'new'} className={formGrid} onSubmit={(data, form) => void run(async () => {
        const pickup = new Date(textField(data, 'pickup'));
        if (!Number.isFinite(pickup.getTime())) throw new Error('Enter the planned pickup time.');
        checked(await createClient().rpc('save_freight_load', {
          p_id: editLoad?.id ?? crypto.randomUUID(), p_shipments: data.getAll('shipments').map(String), p_orders: data.getAll('orders').map(String),
          p_details: {
            location_id: textField(data, 'warehouse'), destination: textField(data, 'destination'), carrier: textField(data, 'carrier'),
            equipment: textField(data, 'equipment'), planned_pickup: pickup.toISOString(), estimated_cost: optionalNumber(data, 'cost'),
          },
        }));
        form.reset();
        setEditLoad(undefined);
      }, 'Freight load saved.')}>
        <Field label="Pickup Warehouse"><SelectOption name="warehouse" options={locations} placeholder="Select warehouse" required defaultValue={editLoad?.location_id} /></Field>
        <Field label="Planned Pickup (Local Time)"><Input type="datetime-local" name="pickup" defaultValue={editLoad ? localTime(editLoad.planned_pickup) : undefined} required /></Field>
        <Field label="Destination"><Input name="destination" maxLength={350} required defaultValue={editLoad?.destination} /></Field>
        <Field label="Carrier"><Input name="carrier" maxLength={120} required defaultValue={editLoad?.carrier} /></Field>
        <Field label="Equipment"><SelectOption name="equipment" options={equipment} placeholder="Select equipment" required defaultValue={editLoad?.equipment} /></Field>
        <Field label="Estimated Freight Cost"><Input name="cost" type="number" min="0" step="0.01" defaultValue={editLoad?.estimated_cost ?? ''} /></Field>
        <fieldset className="space-y-2 sm:col-span-2 xl:col-span-3">
          <legend className="text-sm font-medium">Orders Awaiting Shipment</legend>
          <div className="max-h-44 space-y-2 overflow-auto rounded-md border p-3">
            {orders.filter(item => !assignedOrders.has(item.id)).map(item => <label key={item.id} className="flex items-start gap-2 text-sm">
              <input className="mt-0.5" type="checkbox" name="orders" value={item.id}
                defaultChecked={editLoad?.freight_load_orders.some(order => order.order_id === item.id)} />{item.name}
            </label>)}
            {!orders.some(item => !assignedOrders.has(item.id)) && <Empty>No unassigned orders awaiting shipment.</Empty>}
          </div>
        </fieldset>
        <fieldset className="space-y-2 sm:col-span-2 xl:col-span-3">
          <legend className="text-sm font-medium">Posted Shipments</legend>
          <div className="max-h-44 space-y-2 overflow-auto rounded-md border p-3">
            {shipments.filter(item => !assigned.has(item.id)).map(item => <label key={item.id} className="flex items-start gap-2 text-sm">
              <input className="mt-0.5" type="checkbox" name="shipments" value={item.id}
                defaultChecked={editLoad?.freight_load_shipments.some(shipment => shipment.shipment_id === item.id)} />{item.name}
            </label>)}
            {!shipments.some(item => !assigned.has(item.id)) && <Empty>No unassigned shipments.</Empty>}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2"><Submit busy={busy}>Save Load</Submit>
          {editLoad && <Button variant="outline" type="button" onClick={() => setEditLoad(undefined)}>Cancel Edit</Button>}
        </div>
      </ActionForm>
      <Link href="/ship" className="text-sm font-semibold text-primary underline">Open Shipments</Link>
    </Panel>
    <Panel title="Dispatch Board">
      {loads.length ? <div className="grid gap-3 xl:grid-cols-2">{loads.map(load => <article key={load.id} className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">FL-{load.load_number} · {load.carrier}</h3>
        <p className="text-sm capitalize">{load.status} · {load.equipment.toUpperCase()}</p>
        <Empty>{load.destination} · {new Date(load.planned_pickup).toLocaleString()} {load.estimated_cost != null && `· ${formatCurrency(load.estimated_cost)}`}</Empty>
        {load.tracking_reference && <p className="break-all text-sm">Carrier reference {load.tracking_reference}</p>}
        <details className="text-sm"><summary className="cursor-pointer font-medium">{load.freight_load_orders.length} Planned Orders · {load.freight_load_shipments.length} Shipments</summary>
          <ul className="ml-4 mt-2 list-disc">{load.freight_load_shipments.map(item => <li key={item.shipment_id}>{shipmentLabels.get(item.shipment_id) ?? item.shipment_id}</li>)}</ul>
        </details>
        {load.status === 'planned' && <>
          <ActionForm className="flex flex-wrap items-end gap-2" onSubmit={data => changeLoad(load, 'dispatch', textField(data, 'reference'))}>
            <Field label="PRO or Bill of Lading Number"><Input name="reference" required maxLength={120} /></Field>
            <Submit busy={busy}>Mark Dispatched</Submit>
          </ActionForm>
          <div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy} type="button" onClick={() => setEditLoad(load)}>Edit Load</Button>
            <Button size="sm" variant="outline" disabled={busy} type="button" onClick={() => {
              if (window.confirm(`Cancel load FL-${load.load_number}?`)) changeLoad(load, 'cancel');
            }}>Cancel Load</Button></div>
        </>}
        {load.status === 'dispatched' && <Button size="sm" disabled={busy} type="button" onClick={() => changeLoad(load, 'deliver')}>Mark Delivered</Button>}
      </article>)}</div> : <Empty>No freight loads yet.</Empty>}
    </Panel>
  </div>;
}

function localTime(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
