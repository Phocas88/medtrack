begin;
create table public.pick_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  assigned_to uuid not null references public.users(id),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
alter table public.pick_batches enable row level security;
revoke all on public.pick_batches from public,anon,authenticated;
grant select on public.pick_batches to authenticated;
create policy pick_batches_manager_read on public.pick_batches for select to authenticated
  using (tenant_id=public.get_tenant_id() and public.get_user_role() in ('admin','manager'));

alter table public.scan_tasks
  add column pick_batch_id uuid references public.pick_batches(id),
  add column pick_order_id uuid references public.sales_orders(id),
  add column pick_tote_code text;
create index scan_tasks_pick_order on public.scan_tasks(tenant_id,pick_order_id) where pick_batch_id is not null;

create function public.create_pick_batch(p_location uuid,p_orders uuid[],p_assignee uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; batch_id uuid; ord sales_orders; line record; item record; picked record;
  tote text; order_count integer:=0; task_count integer;
begin
  tid:=public.require_warehouse_manager();
  if coalesce(cardinality(p_orders),0) not between 2 and 20 or
    (select count(distinct x) from unnest(p_orders) x)<>cardinality(p_orders)
    then raise exception 'Choose 2–20 different orders'; end if;
  if not exists(select 1 from locations where id=p_location and tenant_id=tid and is_active)
    then raise exception 'Choose an active warehouse'; end if;
  if not exists(select 1 from users where id=p_assignee and tenant_id=tid and is_active)
    then raise exception 'Choose an active picker'; end if;
  -- Match the order then product lock order used by shipment posting.
  perform 1 from sales_orders where tenant_id=tid and id=any(p_orders) order by id for update;
  for item in select distinct sl.product_id from sales_order_lines sl
    where sl.tenant_id=tid and sl.order_id=any(p_orders) order by sl.product_id
  loop
    perform pg_advisory_xact_lock(hashtext(tid::text||item.product_id::text));
  end loop;
  insert into pick_batches(tenant_id,location_id,assigned_to,created_by)
    values(tid,p_location,p_assignee,auth.uid()) returning id into batch_id;
  for ord in select * from sales_orders where tenant_id=tid and id=any(p_orders) order by id loop
    order_count:=order_count+1;
    if ord.status not in ('confirmed','picking') or exists(
      select 1 from scan_tasks where tenant_id=tid and pick_order_id=ord.id and pick_batch_id is not null
        and status<>'cancelled'
    ) then raise exception 'Order % is unavailable or already on a pick batch',ord.order_number; end if;
    perform public.set_order_reservation(ord.id,true);
    tote:='TOTE-'||upper(left(batch_id::text,8))||'-'||order_count;
    task_count:=0;
    for line in select sl.product_id,p.sku,p.is_serial_tracked,p.is_lot_tracked,
      sum(sl.quantity_ordered-coalesce(sl.quantity_shipped,0)) as qty
      from sales_order_lines sl join products p on p.id=sl.product_id and p.tenant_id=tid and not p.is_archived
      where sl.tenant_id=tid and sl.order_id=ord.id and sl.quantity_ordered>coalesce(sl.quantity_shipped,0)
      group by sl.product_id,p.sku,p.is_serial_tracked,p.is_lot_tracked order by sl.product_id
    loop
      if line.is_serial_tracked or line.is_lot_tracked then
        raise exception 'Use individual picking for serial- or lot-tracked SKU %',line.sku;
      end if;
      -- Current batch scope is one bin and one lot per order line, with a stable FEFO choice.
      select bi.bin_id,bi.lot_id,b.bin_code into picked
      from bin_inventory bi join bins b on b.id=bi.bin_id and b.tenant_id=tid and b.is_active and b.location_id=p_location
      join lots l on l.id=bi.lot_id and l.tenant_id=tid and l.product_id=line.product_id and l.status='active'
      where bi.tenant_id=tid and bi.product_id=line.product_id
        and (l.expiration_date is null or l.expiration_date>=current_date)
        and not exists(select 1 from bin_inventory other_bin
          where other_bin.tenant_id=tid and other_bin.lot_id=l.id and other_bin.bin_id<>bi.bin_id and other_bin.quantity>0)
        and not exists(select 1 from quarantine_holds h where h.tenant_id=tid and h.lot_id=l.id and h.status in ('held','rejected'))
        and least(bi.quantity,l.quantity_on_hand)-coalesce((
          select sum(st.requested_quantity) from scan_tasks st join sales_orders so on so.id=st.pick_order_id and so.tenant_id=tid
          where st.tenant_id=tid and st.lot_id=l.id and st.pick_batch_id is not null
            and st.status<>'cancelled' and so.status in ('confirmed','picking')
        ),0)>=line.qty
      order by l.expiration_date nulls last,l.received_date,l.id,b.bin_code limit 1;
      if not found then raise exception 'SKU % needs enough eligible stock in a single bin',line.sku; end if;
      insert into scan_tasks(tenant_id,task_type,status,title,instructions,assigned_to,assigned_by,assigned_at,
        location_id,source_bin_id,product_id,lot_id,requested_quantity,pick_batch_id,pick_order_id,pick_tote_code)
      values(tid,'pick','assigned',left('Pick '||line.qty||' × '||line.sku||' from '||picked.bin_code,250),
        'Order '||ord.order_number||' · Tote '||tote,p_assignee,auth.uid(),now(),
        p_location,picked.bin_id,line.product_id,picked.lot_id,line.qty,batch_id,ord.id,tote);
      task_count:=task_count+1;
    end loop;
    if task_count=0 then raise exception 'Order % has no eligible open items',ord.order_number; end if;
    update sales_orders set status='picking' where id=ord.id and tenant_id=tid;
  end loop;
  if order_count<>cardinality(p_orders) then raise exception 'One or more orders were not found'; end if;
  return batch_id;
end $$;

create function public.cancel_pick_batch(p_batch uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; order_id uuid;
begin
  tid:=public.require_warehouse_manager();
  perform 1 from pick_batches where id=p_batch and tenant_id=tid and cancelled_at is null for update;
  if not found then raise exception 'Active batch not found'; end if;
  perform 1 from sales_orders o where o.tenant_id=tid
    and exists(select 1 from scan_tasks t where t.pick_batch_id=p_batch and t.pick_order_id=o.id)
    order by o.id for update;
  for order_id in select distinct t.pick_order_id from scan_tasks t join sales_orders o on o.id=t.pick_order_id and o.tenant_id=tid
    where t.tenant_id=tid and t.pick_batch_id=p_batch and o.status in ('confirmed','picking')
  loop
    update scan_tasks set status='cancelled' where tenant_id=tid and pick_batch_id=p_batch and pick_order_id=order_id;
    perform public.set_order_reservation(order_id,false);
  end loop;
  update pick_batches set cancelled_at=now() where id=p_batch and tenant_id=tid;
end $$;

create function public.ensure_batch_pick_matches_shipment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from scan_tasks where tenant_id=new.tenant_id and pick_order_id=new.order_id and status<>'cancelled') then return new; end if;
  if exists(select 1 from shipments s where s.tenant_id=new.tenant_id and s.order_id=new.order_id and s.id<>new.id and s.created_at>=
    (select min(created_at) from scan_tasks t where t.tenant_id=new.tenant_id and t.pick_order_id=new.order_id and t.status<>'cancelled')) then
    raise exception 'A batch-picked order ships its verified quantities in one shipment';
  end if;
  if exists(select 1 from scan_tasks where tenant_id=new.tenant_id and pick_order_id=new.order_id and status<>'cancelled'
    and (status<>'completed' or scanned_quantity is distinct from requested_quantity)) then
    raise exception 'Resolve the open or short pick before shipping this order';
  end if;
  if exists (
    with planned as (
      select product_id,lot_id,sum(scanned_quantity) qty from scan_tasks where tenant_id=new.tenant_id and pick_order_id=new.order_id and status='completed'
      group by product_id,lot_id
    ), actual as (
      select product_id,lot_id,sum(quantity) qty from shipment_lines where tenant_id=new.tenant_id and shipment_id=new.id group by product_id,lot_id
    )
    select 1 from planned full join actual using(product_id,lot_id) where planned.qty is distinct from actual.qty
  ) then raise exception 'Shipment lots or quantities differ from the batch pick; reconcile before posting'; end if;
  return new;
end $$;
create constraint trigger ensure_batch_pick_matches_shipment after insert on public.shipments
deferrable initially deferred for each row execute function public.ensure_batch_pick_matches_shipment();

create function public.protect_live_batch_reservation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from scan_tasks t join sales_orders o on o.id=t.pick_order_id and o.tenant_id=t.tenant_id
    where t.tenant_id=old.tenant_id and t.pick_order_id=old.order_id and t.status<>'cancelled'
      and o.status in ('confirmed','picking')) then
    raise exception 'Cancel the active pick batch before releasing its stock reservation';
  end if;
  return old;
