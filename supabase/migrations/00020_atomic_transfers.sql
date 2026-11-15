begin;
-- A physical batch may exist at multiple warehouses. IDs still identify individual stock balances.
alter table lots drop constraint lots_tenant_id_product_id_lot_number_key;
alter table lots add constraint lot_at_location_unique unique nulls not distinct(tenant_id,product_id,lot_number,location_id);
create table transfer_stock (
  transfer_line_id uuid primary key references transfer_lines(id),tenant_id uuid not null references tenants(id),
  source_lot_id uuid not null references lots(id),quantity_dispatched integer not null check(quantity_dispatched>0),
  quantity_received integer not null default 0 check(quantity_received>=0 and quantity_received<=quantity_dispatched),
  snapshot jsonb not null
);
alter table transfer_stock enable row level security;
create policy transit_read on transfer_stock for select using(tenant_id=public.get_tenant_id() and public.get_user_role() in ('admin','manager'));
revoke insert,update,delete on transfer_stock from authenticated,anon;
create trigger enforce_tenant_relations before insert or update on transfer_stock for each row execute function enforce_tenant_relations();

create function dispatch_transfer(p_transfer_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; t transfers; line transfer_lines; l lots; remaining integer; b bin_inventory;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  select * into t from transfers where id=p_transfer_id and tenant_id=tid for update;
  if not found then raise exception 'Transfer not found'; end if;
  if t.status in ('in_transit','received') then return; end if;
  if t.status<>'pending' or not exists(select 1 from transfer_lines where transfer_id=t.id and tenant_id=tid) then raise exception 'Transfer must have lines and be pending'; end if;
  for line in select * from transfer_lines where transfer_id=t.id and tenant_id=tid order by lot_id for update loop
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

create function receive_transfer(p_transfer_id uuid,p_lines jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; t transfers; input jsonb; transit transfer_stock; line transfer_lines; target_total integer; delta integer; target_lot uuid; source lots;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
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
    if target_total is null or target_total<transit.quantity_received or target_total>transit.quantity_dispatched then raise exception 'Invalid cumulative received quantity'; end if;
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
      update lots set cost_at_receipt=(quantity_on_hand*cost_at_receipt+delta*source.cost_at_receipt)/(quantity_on_hand+delta),quantity_on_hand=quantity_on_hand+delta where id=target_lot;
    end if;
    update transfer_stock set quantity_received=target_total where transfer_line_id=line.id;
    update transfer_lines set quantity_received=target_total where id=line.id;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number,metadata)
      values(tid,source.product_id,target_lot,auth.uid(),delta,'adjust','Transfer received',t.transfer_number,jsonb_build_object('transfer_id',t.id));
  end loop;
  if not exists(select 1 from transfer_stock s join transfer_lines l on l.id=s.transfer_line_id where l.transfer_id=t.id and s.quantity_received<s.quantity_dispatched) then
    update transfers set status='received',received_by=auth.uid(),received_at=now() where id=t.id;
  end if;
end $$;
revoke all on function dispatch_transfer(uuid),receive_transfer(uuid,jsonb) from public,anon;
grant execute on function dispatch_transfer(uuid),receive_transfer(uuid,jsonb) to authenticated;
commit;
