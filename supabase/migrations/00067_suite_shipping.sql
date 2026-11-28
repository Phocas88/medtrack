begin;

create table public.shipping_routing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 80),
  priority integer not null default 10 check(priority between 1 and 1000),
  country text check(country ~ '^[A-Z]{2}$'),
  min_weight_oz numeric check(min_weight_oz>=0),
  max_weight_oz numeric check(max_weight_oz>=coalesce(min_weight_oz,0)),
  carrier text check(length(trim(carrier)) between 1 and 60),
  max_delivery_days integer check(max_delivery_days between 1 and 90),
  preference text not null check(preference in ('lowest_cost','fastest')),
  unique(tenant_id,priority)
);
alter table public.shipping_routing_rules enable row level security;
revoke all on public.shipping_routing_rules from public,anon,authenticated;
grant select,insert,update,delete on public.shipping_routing_rules to authenticated;
grant select on public.shipping_routing_rules to service_role;
create policy shipping_routing_rules_manage on public.shipping_routing_rules for all to authenticated
  using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('shipping')))
  with check (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('shipping')));

create table public.freight_loads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  load_number bigint generated always as identity,
  location_id uuid not null references public.locations(id),
  destination text not null check(length(trim(destination)) between 1 and 350),
  carrier text not null check(length(trim(carrier)) between 1 and 120),
  equipment text not null check(equipment in ('ltl','truckload','parcel','other')),
  planned_pickup timestamptz not null,
  estimated_cost numeric(12,2) check(estimated_cost>=0),
  tracking_reference text check(length(tracking_reference)<=120),
  status text not null default 'planned' check(status in ('planned','dispatched','delivered','cancelled')),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  unique(tenant_id,load_number)
);
create index freight_loads_schedule_idx on public.freight_loads(tenant_id,planned_pickup);
create table public.freight_load_shipments (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  load_id uuid not null references public.freight_loads(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id),
  primary key (load_id,shipment_id),
  unique (tenant_id,shipment_id)
);
create table public.freight_load_orders (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  load_id uuid not null references public.freight_loads(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id),
  primary key(load_id,order_id)
);
create index freight_load_orders_order_idx on public.freight_load_orders(tenant_id,order_id);
alter table public.freight_load_orders enable row level security;
revoke all on public.freight_load_orders from public,anon,authenticated;
grant select on public.freight_load_orders to authenticated;
create policy freight_load_orders_read on public.freight_load_orders for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('shipping')));
create trigger enforce_tenant_relations before insert or update on public.freight_load_orders
  for each row execute function public.enforce_tenant_relations();

alter table public.freight_loads enable row level security;
alter table public.freight_load_shipments enable row level security;
revoke all on public.freight_loads,public.freight_load_shipments from public,anon,authenticated;
grant select on public.freight_loads,public.freight_load_shipments to authenticated;
create policy freight_load_read on public.freight_loads for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('shipping')));
create policy freight_load_shipment_read on public.freight_load_shipments for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('shipping')));
create trigger enforce_tenant_relations before insert or update on public.freight_loads
  for each row execute function public.enforce_tenant_relations();
create trigger enforce_tenant_relations before insert or update on public.freight_load_shipments
  for each row execute function public.enforce_tenant_relations();

create function public.save_freight_load(p_id uuid,p_details jsonb,p_shipments uuid[],p_orders uuid[] default '{}'::uuid[]) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('shipping'); load freight_loads;
  warehouse uuid:=(p_details->>'location_id')::uuid;
