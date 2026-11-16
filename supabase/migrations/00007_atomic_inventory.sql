begin;
create table inventory_operations (
  tenant_id uuid not null references tenants(id) on delete cascade,
  request_id uuid not null,
  operation text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(tenant_id,request_id)
);
alter table inventory_operations enable row level security;
revoke all on inventory_operations from anon,authenticated;
grant all on inventory_operations to service_role;

create function tenant_has_access() returns boolean language sql security definer stable set search_path=public,pg_temp as $$
  select exists(select 1 from tenant_billing where tenant_id=public.get_tenant_id()
    and (status='active' or (status='trialing' and trial_ends_at>now())))
$$;
create function require_inventory_access() returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid;
begin
  tid:=public.get_tenant_id();
  if tid is null then raise exception 'Active account required'; end if;
  if not public.tenant_has_access() then raise exception 'An active subscription or trial is required'; end if;
  return tid;
end $$;

create function receive_inventory(p_request_id uuid,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; lot_id uuid; prod products; qty integer; serials jsonb;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where o.tenant_id=tid and request_id=p_request_id and operation='receive';
  if result is not null then return result; end if;
  qty:=(p_receipt->>'quantity')::integer;
  if qty is null or qty<=0 or nullif(trim(p_receipt->>'lot_number'),'') is null then raise exception 'Positive quantity and lot number required'; end if;
  select * into prod from products where id=(p_receipt->>'product_id')::uuid and tenant_id=tid and not is_archived;
  if not found then raise exception 'Product not found'; end if;
  if coalesce((p_receipt->>'cost_at_receipt')::numeric,0)<0 then raise exception 'Cost cannot be negative'; end if;
  serials:=coalesce(p_receipt->'serial_numbers','[]');
  if prod.is_serial_tracked and jsonb_array_length(serials)<>qty then raise exception 'One serial number per unit required'; end if;
  insert into lots(tenant_id,product_id,lot_number,quantity_on_hand,expiration_date,supplier_id,cost_at_receipt,location,notes)
  values(tid,prod.id,p_receipt->>'lot_number',qty,nullif(p_receipt->>'expiration_date','')::date,nullif(p_receipt->>'supplier_id','')::uuid,
    coalesce((p_receipt->>'cost_at_receipt')::numeric,0),p_receipt->>'location',p_receipt->>'notes') returning id into lot_id;
  insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
  values(tid,prod.id,lot_id,auth.uid(),qty,'receive','Inventory received',p_receipt->>'lot_number');
  if prod.is_serial_tracked then
    insert into serial_numbers(tenant_id,product_id,lot_id,serial_number)
    select tid,prod.id,lot_id,value from jsonb_array_elements_text(serials);
  end if;
  result:=jsonb_build_object('lot_id',lot_id);
  insert into inventory_operations values(tid,p_request_id,'receive',result,now());
  return result;
end $$;

create function ship_inventory(p_request_id uuid,p_shipment jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; oid uuid; sid uuid; customer uuid; line jsonb; qty integer; remaining integer; take_qty integer;
  lot lots; binrow bin_inventory; bin_remaining integer; serialrow record; serial_count integer; ordernum text; prod_id uuid; existing_order sales_orders; existing_id uuid; order_lines jsonb;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
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
    select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity_ordered-quantity_shipped,'unit_price',unit_price))
      into order_lines from sales_order_lines where order_id=oid and tenant_id=tid and quantity_ordered>quantity_shipped;
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
  -- Stable product order avoids deadlocks when concurrent orders overlap.
  for line in select value from jsonb_array_elements(order_lines) order by value->>'product_id' loop
    prod_id:=(line->>'product_id')::uuid; qty:=(line->>'quantity')::integer;
    if qty is null or qty<=0 or coalesce((line->>'unit_price')::numeric,0)<0 then raise exception 'Invalid order line'; end if;
    if not exists(select 1 from products where id=prod_id and tenant_id=tid and not is_archived) then raise exception 'Product not found'; end if;
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
      if exists(select 1 from products where id=prod_id and is_serial_tracked) then
        serial_count:=0;
        for serialrow in select id from serial_numbers where tenant_id=tid and lot_id=lot.id and not is_shipped order by serial_number limit take_qty for update loop
          update serial_numbers set is_shipped=true,shipped_at=now() where id=serialrow.id;
          serial_count:=serial_count+1;
        end loop;
        if serial_count<>take_qty then raise exception 'Missing serial numbers'; end if;
      end if;
      remaining:=remaining-take_qty;
    end loop;
    if remaining<>0 then raise exception 'Insufficient available stock'; end if;
  end loop;
  if existing_id is not null then update sales_order_lines set quantity_shipped=quantity_ordered where order_id=oid and tenant_id=tid; end if;
  result:=jsonb_build_object('order_id',oid,'shipment_id',sid,'order_number',ordernum);
  insert into inventory_operations values(tid,p_request_id,'ship',result,now());
  return result;
end $$;
revoke all on function receive_inventory(uuid,jsonb),ship_inventory(uuid,jsonb),require_inventory_access(),tenant_has_access() from public,anon;
grant execute on function receive_inventory(uuid,jsonb),ship_inventory(uuid,jsonb),tenant_has_access() to authenticated;
commit;
