begin;

create table public.order_reservations (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  reserved_at timestamptz not null default now(),
  primary key (order_id, product_id)
);
create index order_reservations_product_idx on public.order_reservations(tenant_id,product_id);

create table public.shipment_cartons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shipment_id uuid not null references public.shipments(id) on delete cascade,
  carton_number text not null,
  tracking_number text not null,
  contents jsonb not null,
  unique (shipment_id, carton_number)
);

create table public.transfer_receiving_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  transfer_line_id uuid not null references public.transfer_lines(id),
  request_id uuid not null,
  damaged integer not null check (damaged >= 0),
  missing integer not null check (missing >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (tenant_id,request_id,transfer_line_id)
);
create index transfer_receiving_exceptions_transfer_idx on public.transfer_receiving_exceptions(tenant_id,transfer_id);
alter table public.transfer_stock add column quantity_damaged integer not null default 0;
alter table public.transfer_stock add constraint transfer_stock_received_and_damaged
  check (quantity_damaged >= 0 and quantity_received + quantity_damaged <= quantity_dispatched);

create table public.warehouse_followups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('supplier','customer','transfer')),
  title text not null check (length(title) between 1 and 250),
  source_type text check (source_type in ('purchase_order','sales_order','transfer')),
  source_id uuid,
  source_key text,
  owner_id uuid references public.users(id) on delete set null,
  due_date date,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id,source_key)
);
create index warehouse_followups_tenant_idx on public.warehouse_followups(tenant_id,resolved_at,due_date);
create table public.warehouse_followup_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  followup_id uuid not null references public.warehouse_followups(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  detail text not null check (length(detail) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index warehouse_followup_events_case_idx on public.warehouse_followup_events(followup_id,created_at);

do $$
declare tab text;
begin
  foreach tab in array array['order_reservations','shipment_cartons','transfer_receiving_exceptions','warehouse_followups','warehouse_followup_events'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('revoke all on public.%I from public,anon,authenticated',tab);
    execute format('grant select on public.%I to authenticated',tab);
    execute format('create policy manager_read on public.%I for select to authenticated using
      (tenant_id=(select public.get_tenant_id()) and (select public.get_user_role()) in (''admin'',''manager''))',tab);
  end loop;
end $$;

create function public.require_warehouse_manager() returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if coalesce(public.get_user_role()::text,'') not in ('admin','manager') then raise exception 'Manager required'; end if;
  return public.require_inventory_access();
end $$;

-- Physical stock remains the source of truth. Holds and expired lots cannot be promised.
create function public.product_shipping_balance(p_tenant uuid,p_product uuid,p_order uuid)
returns table(on_hand bigint,reserved_other bigint,reserved_for_order bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
  select
    coalesce((select sum(case when p.is_serial_tracked then least(l.quantity_on_hand,
        (select count(*) from serial_numbers s where s.tenant_id=l.tenant_id and s.product_id=l.product_id
          and s.lot_id=l.id and not s.is_shipped)) else l.quantity_on_hand end)
      from lots l join products p on p.id=l.product_id and p.tenant_id=l.tenant_id
      where not p.is_archived and l.tenant_id=p_tenant and l.product_id=p_product and l.status='active'
      and l.quantity_on_hand>0 and (l.expiration_date is null or l.expiration_date>=current_date)
      and not exists(select 1 from quarantine_holds h where h.lot_id=l.id and h.status in ('held','rejected'))),0),
    coalesce(sum(r.quantity) filter(where r.order_id is distinct from p_order),0),
    coalesce(sum(r.quantity) filter(where r.order_id=p_order),0)
  from order_reservations r join sales_orders o on o.id=r.order_id
  where r.tenant_id=p_tenant and r.product_id=p_product and o.status in ('confirmed','picking')
$$;

create function public.set_order_reservation(p_order uuid,p_reserve boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; order_status_value order_status; line record; stock record;
begin
  tid:=public.require_warehouse_manager();
  select status into order_status_value from sales_orders where id=p_order and tenant_id=tid for update;
  if not found then raise exception 'Order not found'; end if;
  if p_reserve is null then raise exception 'Choose reserve or release'; end if;
  if not p_reserve then delete from order_reservations where order_id=p_order and tenant_id=tid; return; end if;
  if order_status_value is null or order_status_value not in ('confirmed','picking') then raise exception 'Order must be open'; end if;
  delete from order_reservations where order_id=p_order and tenant_id=tid;
  for line in select sol.product_id,sum(sol.quantity_ordered-coalesce(sol.quantity_shipped,0)) as demand,
    p.sku,p.is_archived
    from sales_order_lines sol join products p on p.id=sol.product_id and p.tenant_id=tid
    where sol.order_id=p_order and sol.tenant_id=tid and sol.quantity_ordered>coalesce(sol.quantity_shipped,0)
    group by sol.product_id,p.sku,p.is_archived order by sol.product_id
  loop
    perform pg_advisory_xact_lock(hashtext(tid::text||line.product_id::text));
    select * into stock from public.product_shipping_balance(tid,line.product_id,p_order);
    if line.is_archived or line.demand>stock.on_hand-stock.reserved_other then
      raise exception 'Cannot reserve the full quantity of %',line.sku;
    end if;
    insert into order_reservations(tenant_id,order_id,product_id,quantity) values(tid,p_order,line.product_id,line.demand);
  end loop;
  if not exists(select 1 from order_reservations where order_id=p_order and tenant_id=tid) then raise exception 'Order has no open units'; end if;
end $$;

create function public.order_reservation_status(p_order uuid)
returns table(product_id uuid,sku text,demand bigint,on_hand bigint,reserved_other bigint,reserved_for_order bigint)
language sql stable security invoker set search_path=public,pg_temp as $$
  select p.id,p.sku,sum(sl.quantity_ordered-coalesce(sl.quantity_shipped,0)),b.on_hand,b.reserved_other,b.reserved_for_order
  from sales_orders o join sales_order_lines sl on sl.order_id=o.id and sl.tenant_id=o.tenant_id
  join products p on p.id=sl.product_id and p.tenant_id=o.tenant_id
  cross join lateral public.product_shipping_balance(o.tenant_id,p.id,o.id) b
  where o.id=p_order and o.tenant_id=public.get_tenant_id() and public.get_user_role() in ('admin','manager')
    and o.status in ('confirmed','picking') and sl.quantity_ordered>coalesce(sl.quantity_shipped,0)
  group by p.id,p.sku,b.on_hand,b.reserved_other,b.reserved_for_order order by p.sku
$$;

create function public.pick_bin_replenishment()
returns table(assignment_id uuid,product_id uuid,sku text,target_code text,source_code text,source_bin_id uuid,
  lot_id uuid,pick_quantity bigint,open_demand bigint,suggested_quantity integer)
language sql stable security invoker set search_path=public,pg_temp as $$
  with scope as (select public.get_tenant_id() tid where public.get_user_role() in ('admin','manager')),
  demand as (
    select sl.product_id,sum(greatest(0,sl.quantity_ordered-coalesce(sl.quantity_shipped,0))) qty
    from scope join sales_orders o on o.tenant_id=scope.tid and o.status in ('confirmed','picking')
    join sales_order_lines sl on sl.order_id=o.id and sl.tenant_id=o.tenant_id group by sl.product_id
  ), stock as (
    select bi.* from scope join bin_inventory bi on bi.tenant_id=scope.tid and bi.quantity>0
    left join lots l on l.id=bi.lot_id and l.tenant_id=bi.tenant_id
    where bi.lot_id is null or (l.status='active' and l.quantity_on_hand>0 and (l.expiration_date is null or l.expiration_date>=current_date)
      and not exists(select 1 from quarantine_holds h where h.lot_id=l.id and h.status in ('held','rejected')))
  )
  select a.id,p.id,p.sku,dest.bin_code,src.bin_code,src.id,src.lot_id,pick.qty,d.qty,
    least(src.quantity,greatest(0,least(a.max_quantity,greatest(a.min_quantity,d.qty))-pick.qty))::integer
  from scope join product_bin_assignments a on a.tenant_id=scope.tid and a.is_active and a.bin_role='primary'
  join products p on p.id=a.product_id and p.tenant_id=a.tenant_id and not p.is_archived and not p.is_serial_tracked
  join bins dest on dest.id=a.bin_id and dest.tenant_id=a.tenant_id and dest.is_active
  join demand d on d.product_id=p.id and d.qty>0
  cross join lateral (select coalesce(sum(s.quantity),0) qty from stock s where s.bin_id=dest.id and s.product_id=p.id) pick
  cross join lateral (
    select b.id,b.bin_code,s.lot_id,s.quantity
    from stock s join bins b on b.id=s.bin_id and b.tenant_id=a.tenant_id
    where s.product_id=p.id and b.id<>dest.id and b.location_id=dest.location_id and b.is_active
      and not exists(select 1 from product_bin_assignments x where x.tenant_id=a.tenant_id and x.product_id=p.id
        and x.bin_id=b.id and x.is_active and x.bin_role='primary')
      and not exists(select 1 from scan_tasks st where st.tenant_id=a.tenant_id and st.product_id=p.id
        and st.source_bin_id=b.id and st.lot_id is not distinct from s.lot_id and st.task_type='replenish'
        and st.status in ('pending','assigned','in_progress'))
    order by s.quantity desc,b.id,s.id limit 1
  ) src
  where pick.qty<least(a.max_quantity,greatest(a.min_quantity,d.qty))
    and not exists(select 1 from scan_tasks st where st.tenant_id=a.tenant_id and st.product_id=p.id
      and st.target_bin_id=dest.id and st.task_type='replenish' and st.status in ('pending','assigned','in_progress'))
  order by d.qty-pick.qty desc,p.sku,a.id
$$;

create function public.approve_pick_bin_replenishment(p_assignment uuid,p_owner uuid default null) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; target product_bin_assignments; proposal record; task_id uuid;
begin
  tid:=public.require_warehouse_manager();
  select * into target from product_bin_assignments where id=p_assignment and tenant_id=tid;
  if not found then raise exception 'Pick-bin assignment not found'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||target.product_id::text));
  select id into task_id from scan_tasks where tenant_id=tid and product_id=target.product_id and target_bin_id=target.bin_id
    and task_type='replenish' and status in ('pending','assigned','in_progress') order by id limit 1;
  if task_id is not null then return task_id; end if;
  if p_owner is not null and not exists(select 1 from users where id=p_owner and tenant_id=tid and is_active)
    then raise exception 'Assignee unavailable'; end if;
  select * into proposal from public.pick_bin_replenishment() where assignment_id=p_assignment;
  if not found or proposal.suggested_quantity<=0 then raise exception 'Replenishment is no longer available'; end if;
  insert into scan_tasks(tenant_id,task_type,status,title,instructions,assigned_to,assigned_by,assigned_at,location_id,
    product_id,lot_id,source_bin_id,target_bin_id,requested_quantity)
  values(tid,'replenish',case when p_owner is null then 'pending'::scan_task_status else 'assigned'::scan_task_status end,
    'Replenish '||proposal.sku,'Move stock from '||proposal.source_code||' to '||proposal.target_code,
    p_owner,auth.uid(),case when p_owner is not null then now() end,(select location_id from bins where id=target.bin_id),
    target.product_id,proposal.lot_id,proposal.source_bin_id,target.bin_id,proposal.suggested_quantity) returning id into task_id;
  return task_id;
end $$;

create function public.save_warehouse_followup(p_id uuid,p_kind text,p_title text,p_source_type text,p_source_id uuid,
  p_owner uuid,p_due date,p_detail text,p_resolve boolean) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; case_id uuid; detail text;
begin
  tid:=public.require_warehouse_manager();
  detail:=nullif(trim(p_detail),'');
  if p_owner is not null and not exists(select 1 from users where id=p_owner and tenant_id=tid and is_active) then
    raise exception 'Owner must be an active workspace member';
  end if;
  if p_resolve and detail is null then raise exception 'Enter a resolution note'; end if;
  if p_id is null then
    if (p_source_type is null)<>(p_source_id is null) then raise exception 'Provide both source fields'; end if;
    if p_source_type='sales_order' and not exists(select 1 from sales_orders where id=p_source_id and tenant_id=tid)
      or p_source_type='purchase_order' and not exists(select 1 from purchase_orders where id=p_source_id and tenant_id=tid)
      or p_source_type='transfer' and not exists(select 1 from transfers where id=p_source_id and tenant_id=tid)
      then raise exception 'Source record not found'; end if;
    insert into warehouse_followups(tenant_id,kind,title,source_type,source_id,owner_id,due_date)
    values(tid,p_kind,trim(p_title),p_source_type,p_source_id,p_owner,p_due) returning id into case_id;
  else
    update warehouse_followups set owner_id=p_owner,due_date=p_due,resolved_at=case when p_resolve then now() else null end
      where id=p_id and tenant_id=tid and resolved_at is null returning id into case_id;
    if case_id is null then raise exception 'Open follow-up not found'; end if;
  end if;
  insert into warehouse_followup_events(tenant_id,followup_id,actor_id,detail)
    values(tid,case_id,auth.uid(),coalesce(detail,case when p_id is null then 'Follow-up created' else 'Assignment or due date updated' end));
  return case_id;
end $$;

create function public.record_receiving_followup() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare case_id uuid; doc_number text; source_type_value text; source_id_value uuid; case_kind text; event_detail text;
begin
  if tg_table_name='po_receiving_discrepancies' then
    source_type_value:='purchase_order'; source_id_value:=new.po_id; case_kind:='supplier';
    select po_number into doc_number from purchase_orders where id=source_id_value and tenant_id=new.tenant_id;
    event_detail:=format('%s damaged; %s open%s.%s',new.damaged_quantity,new.remaining_quantity,
      case when new.confirmed_shortage then ' (confirmed shortage)' else '' end,coalesce(' '||new.note,''));
  else
    source_type_value:='transfer'; source_id_value:=new.transfer_id; case_kind:='transfer';
    select transfer_number into doc_number from transfers where id=source_id_value and tenant_id=new.tenant_id;
    event_detail:=format('%s damaged; %s reported missing.%s',new.damaged,new.missing,coalesce(' '||new.note,''));
  end if;
  insert into warehouse_followups(tenant_id,kind,title,source_type,source_id,source_key,due_date)
  values(new.tenant_id,case_kind,left('Receiving discrepancy · '||doc_number,250),source_type_value,source_id_value,
    source_type_value||':'||source_id_value::text||':'||new.request_id::text,current_date+2)
  on conflict(tenant_id,source_key) do nothing returning id into case_id;
  if case_id is null then
    select id into case_id from warehouse_followups where tenant_id=new.tenant_id
      and source_key=source_type_value||':'||source_id_value::text||':'||new.request_id::text;
  end if;
  insert into warehouse_followup_events(tenant_id,followup_id,actor_id,detail)
    values(new.tenant_id,case_id,auth.uid(),left(event_detail,2000));
  return new;
end $$;
create trigger warehouse_followup_from_po after insert on public.po_receiving_discrepancies
  for each row execute function public.record_receiving_followup();
create trigger warehouse_followup_from_transfer after insert on public.transfer_receiving_exceptions
  for each row execute function public.record_receiving_followup();

create function public.review_transfer_receipt(p_request uuid,p_transfer uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; t transfers; input jsonb; transit transfer_stock; items jsonb:='[]';
  good integer; damaged_qty integer; missing_qty integer; note_text text;
begin
  tid:=public.require_warehouse_manager();
  if p_request is null then raise exception 'Request ID required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request::text));
  select inv.result into result from inventory_operations inv
    where tenant_id=tid and request_id=p_request and operation='review-transfer';
  if result is not null then
    if result->>'transfer_id' is distinct from p_transfer::text then raise exception 'Request belongs to another transfer'; end if;
    return result;
  end if;
  select * into t from transfers where id=p_transfer and tenant_id=tid for update;
  if not found or t.status<>'in_transit' then raise exception 'Transfer must be in transit'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0
    or (select count(distinct value->>'id') from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines)
    then raise exception 'Enter unique transfer lines'; end if;
  for input in select value from jsonb_array_elements(p_lines) order by value->>'id' loop
    select s.* into transit from transfer_stock s join transfer_lines l on l.id=s.transfer_line_id and l.tenant_id=s.tenant_id
      where l.id=(input->>'id')::uuid and l.transfer_id=t.id and s.tenant_id=tid for update of s;
    if not found then raise exception 'Transfer line not found'; end if;
    good:=coalesce((input->>'usable')::integer,0);
    damaged_qty:=coalesce((input->>'damaged')::integer,0);
    missing_qty:=coalesce((input->>'missing')::integer,0);
    note_text:=nullif(trim(input->>'note'),'');
    if good<0 or damaged_qty<0 or missing_qty<0 or length(note_text)>2000
      or good::bigint+damaged_qty+missing_qty>transit.quantity_dispatched-transit.quantity_received-transit.quantity_damaged
      then raise exception 'Receipt exceeds stock still in transit'; end if;
    if good=0 and damaged_qty=0 and missing_qty=0 then continue; end if;
    if damaged_qty>0 or missing_qty>0 then
      insert into transfer_receiving_exceptions(tenant_id,transfer_id,transfer_line_id,request_id,damaged,missing,note)
        values(tid,t.id,transit.transfer_line_id,p_request,damaged_qty,missing_qty,note_text);
    end if;
    update transfer_stock set quantity_damaged=quantity_damaged+damaged_qty where transfer_line_id=transit.transfer_line_id;
    items:=items||jsonb_build_array(jsonb_build_object('id',transit.transfer_line_id,'quantity_received',transit.quantity_received+good));
  end loop;
  if jsonb_array_length(items)=0 then raise exception 'Enter a received, damaged, or missing quantity'; end if;
  perform public.receive_transfer(t.id,items);
  result:=jsonb_build_object('transfer_id',t.id);
  insert into inventory_operations values(tid,p_request,'review-transfer',result,now());
  return result;
end $$;

create or replace function dispatch_transfer(p_transfer_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; t transfers; line transfer_lines; l lots; remaining integer; b bin_inventory;
begin
  tid:=public.require_warehouse_manager();
  select * into t from transfers where id=p_transfer_id and tenant_id=tid for update;
  if not found then raise exception 'Transfer not found'; end if;
  if t.status in ('in_transit','received') then return; end if;
  if t.status<>'pending' or not exists(select 1 from transfer_lines where transfer_id=t.id and tenant_id=tid) then raise exception 'Transfer must have lines and be pending'; end if;
  for line in select * from transfer_lines where transfer_id=t.id and tenant_id=tid order by product_id,lot_id for update loop
    perform pg_advisory_xact_lock(hashtext(tid::text||line.product_id::text));
    if exists(select 1 from public.product_shipping_balance(tid,line.product_id,null) balance where balance.reserved_other>0 and balance.on_hand-balance.reserved_other<line.quantity)
      then raise exception 'Transfer would consume stock reserved for an order'; end if;
    select * into l from lots where id=line.lot_id and tenant_id=tid and product_id=line.product_id and location_id=t.from_location_id for update;
    if not found or l.status<>'active' or l.expiration_date<current_date or line.quantity<=0 or l.quantity_on_hand<line.quantity then raise exception 'Insufficient active stock at source location'; end if;
    if exists(select 1 from quarantine_holds where lot_id=l.id and status in ('held','rejected')) then raise exception 'Cannot transfer quarantined stock'; end if;
    if exists(select 1 from products where id=l.product_id and is_serial_tracked) then raise exception 'Serialized transfer requires serial capture'; end if;
    insert into transfer_stock(transfer_line_id,tenant_id,source_lot_id,quantity_dispatched,snapshot)
      values(line.id,tid,l.id,line.quantity,to_jsonb(l));
    update lots set quantity_on_hand=quantity_on_hand-line.quantity where id=l.id;
    remaining:=line.quantity;
    for b in select * from bin_inventory where tenant_id=tid and lot_id=l.id order by id for update loop
      exit when remaining=0;
      update bin_inventory set quantity=quantity-least(quantity,remaining) where id=b.id;
      remaining:=remaining-least(b.quantity,remaining);
    end loop;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number,metadata)
      values(tid,l.product_id,l.id,auth.uid(),-line.quantity,'adjust','Transfer dispatched',t.transfer_number,jsonb_build_object('transfer_id',t.id,'in_transit',true));
  end loop;
  update transfers set status='in_transit',shipped_at=now() where id=t.id;
end $$;

create or replace function receive_transfer(p_transfer_id uuid,p_lines jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; t transfers; input jsonb; transit transfer_stock; line transfer_lines; target_total integer; delta integer; target_lot uuid; source lots;
begin
  tid:=public.require_warehouse_manager();
  select * into t from transfers where id=p_transfer_id and tenant_id=tid for update;
  if not found then raise exception 'Transfer not found'; end if;
  if t.status='received' then return; end if;
  if t.status<>'in_transit' then raise exception 'Dispatch the transfer first'; end if;
  for input in select value from jsonb_array_elements(p_lines) order by value->>'id' loop
    select * into line from transfer_lines where id=(input->>'id')::uuid and transfer_id=t.id and tenant_id=tid for update;
    if not found then raise exception 'Transfer line not found'; end if;
    select * into transit from transfer_stock where transfer_line_id=line.id and tenant_id=tid for update;
    if not found then raise exception 'Transfer stock not dispatched'; end if;
    target_total:=(input->>'quantity_received')::integer;
    if target_total is null or target_total<transit.quantity_received or target_total>transit.quantity_dispatched-transit.quantity_damaged then raise exception 'Invalid cumulative received quantity'; end if;
    delta:=target_total-transit.quantity_received;
    if delta=0 then continue; end if;
    source:=jsonb_populate_record(null::lots,transit.snapshot);
    -- Serialize destination batch creation, even when the location has no matching row yet.
    perform pg_advisory_xact_lock(hashtext(tid::text||source.product_id::text||source.lot_number||t.to_location_id::text));
    select id into target_lot from lots where tenant_id=tid and product_id=source.product_id and lot_number=source.lot_number and location_id=t.to_location_id for update;
    if target_lot is null then
      insert into lots(tenant_id,product_id,lot_number,quantity_on_hand,received_date,expiration_date,supplier_id,cost_at_receipt,location_id,location,status)
      values(tid,source.product_id,source.lot_number,delta,source.received_date,source.expiration_date,source.supplier_id,source.cost_at_receipt,t.to_location_id,
        (select name from locations where id=t.to_location_id),case when source.expiration_date<current_date then 'expired'::lot_status else 'active'::lot_status end) returning id into target_lot;
    else
      if exists(select 1 from lots where id=target_lot and expiration_date is distinct from source.expiration_date) then raise exception 'Batch expiration mismatch'; end if;
      update lots set cost_at_receipt=(quantity_on_hand*cost_at_receipt+delta*source.cost_at_receipt)/(quantity_on_hand+delta),quantity_on_hand=quantity_on_hand+delta,
        status=case when status='depleted' and (expiration_date is null or expiration_date>=current_date) then 'active'::lot_status else status end
      where id=target_lot;
    end if;
    update transfer_stock set quantity_received=target_total where transfer_line_id=line.id;
    update transfer_lines set quantity_received=target_total where id=line.id;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number,metadata)
      values(tid,source.product_id,target_lot,auth.uid(),delta,'adjust','Transfer received',t.transfer_number,jsonb_build_object('transfer_id',t.id));
  end loop;
  if not exists(select 1 from transfer_stock s join transfer_lines l on l.id=s.transfer_line_id where l.transfer_id=t.id and s.quantity_received+s.quantity_damaged<s.quantity_dispatched) then
    update transfers set status='received',received_by=auth.uid(),received_at=now() where id=t.id;
  end if;
end $$;

create function public.save_shipment_cartons(p_tenant uuid,p_ship uuid,p_lines jsonb,p_cartons jsonb,p_tracking text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare carton jsonb; tracking text; carton_no text;
begin
  if jsonb_typeof(p_cartons) is distinct from 'array' or jsonb_array_length(p_cartons) not between 1 and 100
    then raise exception 'Enter at least one carton and at most 100 cartons'; end if;
  for carton in select value from jsonb_array_elements(p_cartons) loop
    carton_no:=nullif(trim(carton->>'number'),'');
    tracking:=coalesce(nullif(trim(carton->>'tracking'),''),nullif(trim(p_tracking),''));
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

create or replace function ship_inventory(p_request_id uuid,p_shipment jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; oid uuid; sid uuid; customer uuid; line jsonb; qty integer; remaining integer; take_qty integer;
  lot lots; binrow bin_inventory; bin_remaining integer; serialrow record; serial_count integer; ordernum text; prod_id uuid; existing_order sales_orders; existing_id uuid; order_lines jsonb; scanned_serials jsonb; serial_tracked boolean; item record;
begin
  tid:=public.require_warehouse_manager();
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where o.tenant_id=tid and request_id=p_request_id and operation='ship';
  if result is not null then return result; end if;
  existing_id:=nullif(p_shipment->>'order_id','')::uuid;
  if existing_id is not null then
    select * into existing_order from sales_orders where id=existing_id and tenant_id=tid for update;
    if not found then raise exception 'Order not found'; end if;
    if existing_order.status='shipped' then
      select id into sid from shipments where order_id=existing_order.id and tenant_id=tid order by created_at limit 1;
      return jsonb_build_object('order_id',existing_order.id,'shipment_id',sid,'order_number',existing_order.order_number);
    end if;
    if existing_order.status not in ('confirmed','picking') then raise exception 'Order must be confirmed before shipping'; end if;
    oid:=existing_order.id; customer:=existing_order.customer_id; ordernum:=existing_order.order_number;
    select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity_ordered-coalesce(quantity_shipped,0),'unit_price',unit_price))
      into order_lines from sales_order_lines where order_id=oid and tenant_id=tid and quantity_ordered>coalesce(quantity_shipped,0);
    update sales_orders set status='shipped',ship_date=coalesce(nullif(p_shipment->>'ship_date','')::date,current_date) where id=oid;
  else
    customer:=(p_shipment->>'customer_id')::uuid; order_lines:=p_shipment->'lines';
    ordernum:='SO-'||p_request_id::text;
    insert into sales_orders(tenant_id,order_number,customer_id,status,ship_date,notes,created_by)
      values(tid,ordernum,customer,'shipped',coalesce(nullif(p_shipment->>'ship_date','')::date,current_date),p_shipment->>'notes',auth.uid()) returning id into oid;
  end if;
  if not exists(select 1 from customers where id=customer and tenant_id=tid and not is_archived) then raise exception 'Customer not found'; end if;
  if jsonb_typeof(order_lines) is distinct from 'array' or jsonb_array_length(order_lines)=0 then raise exception 'Order lines required'; end if;
  insert into shipments(tenant_id,order_id,customer_id,shipped_by,tracking_number,notes)
    values(tid,oid,customer,auth.uid(),nullif(p_shipment->>'tracking_number',''),p_shipment->>'notes') returning id into sid;
  if p_shipment ? 'cartons' then
    perform public.save_shipment_cartons(tid,sid,order_lines,p_shipment->'cartons',p_shipment->>'tracking_number');
  end if;
  -- Check all demand, including duplicate order lines for a SKU, before reducing stock.
  for item in select (value->>'product_id')::uuid as id,sum((value->>'quantity')::integer) as qty
    from jsonb_array_elements(order_lines) group by 1 order by 1
  loop
    perform pg_advisory_xact_lock(hashtext(tid::text||item.id::text));
    if exists(select 1 from public.product_shipping_balance(tid,item.id,existing_id) b
      where b.reserved_other>0 and b.on_hand-b.reserved_other<item.qty)
      then raise exception 'Shipment would consume stock reserved for another order'; end if;
  end loop;
  -- Stable product order avoids deadlocks when concurrent orders overlap.
  for line in select value from jsonb_array_elements(order_lines) order by value->>'product_id' loop
    prod_id:=(line->>'product_id')::uuid; qty:=(line->>'quantity')::integer;
    if qty is null or qty<=0 or coalesce((line->>'unit_price')::numeric,0)<0 then raise exception 'Invalid order line'; end if;
    if not exists(select 1 from products where id=prod_id and tenant_id=tid and not is_archived) then raise exception 'Product not found'; end if;
    select is_serial_tracked into serial_tracked from products where id=prod_id and tenant_id=tid;
    if serial_tracked then
      scanned_serials:=p_shipment->'serial_numbers'->(prod_id::text);
      if jsonb_typeof(scanned_serials) is distinct from 'array' then raise exception 'Scan one serial number per shipped unit'; end if;
      if jsonb_array_length(scanned_serials)<>qty or (select count(distinct value) from jsonb_array_elements_text(scanned_serials))<>qty then raise exception 'Scan one unique serial number per shipped unit'; end if;
      if exists(select 1 from jsonb_array_elements_text(scanned_serials) s where not exists(select 1 from serial_numbers n where n.tenant_id=tid and n.product_id=prod_id and n.serial_number=s.value and not n.is_shipped)) then raise exception 'Scanned serial is unavailable'; end if;
    end if;
    if existing_id is null then
      insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,quantity_shipped,unit_price)
        values(tid,oid,prod_id,qty,qty,coalesce((line->>'unit_price')::numeric,0));
    end if;
    remaining:=qty;
    for lot in select l.* from lots l where l.tenant_id=tid and l.product_id=prod_id and l.status='active' and l.quantity_on_hand>0
      and (l.expiration_date is null or l.expiration_date>=current_date)
      and not exists(select 1 from quarantine_holds h where h.lot_id=l.id and h.status in ('held','rejected'))
      order by l.expiration_date nulls last,l.received_date,l.id for update
    loop
      exit when remaining=0;
      take_qty:=least(remaining,lot.quantity_on_hand);
      if serial_tracked then
        select count(*) into serial_count from serial_numbers n where n.tenant_id=tid and n.product_id=prod_id and n.lot_id=lot.id and not n.is_shipped and n.serial_number in (select value from jsonb_array_elements_text(scanned_serials));
        take_qty:=least(take_qty,serial_count);
        if take_qty=0 then continue; end if;
      end if;
      update lots set quantity_on_hand=quantity_on_hand-take_qty,status=case when quantity_on_hand=take_qty then 'depleted'::lot_status else status end where id=lot.id;
      insert into shipment_lines(tenant_id,shipment_id,product_id,lot_id,quantity) values(tid,sid,prod_id,lot.id,take_qty);
      insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
        values(tid,prod_id,lot.id,auth.uid(),-take_qty,'ship','Order shipped',ordernum);
      bin_remaining:=take_qty;
      for binrow in select * from bin_inventory where tenant_id=tid and lot_id=lot.id and product_id=prod_id and quantity>0 order by id for update loop
        exit when bin_remaining=0;
        update bin_inventory set quantity=quantity-least(bin_remaining,binrow.quantity) where id=binrow.id;
        bin_remaining:=bin_remaining-least(bin_remaining,binrow.quantity);
      end loop;
      if serial_tracked then
        serial_count:=0;
        for serialrow in select id from serial_numbers where tenant_id=tid and product_id=prod_id and lot_id=lot.id and not is_shipped and serial_number in (select value from jsonb_array_elements_text(scanned_serials)) order by serial_number limit take_qty for update loop
          update serial_numbers set is_shipped=true,shipped_at=now(),shipment_id=sid where id=serialrow.id;
          serial_count:=serial_count+1;
        end loop;
        if serial_count<>take_qty then raise exception 'Missing serial numbers'; end if;
      end if;
      remaining:=remaining-take_qty;
    end loop;
    if remaining<>0 then raise exception 'Insufficient available stock'; end if;
  end loop;
  if existing_id is not null then update sales_order_lines set quantity_shipped=quantity_ordered where order_id=oid and tenant_id=tid; end if;
  if existing_id is not null then delete from order_reservations where order_id=existing_id and tenant_id=tid; end if;
  result:=jsonb_build_object('order_id',oid,'shipment_id',sid,'order_number',ordernum);
  insert into inventory_operations values(tid,p_request_id,'ship',result,now());
  return result;
end $$;

-- Bring existing supplier discrepancies into the queue with their original timestamps.
with historical as (
  select d.tenant_id,d.po_id,d.request_id,min(d.created_at) as created_at
  from po_receiving_discrepancies d group by d.tenant_id,d.po_id,d.request_id
)
insert into warehouse_followups(tenant_id,kind,title,source_type,source_id,source_key,due_date,created_at)
select h.tenant_id,'supplier',left('Receiving discrepancy · '||o.po_number,250),'purchase_order',h.po_id,
  'purchase_order:'||h.po_id::text||':'||h.request_id::text,h.created_at::date+2,h.created_at
from historical h join purchase_orders o on o.id=h.po_id and o.tenant_id=h.tenant_id;

insert into warehouse_followup_events(tenant_id,followup_id,actor_id,detail,created_at)
select d.tenant_id,f.id,d.recorded_by,
  left(format('%s damaged; %s open%s.%s',d.damaged_quantity,d.remaining_quantity,
    case when d.confirmed_shortage then ' (confirmed shortage)' else '' end,coalesce(' '||d.note,'')),2000),d.created_at
from po_receiving_discrepancies d join warehouse_followups f on f.tenant_id=d.tenant_id
  and f.source_key='purchase_order:'||d.po_id::text||':'||d.request_id::text;

revoke all on function public.save_shipment_cartons(uuid,uuid,jsonb,jsonb,text),public.record_receiving_followup()
  from public,anon,authenticated;
revoke all on function public.require_warehouse_manager(),public.product_shipping_balance(uuid,uuid,uuid),
  public.set_order_reservation(uuid,boolean),public.order_reservation_status(uuid),public.pick_bin_replenishment(),
  public.approve_pick_bin_replenishment(uuid,uuid),public.save_warehouse_followup(uuid,text,text,text,uuid,uuid,date,text,boolean),
  public.review_transfer_receipt(uuid,uuid,jsonb) from public,anon;
grant execute on function public.require_warehouse_manager(),public.product_shipping_balance(uuid,uuid,uuid),
  public.set_order_reservation(uuid,boolean),public.order_reservation_status(uuid),public.pick_bin_replenishment(),
  public.approve_pick_bin_replenishment(uuid,uuid),public.save_warehouse_followup(uuid,text,text,text,uuid,uuid,date,text,boolean),
  public.review_transfer_receipt(uuid,uuid,jsonb) to authenticated;

commit;
