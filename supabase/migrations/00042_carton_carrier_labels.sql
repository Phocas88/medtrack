begin;
alter table shipment_cartons add column delivery_status text, add column tracking_updated_at timestamptz;
alter table shipping_quotes add column carton_id uuid references shipment_cartons(id);
drop index one_active_label_per_order;
create unique index one_active_label_per_order on shipping_quotes(order_id)
  where order_id is not null and carton_id is null and purchase_state in ('buying','uncertain','purchased');
create unique index one_active_label_per_carton on shipping_quotes(carton_id)
  where carton_id is not null and purchase_state in ('buying','uncertain','purchased');

create or replace function public.save_shipment_cartons(p_tenant uuid,p_ship uuid,p_lines jsonb,p_cartons jsonb,p_tracking text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare carton jsonb; tracking text; carton_no text;
begin
  if jsonb_typeof(p_cartons) is distinct from 'array' or jsonb_array_length(p_cartons) not between 1 and 100
    then raise exception 'Enter at least one carton and at most 100 cartons'; end if;
  for carton in select value from jsonb_array_elements(p_cartons) loop
    carton_no:=nullif(trim(carton->>'number'),'');
    tracking:=coalesce(nullif(trim(carton->>'tracking'),''),nullif(trim(p_tracking),''));
    if tracking is null and carton->'carrier_label_pending' = 'true'::jsonb and exists (
      select 1 from shipments s join sales_orders o on o.id=s.order_id and o.tenant_id=s.tenant_id
      where s.id=p_ship and s.tenant_id=p_tenant and o.order_number !~ '^SHOPIFY-[0-9]+$'
    ) then
      perform 1 from sales_orders where id=(select order_id from shipments where id=p_ship and tenant_id=p_tenant) for update;
      if exists(select 1 from shipping_quotes q join shipments s on s.order_id=q.order_id and s.tenant_id=q.tenant_id
        where s.id=p_ship and s.tenant_id=p_tenant and q.carton_id is null
          and q.purchase_state in ('buying','uncertain','purchased'))
        then raise exception 'Recover or use the order-level label already purchased for this order'; end if;
      tracking:='';
    end if;
    if carton_no is null or length(carton_no)>80 or tracking is null or length(tracking)>200
      or jsonb_typeof(carton->'scans') is distinct from 'array' or jsonb_array_length(carton->'scans') not between 1 and 10000
      then raise exception 'Each carton needs an identifier, tracking number, and scanned items'; end if;
    insert into shipment_cartons(tenant_id,shipment_id,carton_number,tracking_number,contents)
      values(p_tenant,p_ship,carton_no,tracking,carton->'scans');
  end loop;
  if exists (
    with expected as (
      select lower(p.sku) sku,sum((line.value->>'quantity')::integer) qty
      from jsonb_array_elements(p_lines) line join products p on p.id=(line.value->>'product_id')::uuid and p.tenant_id=p_tenant
      group by lower(p.sku)
    ), actual as (
      select lower(trim(s.value)) sku,count(*) qty from jsonb_array_elements(p_cartons) c
      cross join lateral jsonb_array_elements_text(c.value->'scans') s group by lower(trim(s.value))
    )
    select 1 from expected full join actual using(sku) where expected.qty is distinct from actual.qty
  ) then raise exception 'Packed items must match all remaining order quantities'; end if;
end $$;

create or replace function claim_label_purchase(p_tenant uuid,p_order uuid,p_shipment text,p_rate text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes; o sales_orders; token uuid;
begin
  select * into o from sales_orders where tenant_id=p_tenant and id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  select * into q from shipping_quotes where shipment_id=p_shipment and tenant_id=p_tenant for update;
  if not found or q.carton_id is not null or not exists(select 1 from jsonb_array_elements(q.rates) r where r->>'id'=p_rate) then raise exception 'Quote or rate not found'; end if;
  if q.order_id is not null and (q.order_id<>p_order or q.rate_id<>p_rate) then raise exception 'Quote is bound to another purchase'; end if;
  if q.purchased is not null and q.order_id is null then raise exception 'Legacy label requires reconciliation before reuse'; end if;
  if q.purchased is not null then return jsonb_build_object('mode','cached','result',q.purchased); end if;
  if exists (select 1 from shipment_cartons c join shipments s on s.id=c.shipment_id and s.tenant_id=c.tenant_id
    where s.order_id=p_order and s.tenant_id=p_tenant and c.tracking_number='')
    then raise exception 'Order has cartons awaiting individual labels'; end if;
  if o.status not in ('draft','confirmed','picking') and q.purchase_state='quoted' then raise exception 'Order is unavailable for shipping'; end if;
  if q.lease_until>now() then return jsonb_build_object('mode','busy'); end if;
  if exists(select 1 from shipping_quotes where order_id=p_order and shipment_id<>p_shipment and purchase_state in ('buying','uncertain','purchased')) then raise exception 'Order already has a label purchase; recover it before buying another'; end if;
  token:=gen_random_uuid();
  update shipping_quotes set order_id=p_order,rate_id=p_rate,purchase_state='buying',lease_token=token,lease_until=now()+interval '90 seconds' where shipment_id=p_shipment;
  return jsonb_build_object('mode',case when q.purchase_state in ('buying','uncertain') then 'recover' else 'buy' end,'token',token);
end $$;
create function claim_carton_label_purchase(p_tenant uuid,p_order uuid,p_shipment text,p_rate text,p_carton uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes; o sales_orders; token uuid;
begin
  select * into o from sales_orders where tenant_id=p_tenant and id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  if o.order_number ~ '^SHOPIFY-[0-9]+$' or not exists (
    select 1 from shipment_cartons c join shipments s on s.id=c.shipment_id and s.tenant_id=c.tenant_id
    where c.tenant_id=p_tenant and c.id=p_carton and s.order_id=p_order and c.tracking_number=''
  ) then
    if not exists(select 1 from shipping_quotes where tenant_id=p_tenant and carton_id=p_carton
      and order_id=p_order and shipment_id=p_shipment and rate_id=p_rate and purchase_state='purchased')
      then raise exception 'Carton is unavailable for label purchase'; end if;
  end if;
  select * into q from shipping_quotes where shipment_id=p_shipment and tenant_id=p_tenant for update;
  if not found or q.carton_id is distinct from p_carton or q.order_id is distinct from p_order or not exists(select 1 from jsonb_array_elements(q.rates) r where r->>'id'=p_rate) then raise exception 'Quote or rate not found'; end if;
  if q.rate_id is not null and q.rate_id<>p_rate then raise exception 'Quote is bound to another purchase'; end if;
  if q.purchased is not null and q.order_id is null then raise exception 'Legacy label requires reconciliation before reuse'; end if;
  if q.purchased is not null then return jsonb_build_object('mode','cached','result',q.purchased); end if;
  if q.lease_until>now() then return jsonb_build_object('mode','busy'); end if;
  if exists(select 1 from shipping_quotes where order_id=p_order and (carton_id is null or carton_id=p_carton) and shipment_id<>p_shipment and purchase_state in ('buying','uncertain','purchased')) then raise exception 'Order already has a label purchase; recover it before buying another'; end if;
  token:=gen_random_uuid();
  update shipping_quotes set order_id=p_order,rate_id=p_rate,purchase_state='buying',lease_token=token,lease_until=now()+interval '90 seconds' where shipment_id=p_shipment;
  return jsonb_build_object('mode',case when q.purchase_state in ('buying','uncertain') then 'recover' else 'buy' end,'token',token);
end $$;
create or replace function complete_label_purchase(p_tenant uuid,p_shipment text,p_token uuid,p_result jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes; orderid uuid;
begin
  select order_id into orderid from shipping_quotes where shipment_id=p_shipment and tenant_id=p_tenant;
  perform 1 from sales_orders where id=orderid and tenant_id=p_tenant for update;
  select * into q from shipping_quotes where shipment_id=p_shipment and tenant_id=p_tenant for update;
  if not found or q.lease_token is distinct from p_token then raise exception 'Purchase lease expired'; end if;
  if p_result->>'id' is distinct from p_shipment or p_result#>>'{rate,id}' is distinct from q.rate_id or nullif(p_result->>'label_url','') is null or nullif(p_result->>'tracking_code','') is null then raise exception 'Invalid label response'; end if;
  update shipping_quotes set purchased=p_result,purchase_state='purchased',lease_until=null where shipment_id=p_shipment;
  if q.carton_id is not null then
    update shipment_cartons set tracking_number=p_result->>'tracking_code'
      where id=q.carton_id and tenant_id=p_tenant and tracking_number='';
    if not found then raise exception 'Carton tracking has changed'; end if;
    return;
  end if;
  update sales_orders set tracking_number=p_result->>'tracking_code',carrier=p_result#>>'{rate,carrier}',shipping_label_url=p_result->>'label_url',shipping_rate=(p_result#>>'{rate,rate}')::numeric where id=q.order_id and tenant_id=p_tenant;
end $$;

create or replace function apply_shipping_tracking(p_event text,p_tracker text,p_status text,p_updated timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes;
begin
  if p_status not in ('unknown','pre_transit','in_transit','out_for_delivery','delivered','available_for_pickup','return_to_sender','failure','cancelled','error') then raise exception 'Unknown tracking status'; end if;
  select * into q from shipping_quotes where purchased->>'tracker_id'=p_tracker and purchase_state='purchased' for update;
  if not found then raise exception 'Unknown tracker'; end if;
  if exists(select 1 from webhook_events where provider='easypost' and event_id=p_event) then return; end if;
  if q.carton_id is not null then
    update shipment_cartons set delivery_status=p_status,tracking_updated_at=p_updated
      where id=q.carton_id and tenant_id=q.tenant_id and (tracking_updated_at is null or tracking_updated_at<=p_updated);
  else
    update sales_orders set delivery_status=p_status,tracking_updated_at=p_updated where id=q.order_id and tenant_id=q.tenant_id and (tracking_updated_at is null or tracking_updated_at<=p_updated);
  end if;
  insert into webhook_events(provider,event_id,tenant_id) values('easypost',p_event,q.tenant_id);
end $$;

revoke all on function claim_carton_label_purchase(uuid,uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function claim_carton_label_purchase(uuid,uuid,text,text,uuid) to service_role;
commit;