end $$;
create trigger protect_live_batch_reservation before delete on public.order_reservations
for each row execute function public.protect_live_batch_reservation();

revoke all on function public.create_pick_batch(uuid,uuid[],uuid),public.cancel_pick_batch(uuid) from public,anon,authenticated;
grant execute on function public.create_pick_batch(uuid,uuid[],uuid),public.cancel_pick_batch(uuid) to authenticated;

create or replace function complete_scan_task(p_task_id uuid,p_quantity integer,p_variance integer,p_source text,p_target text,p_scans jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; task scan_tasks; source_bin uuid; target_bin uuid; source_row bin_inventory; lot_record lots; qty integer; dest_row uuid;
begin
  tid:=require_inventory_access();
  select * into task from scan_tasks where id=p_task_id and tenant_id=tid for update;
  if not found or (task.assigned_to is distinct from auth.uid() and public.get_user_role() not in ('admin','manager')) then raise exception 'Task not assigned to this account'; end if;
  if task.status='completed' then return; end if;
  if task.status<>'in_progress' then raise exception 'Start the task first'; end if;
  if jsonb_typeof(p_scans) is distinct from 'array' or jsonb_array_length(p_scans)=0 then raise exception 'Scan evidence required'; end if;
  qty:=coalesce(p_quantity,task.requested_quantity);
  if task.task_type in ('bin_to_bin','replenish','putaway') then
    if qty is null or qty<=0 or task.requested_quantity is not null and qty>task.requested_quantity then raise exception 'Invalid moved quantity'; end if;
    select id into target_bin from bins where tenant_id=tid and bin_code=p_target and is_active;
    if target_bin is null or task.target_bin_id is not null and target_bin<>task.target_bin_id then raise exception 'Incorrect destination bin'; end if;
    if task.product_id is null then raise exception 'Task has no product'; end if;
    -- Serialize all moves for this tenant/product, including lots with null bin keys.
    perform pg_advisory_xact_lock(hashtext(tid::text||task.product_id::text));
    if task.task_type in ('bin_to_bin','replenish') then
      select id into source_bin from bins where tenant_id=tid and bin_code=p_source and is_active;
      if source_bin is null or source_bin=target_bin or task.source_bin_id is not null and task.source_bin_id<>source_bin then raise exception 'Incorrect source bin'; end if;
      select * into source_row from bin_inventory where tenant_id=tid and bin_id=source_bin and product_id=task.product_id
        and lot_id is not distinct from task.lot_id for update;
      if not found or source_row.quantity<qty then raise exception 'Insufficient source stock'; end if;
      update bin_inventory set quantity=quantity-qty where id=source_row.id;
    else
      select * into lot_record from lots where id=task.lot_id and tenant_id=tid and product_id=task.product_id for update;
      if not found or (select coalesce(sum(quantity),0) from bin_inventory where lot_id=task.lot_id and tenant_id=tid)+qty>lot_record.quantity_on_hand then raise exception 'Put-away exceeds unlocated lot stock'; end if;
      update lots set location_id=(select location_id from bins where id=target_bin) where id=task.lot_id;
    end if;
    select id into dest_row from bin_inventory where tenant_id=tid and bin_id=target_bin and product_id=task.product_id and lot_id is not distinct from task.lot_id for update;
    if dest_row is null then insert into bin_inventory(tenant_id,bin_id,product_id,lot_id,quantity) values(tid,target_bin,task.product_id,task.lot_id,qty);
    else update bin_inventory set quantity=quantity+qty where id=dest_row; end if;
  elsif task.task_type='pick' then
    if task.pick_batch_id is not null then
      if qty is null or qty<0 or qty>task.requested_quantity
        or (p_scans->0->>'value') is distinct from (select bin_code from bins where id=task.source_bin_id and tenant_id=tid)
        or (p_scans->1->>'value') is distinct from (select sku from products where id=task.product_id and tenant_id=tid)
        or (p_scans->2->>'value') is distinct from qty::text
        or upper(trim(p_scans->3->>'value')) is distinct from task.pick_tote_code
        then raise exception 'Scan the assigned bin, SKU, quantity, and tote'; end if;
      if qty<task.requested_quantity then
        insert into warehouse_followups(tenant_id,kind,title,source_type,source_id,source_key,due_date)
        values(tid,'customer','Resolve short batch pick','sales_order',task.pick_order_id,'batch-pick:'||task.id::text,current_date)
        on conflict(tenant_id,source_key) do nothing;
      end if;
    elsif qty is null or qty<=0 or qty<>task.requested_quantity then
      raise exception 'Confirm the assigned pick quantity';
    end if;
    -- Stock movements are posted by the shipment transaction.
  end if;
  update scan_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),scanned_quantity=qty,variance=p_variance where id=task.id;
  insert into scan_logs(tenant_id,task_id,scanned_by,scan_type,scanned_value)
  select tid,task.id,auth.uid(),task.task_type::text,left(value->>'value',1000) from jsonb_array_elements(p_scans);
end $$;

commit;
