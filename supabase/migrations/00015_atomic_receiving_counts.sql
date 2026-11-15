begin;
create function receive_purchase_order(p_request_id uuid,p_po_id uuid,p_location_id uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; po purchase_orders; line jsonb; pol po_lines; qty integer; lotid uuid; target uuid; all_received boolean; locname text;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where tenant_id=tid and request_id=p_request_id and operation='receive-po';
  if result is not null then return result; end if;
  select * into po from purchase_orders where id=p_po_id and tenant_id=tid for update;
  if not found or po.status not in ('approved','sent','partial') then raise exception 'PO must be approved or sent before receiving'; end if;
  select name into locname from locations where id=p_location_id and tenant_id=tid and is_active;
  if not found then raise exception 'Receiving location required'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then raise exception 'Receipt lines required'; end if;
  for line in select value from jsonb_array_elements(p_lines) order by value->>'po_line_id' loop
    select * into pol from po_lines where id=(line->>'po_line_id')::uuid and po_id=po.id and tenant_id=tid for update;
    qty:=(line->>'quantity_to_receive')::integer;
    if not found or qty is null or qty<=0 or qty>pol.quantity_ordered-pol.quantity_received then raise exception 'Invalid receipt quantity'; end if;
    if exists(select 1 from products where id=pol.product_id and is_serial_tracked) then raise exception 'Serial-tracked PO receiving requires individual serial capture'; end if;
    if nullif(trim(line->>'lot_number'),'') is null then raise exception 'Lot number required'; end if;
    insert into lots(tenant_id,product_id,lot_number,quantity_on_hand,expiration_date,supplier_id,cost_at_receipt,location_id,location)
    values(tid,pol.product_id,line->>'lot_number',qty,nullif(line->>'expiration_date','')::date,po.supplier_id,pol.unit_cost,p_location_id,locname) returning id into lotid;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
    values(tid,pol.product_id,lotid,auth.uid(),qty,'receive','PO received',po.po_number);
    update po_lines set quantity_received=quantity_received+qty where id=pol.id;
    select bin_id into target from product_bin_assignments where tenant_id=tid and product_id=pol.product_id and bin_role='primary' and is_active order by created_at limit 1;
    insert into scan_tasks(tenant_id,task_type,status,title,assigned_by,location_id,product_id,lot_id,target_bin_id,requested_quantity)
    values(tid,'putaway','pending','Put away lot '||(line->>'lot_number'),auth.uid(),p_location_id,pol.product_id,lotid,target,qty);
  end loop;
  select bool_and(quantity_received>=quantity_ordered) into all_received from po_lines where po_id=po.id;
  update purchase_orders set status=case when all_received then 'received'::po_status else 'partial'::po_status end where id=po.id;
  result:=jsonb_build_object('po_id',po.id,'received_lines',jsonb_array_length(p_lines));
  insert into inventory_operations values(tid,p_request_id,'receive-po',result,now());
  return result;
end $$;

create function post_cycle_count(p_count_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; countrow cycle_counts; line cycle_count_lines; l lots; b bin_inventory; bins_count integer;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  select * into countrow from cycle_counts where id=p_count_id and tenant_id=tid for update;
  if not found then raise exception 'Count not found'; end if;
  if countrow.status='approved' then return; end if;
  if countrow.status<>'pending_review' then raise exception 'Count must be submitted for review'; end if;
  for line in select * from cycle_count_lines where count_id=countrow.id and tenant_id=tid order by lot_id for update loop
    if line.counted_quantity is null or line.counted_quantity<0 then raise exception 'Every line needs a nonnegative count'; end if;
    if line.variance=0 then continue; end if;
    if line.lot_id is null then raise exception 'Count by lot before posting a variance'; end if;
    select * into l from lots where id=line.lot_id and tenant_id=tid and product_id=line.product_id for update;
    if not found or l.quantity_on_hand<>line.system_quantity then raise exception 'Stock changed after count planning. Recount this lot.'; end if;
    select count(*) into bins_count from bin_inventory where tenant_id=tid and lot_id=l.id and product_id=line.product_id and quantity>0;
    if bins_count>1 then raise exception 'This lot spans multiple bins. Recount by bin before posting.'; end if;
    for b in select * from bin_inventory where tenant_id=tid and lot_id=l.id and product_id=line.product_id and quantity>0 for update loop
      if b.quantity<>line.system_quantity then raise exception 'Located and lot quantities differ. Reconcile before posting.'; end if;
      update bin_inventory set quantity=line.counted_quantity where id=b.id;
    end loop;
    update lots set quantity_on_hand=line.counted_quantity where id=l.id;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
    values(tid,line.product_id,l.id,auth.uid(),line.variance,'adjust','Cycle count variance',countrow.count_number);
  end loop;
  update cycle_counts set status='approved',approved_by=auth.uid(),approved_at=now() where id=countrow.id;
end $$;

create function resolve_quarantine(p_hold_id uuid,p_action text,p_note text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; hold quarantine_holds; l lots; b bin_inventory; remaining integer;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  if p_action not in ('released','rejected','destroyed') or nullif(trim(p_note),'') is null then raise exception 'Disposition and approval note required'; end if;
  select * into hold from quarantine_holds where id=p_hold_id and tenant_id=tid for update;
  if not found then raise exception 'Hold not found'; end if;
  if hold.status::text=p_action then return; end if;
  if hold.status<>'held' then raise exception 'Hold already resolved'; end if;
  select * into l from lots where id=hold.lot_id and tenant_id=tid for update;
  if not found then raise exception 'Lot not found'; end if;
  if p_action='destroyed' then
    if hold.quantity>l.quantity_on_hand then raise exception 'Hold quantity exceeds lot stock'; end if;
    update lots set quantity_on_hand=quantity_on_hand-hold.quantity where id=l.id;
    remaining:=hold.quantity;
    for b in select * from bin_inventory where tenant_id=tid and lot_id=l.id order by id for update loop
      exit when remaining=0;
      update bin_inventory set quantity=quantity-least(quantity,remaining) where id=b.id;
      remaining:=remaining-least(b.quantity,remaining);
    end loop;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
    values(tid,hold.product_id,l.id,auth.uid(),-hold.quantity,'adjust','Quarantine destruction: '||p_note,hold.id::text);
  end if;
  update quarantine_holds set status=p_action::quarantine_status,released_by=auth.uid(),released_at=now(),notes=p_note where id=hold.id;
end $$;
revoke all on function receive_purchase_order(uuid,uuid,uuid,jsonb),post_cycle_count(uuid),resolve_quarantine(uuid,text,text) from public,anon;
grant execute on function receive_purchase_order(uuid,uuid,uuid,jsonb),post_cycle_count(uuid),resolve_quarantine(uuid,text,text) to authenticated;
commit;