begin
  if p_id is null or cardinality(coalesce(p_shipments,'{}'))+cardinality(coalesce(p_orders,'{}')) not between 1 and 200 then
    raise exception 'Select between 1 and 200 orders or shipments for the freight load';
  end if;
  if exists(select 1 from unnest(p_orders) selected(id) where not exists
    (select 1 from sales_orders o where o.id=selected.id and o.tenant_id=tid and o.status in ('confirmed','picking','shipped'))) then
    raise exception 'A selected order is unavailable';
  end if;
  if not exists(select 1 from locations where tenant_id=tid and id=warehouse and is_active) then
    raise exception 'Select an active pickup warehouse';
  end if;
  if exists(select 1 from unnest(p_shipments) selected(id) where not exists
    (select 1 from shipments s where s.id=selected.id and s.tenant_id=tid)) then
    raise exception 'A selected shipment is unavailable';
  end if;
  insert into freight_loads(id,tenant_id,location_id,destination,carrier,equipment,planned_pickup,estimated_cost,created_by)
    values(p_id,tid,warehouse,trim(p_details->>'destination'),trim(p_details->>'carrier'),p_details->>'equipment',
      (p_details->>'planned_pickup')::timestamptz,(p_details->>'estimated_cost')::numeric,auth.uid())
    on conflict(id) do nothing;
  select * into load from freight_loads where id=p_id and tenant_id=tid for update;
  if not found or load.status<>'planned' then raise exception 'Only planned freight loads can be edited'; end if;
  update freight_loads set location_id=warehouse,destination=trim(p_details->>'destination'),
    carrier=trim(p_details->>'carrier'),equipment=p_details->>'equipment',
    planned_pickup=(p_details->>'planned_pickup')::timestamptz,estimated_cost=(p_details->>'estimated_cost')::numeric where id=p_id;
  delete from freight_load_shipments where tenant_id=tid and load_id=p_id;
  if exists(select 1 from freight_load_shipments where tenant_id=tid and shipment_id=any(p_shipments)) then
    raise exception 'A shipment is assigned to another freight load';
  end if;
  insert into freight_load_shipments(tenant_id,load_id,shipment_id)
    select distinct tid,p_id,s from unnest(p_shipments) s order by s;
  delete from freight_load_orders where tenant_id=tid and load_id=p_id;
  perform pg_advisory_xact_lock(hashtext(tid::text||':freight-order:'||o::text))
    from (select distinct unnest(p_orders) o order by 1) selected;
  if exists(select 1 from freight_load_orders l join freight_loads f on f.id=l.load_id and f.tenant_id=l.tenant_id
    where l.tenant_id=tid and f.status='planned' and l.order_id=any(p_orders)) then
    raise exception 'An order is already assigned to a planned freight load';
  end if;
  insert into freight_load_orders(tenant_id,load_id,order_id)
    select distinct tid,p_id,o from unnest(p_orders) o;
  return p_id;
end $$;

create function public.update_freight_load(p_id uuid,p_action text,p_reference text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('shipping'); load freight_loads;
begin
  select * into load from freight_loads where tenant_id=tid and id=p_id for update;
  if not found then raise exception 'Freight load not found'; end if;
  if p_action='dispatch' and load.status='planned' then
    if nullif(trim(p_reference),'') is null then raise exception 'Enter the PRO number, bill of lading number, or carrier reference'; end if;
    insert into freight_load_shipments(tenant_id,load_id,shipment_id)
      select tid,p_id,s.id from freight_load_orders p join shipments s on s.tenant_id=p.tenant_id and s.order_id=p.order_id
      where p.tenant_id=tid and p.load_id=p_id and s.created_at>=load.created_at
      order by s.id on conflict(tenant_id,shipment_id) do nothing;
    if exists(select 1 from freight_load_orders p where p.tenant_id=tid and p.load_id=p_id and not exists(
      select 1 from freight_load_shipments fs join shipments s on s.id=fs.shipment_id and s.tenant_id=fs.tenant_id
      where fs.tenant_id=tid and fs.load_id=p_id and s.order_id=p.order_id)) then
      raise exception 'Post a shipment for each planned order before dispatching';
    end if;
    if not exists(select 1 from freight_load_shipments where load_id=p_id and tenant_id=tid) then
      raise exception 'Add a shipment before dispatching';
    end if;
    update freight_loads set status='dispatched',tracking_reference=trim(p_reference),dispatched_at=now() where id=p_id;
  elsif p_action='deliver' and load.status='dispatched' then
    update freight_loads set status='delivered',delivered_at=now() where id=p_id;
  elsif p_action='cancel' and load.status='planned' then
    update freight_loads set status='cancelled' where id=p_id;
    delete from freight_load_shipments where load_id=p_id and tenant_id=tid;
    delete from freight_load_orders where load_id=p_id and tenant_id=tid;
  elsif not ((p_action='dispatch' and load.status='dispatched') or (p_action='deliver' and load.status='delivered')
    or (p_action='cancel' and load.status='cancelled')) then raise exception 'Invalid freight load transition';
  end if;
end $$;

revoke all on function public.save_freight_load(uuid,jsonb,uuid[],uuid[]),public.update_freight_load(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.save_freight_load(uuid,jsonb,uuid[],uuid[]),public.update_freight_load(uuid,text,text) to authenticated;
commit;
