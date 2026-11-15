begin;
create or replace function public.get_user_role() returns user_role
language sql security definer stable set search_path=public,pg_temp as $$
  select case when access_level='scanner_only' then 'staff'::user_role else role end from users where id=auth.uid() and is_active=true
$$;

-- Staff are floor operators. Financial catalog/lot data stays on manager/admin paths.
create view staff_products with(security_barrier=true) as
select id,tenant_id,name,sku,manufacturer,category,unit_of_measure,price,low_stock_threshold,storage_requirement,
 is_lot_tracked,is_serial_tracked,expiry_alert_days,is_archived,image_url,aisle,section,created_at,updated_at
from products where tenant_id=public.get_tenant_id();
create view staff_lots with(security_barrier=true) as
select id,tenant_id,product_id,lot_number,expiration_date,quantity_on_hand,received_date,location,location_id,zone_id,status,created_at,updated_at
from lots where tenant_id=public.get_tenant_id();
revoke all on staff_products,staff_lots from public,anon,authenticated;
grant select on staff_products,staff_lots to authenticated;

do $$ declare t text; begin
  foreach t in array array['products','lots','stock_movements','purchase_orders','po_lines','returns','return_lines','customer_prices','price_tiers','suppliers','documents','temperature_logs'] loop
    execute format('drop policy if exists tenant_select on %I',t);
    execute format('create policy manager_read on %I for select using(tenant_id=public.get_tenant_id() and public.get_user_role() in (''admin'',''manager''))',t);
  end loop;
  foreach t in array array['products','suppliers','customers','lots','serial_numbers','stock_movements','sales_orders','sales_order_lines','shipments','shipment_lines',
    'locations','zones','bins','bin_inventory','product_bin_assignments','purchase_orders','po_lines','transfers','transfer_lines',
    'returns','return_lines','cycle_counts','cycle_count_lines','quarantine_holds','documents','kits','kit_components','kit_assemblies','kit_assembly_lots',
    'custom_field_definitions','custom_field_values','temperature_logs','price_tiers','customer_prices'] loop
    execute format('drop policy if exists tenant_insert on %I',t);
    execute format('drop policy if exists tenant_update on %I',t);
    execute format('drop policy if exists tenant_delete on %I',t);
    execute format('create policy manager_mutation on %I for all using(tenant_id=public.get_tenant_id() and public.get_user_role() in (''admin'',''manager'')) with check(tenant_id=public.get_tenant_id() and public.get_user_role() in (''admin'',''manager''))',t);
  end loop;
end $$;
-- Task ownership is a database rule, not a UI filter.
drop policy if exists tenant_select on scan_tasks;
drop policy if exists tenant_insert on scan_tasks;
drop policy if exists tenant_update on scan_tasks;
drop policy if exists tenant_delete on scan_tasks;
create policy task_read on scan_tasks for select using(tenant_id=public.get_tenant_id() and (public.get_user_role() in ('admin','manager') or assigned_to=auth.uid()));
create policy task_manager on scan_tasks for all using(tenant_id=public.get_tenant_id() and public.get_user_role() in ('admin','manager')) with check(tenant_id=public.get_tenant_id() and public.get_user_role() in ('admin','manager'));
-- Associates post results using a checked transactional RPC, not arbitrary task updates.
drop policy if exists tenant_insert on scan_logs;
drop policy if exists tenant_update on scan_logs;
drop policy if exists tenant_delete on scan_logs;
create policy scan_insert on scan_logs for insert with check(tenant_id=public.get_tenant_id() and scanned_by=auth.uid() and
  exists(select 1 from scan_tasks where id=task_id and assigned_to=auth.uid() and tenant_id=public.get_tenant_id()));

create function start_scan_task(p_task_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform require_inventory_access();
  update scan_tasks set status='in_progress',started_at=coalesce(started_at,now()) where id=p_task_id and tenant_id=public.get_tenant_id()
    and (assigned_to=auth.uid() or public.get_user_role() in ('admin','manager')) and status in ('pending','assigned','in_progress');
  if not found then raise exception 'Task is not assigned to this account'; end if;
end $$;
create function complete_scan_task(p_task_id uuid,p_quantity integer,p_variance integer,p_source text,p_target text,p_scans jsonb) returns void
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
    if qty is null or qty<=0 or qty<>task.requested_quantity then raise exception 'Confirm the assigned pick quantity'; end if;
    -- Picking confirms a task; final shipment posting owns stock decrements.
  end if;
  update scan_tasks set status='completed',completed_by=auth.uid(),completed_at=now(),scanned_quantity=qty,variance=p_variance where id=task.id;
  insert into scan_logs(tenant_id,task_id,scanned_by,scan_type,scanned_value)
  select tid,task.id,auth.uid(),task.task_type::text,left(value->>'value',1000) from jsonb_array_elements(p_scans);
end $$;
revoke all on function start_scan_task(uuid),complete_scan_task(uuid,integer,integer,text,text,jsonb) from public,anon;
grant execute on function start_scan_task(uuid),complete_scan_task(uuid,integer,integer,text,text,jsonb) to authenticated;
commit;
