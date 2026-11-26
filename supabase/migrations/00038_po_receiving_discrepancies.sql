begin;

create table public.po_receiving_discrepancies (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  po_line_id uuid not null references public.po_lines(id) on delete cascade,
  request_id uuid not null,
  recorded_by uuid references public.users(id) on delete set null,
  ordered_quantity integer not null,
  previously_received integer not null,
  usable_quantity integer not null check (usable_quantity >= 0),
  damaged_quantity integer not null check (damaged_quantity >= 0),
  remaining_quantity integer not null check (remaining_quantity >= 0),
  confirmed_shortage boolean not null,
  lot_number text,
  note text check (length(note) <= 2000),
  created_at timestamptz not null default now(),
  primary key (tenant_id, request_id, po_line_id)
);
create index po_receiving_discrepancies_order_idx
  on public.po_receiving_discrepancies(tenant_id, po_id, created_at desc);
alter table public.po_receiving_discrepancies enable row level security;
revoke all on public.po_receiving_discrepancies from anon, authenticated;
grant select on public.po_receiving_discrepancies to authenticated;
create policy po_receiving_discrepancies_manager_read on public.po_receiving_discrepancies
  for select to authenticated using (
    tenant_id = (select public.get_tenant_id())
    and (select public.get_user_role()) in ('admin','manager')
  );

-- Damaged units close delivered quantities on the PO but never enter saleable stock.
create or replace function receive_purchase_order(p_request_id uuid,p_po_id uuid,p_location_id uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; po purchase_orders; line jsonb; pol po_lines; qty integer; damaged integer; missing integer; follow_up boolean; lotid uuid; target uuid; all_received boolean; locname text;
begin
  tid:=require_inventory_access();
  if coalesce(public.get_user_role()::text,'') not in ('admin','manager') then raise exception 'Manager required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where tenant_id=tid and request_id=p_request_id and operation='receive-po';
  if result is not null then
    if result->>'po_id' is distinct from p_po_id::text then raise exception 'Receipt request belongs to another PO'; end if;
    return result;
  end if;
  select * into po from purchase_orders where id=p_po_id and tenant_id=tid for update;
  if not found or po.status not in ('approved','sent','partial') then raise exception 'PO must be approved or sent before receiving'; end if;
  select name into locname from locations where id=p_location_id and tenant_id=tid and is_active;
  if not found then raise exception 'Receiving location required'; end if;
  if p_request_id is null then raise exception 'Receipt request ID required'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then raise exception 'Receipt lines required'; end if;
  if (select count(distinct value->>'po_line_id') from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) then
    raise exception 'Each PO line can only be entered once per receipt';
  end if;
  for line in select value from jsonb_array_elements(p_lines) order by value->>'po_line_id' loop
    select * into pol from po_lines where id=(line->>'po_line_id')::uuid and po_id=po.id and tenant_id=tid for update;
    if not found then raise exception 'PO line not found'; end if;
    qty:=(line->>'quantity_to_receive')::integer;
    damaged:=coalesce((line->>'damaged_quantity')::integer,0);
    follow_up:=coalesce((line->>'confirmed_shortage')::boolean,false);
    missing:=pol.quantity_ordered-coalesce(pol.quantity_received,0)-qty-damaged;
    if qty is null or qty<0 or damaged<0 or missing<0 or (qty+damaged=0 and not follow_up) then
      raise exception 'Invalid receipt quantity or overage';
    end if;
    if follow_up and missing=0 then raise exception 'There is no remaining shortage for this line'; end if;
    if qty+damaged>0 and nullif(trim(line->>'lot_number'),'') is null then raise exception 'Lot number required'; end if;
    if damaged>0 or follow_up then
      insert into public.po_receiving_discrepancies(
        tenant_id,po_id,po_line_id,request_id,recorded_by,ordered_quantity,previously_received,
        usable_quantity,damaged_quantity,remaining_quantity,confirmed_shortage,lot_number,note
      ) values (
        tid,po.id,pol.id,p_request_id,auth.uid(),pol.quantity_ordered,coalesce(pol.quantity_received,0),
        qty,damaged,missing,follow_up,nullif(trim(line->>'lot_number'),''),nullif(trim(line->>'discrepancy_note'),'')
      );
    end if;
    update po_lines set quantity_received=coalesce(quantity_received,0)+qty+damaged where id=pol.id;
    if qty=0 then continue; end if;
    if exists(select 1 from products where id=pol.product_id and is_serial_tracked) then raise exception 'Serial-tracked PO receiving requires individual serial capture'; end if;
    insert into lots(tenant_id,product_id,lot_number,quantity_on_hand,expiration_date,supplier_id,cost_at_receipt,location_id,location)
    values(tid,pol.product_id,line->>'lot_number',qty,nullif(line->>'expiration_date','')::date,po.supplier_id,pol.unit_cost,p_location_id,locname) returning id into lotid;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
    values(tid,pol.product_id,lotid,auth.uid(),qty,'receive','PO received',po.po_number);
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

revoke all on function public.receive_purchase_order(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.receive_purchase_order(uuid,uuid,uuid,jsonb) to authenticated;

commit;
