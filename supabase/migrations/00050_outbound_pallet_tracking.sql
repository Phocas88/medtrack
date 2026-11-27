begin;

alter table public.shipment_cartons add column pallet_code text
  check (pallet_code is null or pallet_code ~ '^[A-Z0-9][A-Z0-9._-]{0,79}$');
create index shipment_cartons_pallet_code on public.shipment_cartons(tenant_id,pallet_code)
  where pallet_code is not null;

create or replace function public.save_shipment_cartons(p_tenant uuid,p_ship uuid,p_lines jsonb,p_cartons jsonb,p_tracking text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare carton jsonb; tracking text; carton_no text; pallet_value text;
begin
  if jsonb_typeof(p_cartons) is distinct from 'array' or jsonb_array_length(p_cartons) not between 1 and 100
    then raise exception 'Enter at least one carton and at most 100 cartons'; end if;
  for carton in select value from jsonb_array_elements(p_cartons) loop
    pallet_value:=nullif(upper(trim(carton->>'pallet_code')),'');
    if pallet_value is not null and pallet_value !~ '^[A-Z0-9][A-Z0-9._-]{0,79}$'
      then raise exception 'Use a pallet code with letters, numbers, dots, underscores or hyphens'; end if;
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
    insert into shipment_cartons(tenant_id,shipment_id,carton_number,tracking_number,contents,pallet_code)
      values(p_tenant,p_ship,carton_no,tracking,carton->'scans',pallet_value);
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

commit;
