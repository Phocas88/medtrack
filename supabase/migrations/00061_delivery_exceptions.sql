begin;

create index carrier_order_exceptions on public.sales_orders(tenant_id, tracking_updated_at desc)
  where delivery_status in ('return_to_sender','failure','cancelled','error','available_for_pickup');
create index carrier_carton_exceptions on public.shipment_cartons(tenant_id, tracking_updated_at desc)
  where delivery_status in ('return_to_sender','failure','cancelled','error','available_for_pickup');

create function public.carrier_exception_rows(p_tenant uuid)
returns table (
  source_kind text, source_id uuid, order_id uuid, order_number text, carton_number text,
  tracking_number text, delivery_status text, updated_at timestamptz
)
language sql stable security invoker set search_path=public,pg_temp as $$
  select 'order'::text,o.id,o.id,o.order_number,null::text,o.tracking_number,o.delivery_status,o.tracking_updated_at
  from sales_orders o where o.tenant_id=p_tenant
    and o.delivery_status in ('return_to_sender','failure','cancelled','error','available_for_pickup')
  union all
  select 'carton'::text,c.id,o.id,o.order_number,c.carton_number,c.tracking_number,c.delivery_status,c.tracking_updated_at
  from shipment_cartons c
  join shipments s on s.id=c.shipment_id and s.tenant_id=p_tenant
  join sales_orders o on o.id=s.order_id and o.tenant_id=p_tenant
  where c.tenant_id=p_tenant and c.delivery_status in ('return_to_sender','failure','cancelled','error','available_for_pickup')
$$;

create function public.delivery_exception_queue(p_status text default null)
returns table (
  source_kind text, source_id uuid, order_id uuid, order_number text, carton_number text,
  tracking_number text, delivery_status text, updated_at timestamptz, followup_id uuid,
  followup_resolved_at timestamptz, total bigint
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_warehouse_manager();
begin
  return query
  select q.*,f.id,f.resolved_at,count(*) over()
  from public.carrier_exception_rows(tid) q
  left join warehouse_followups f on f.tenant_id=tid and f.source_key=
    ('delivery:'||q.source_kind||':'||q.source_id::text||':'||q.delivery_status)
  where p_status is null or q.delivery_status=p_status
  order by q.updated_at desc nulls last,q.source_kind,q.source_id
  limit 250;
end $$;

create function public.create_delivery_exception_followup(p_kind text,p_source uuid,p_status text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_warehouse_manager(); shipment record; followup uuid; key text;
begin
  select * into shipment from public.carrier_exception_rows(tid) q
  where q.source_kind=p_kind and q.source_id=p_source and q.delivery_status=p_status;
  if not found then raise exception 'This delivery exception has changed. Refresh the queue.'; end if;
  key:='delivery:'||shipment.source_kind||':'||shipment.source_id::text||':'||shipment.delivery_status;
  insert into warehouse_followups(tenant_id,kind,title,source_type,source_id,source_key,due_date)
  values (tid,'customer',left('Delivery exception · '||shipment.order_number||
    coalesce(' · Carton '||shipment.carton_number,''),250),'sales_order',shipment.order_id,key,current_date)
  on conflict (tenant_id,source_key) do nothing returning id into followup;
  if followup is not null then
    insert into warehouse_followup_events(tenant_id,followup_id,actor_id,detail)
    values(tid,followup,auth.uid(),left('Carrier update: '||replace(shipment.delivery_status,'_',' ')||
      coalesce(' · Tracking '||shipment.tracking_number,''),2000));
  else
    select f.id into followup from warehouse_followups f where f.tenant_id=tid and f.source_key=key;
  end if;
  return followup;
end $$;

revoke all on function public.carrier_exception_rows(uuid), public.delivery_exception_queue(text),
  public.create_delivery_exception_followup(text,uuid,text) from public,anon,authenticated;
grant execute on function public.delivery_exception_queue(text),public.create_delivery_exception_followup(text,uuid,text) to authenticated;
commit;
