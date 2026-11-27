begin;

-- Dedicated RPC: older schemas must fail closed rather than treating selected quantities as a full shipment.

create function public.ship_local_order_quantities(p_request_id uuid,p_shipment jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; oid uuid; sid uuid; customer uuid; line jsonb; qty integer; remaining integer; take_qty integer;
  lot lots; binrow bin_inventory; bin_remaining integer; serialrow record; serial_count integer; ordernum text; prod_id uuid; existing_order sales_orders; existing_id uuid; order_lines jsonb; scanned_serials jsonb; serial_tracked boolean; item record; requested jsonb; has_backorder boolean := false;
begin
  tid:=public.require_warehouse_manager();
  if p_request_id is null then raise exception 'Request ID required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where o.tenant_id=tid and request_id=p_request_id and operation='ship';
  if result is not null then return result; end if;
  existing_id:=nullif(p_shipment->>'order_id','')::uuid;
  if existing_id is null or not (p_shipment ? 'order_quantities') then
    raise exception 'An existing local order and shipment quantities are required';
  end if;
  select * into existing_order from sales_orders where id=existing_id and tenant_id=tid for update;
  if not found then raise exception 'Order not found'; end if;
  if existing_order.status not in ('confirmed','picking') then raise exception 'Order must be confirmed before shipping'; end if;
  oid:=existing_order.id; customer:=existing_order.customer_id; ordernum:=existing_order.order_number;
  requested := p_shipment->'order_quantities';
  if existing_order.order_number ~ '^SHOPIFY-[0-9]+$' then
    raise exception 'Partial Shopify shipments are not enabled';
  end if;
  if jsonb_typeof(requested) is distinct from 'object' or requested = '{}'::jsonb then
    raise exception 'Order quantities required';
  end if;
  if exists (
    select 1 from jsonb_each(requested) q
    left join sales_order_lines sl on sl.id::text=q.key and sl.order_id=oid and sl.tenant_id=tid
    where sl.id is null or jsonb_typeof(q.value)<>'number'
      or q.value::text !~ '^[1-9][0-9]{0,9}$'
      or (case when q.value::text ~ '^[1-9][0-9]{0,9}$' then q.value::text::bigint end)
        > sl.quantity_ordered-coalesce(sl.quantity_shipped,0)
  ) then raise exception 'Invalid shipment quantity or order line'; end if;
  if not (p_shipment ? 'cartons') and exists (
    select 1 from sales_order_lines sl where sl.order_id=oid and sl.tenant_id=tid
      and sl.quantity_ordered-coalesce(sl.quantity_shipped,0)>coalesce((requested->>sl.id::text)::integer,0)
  ) then raise exception 'Scan items into cartons before posting a partial shipment'; end if;
  select jsonb_agg(jsonb_build_object('product_id',sl.product_id,'quantity',sl.quantity))
    into order_lines
  from (
    select product_id,sum(coalesce((requested->>id::text)::integer,0)) quantity
    from sales_order_lines where order_id=oid and tenant_id=tid
      and quantity_ordered>coalesce(quantity_shipped,0)
    group by product_id
  ) sl where sl.quantity>0;
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
  update sales_order_lines set quantity_shipped=coalesce(quantity_shipped,0)+(requested->>id::text)::integer
  where order_id=oid and tenant_id=tid and requested ? id::text;
  select exists(select 1 from sales_order_lines where tenant_id=tid and order_id=oid
    and quantity_ordered>coalesce(quantity_shipped,0)) into has_backorder;
  if has_backorder then
    update sales_orders set status='picking' where id=oid and tenant_id=tid;
    -- Retain only the still-open portion of the existing reservation.
    delete from order_reservations r using (
      select (value->>'product_id')::uuid id,(value->>'quantity')::integer qty
      from jsonb_array_elements(order_lines)
    ) shipped where r.order_id=oid and r.tenant_id=tid and r.product_id=shipped.id and r.quantity<=shipped.qty;
    update order_reservations r set quantity=r.quantity-shipped.qty from (
      select (value->>'product_id')::uuid id,(value->>'quantity')::integer qty
      from jsonb_array_elements(order_lines)
    ) shipped where r.order_id=oid and r.tenant_id=tid and r.product_id=shipped.id;
  else
    update sales_orders set status='shipped',ship_date=coalesce(nullif(p_shipment->>'ship_date','')::date,current_date)
      where id=oid and tenant_id=tid;
    delete from order_reservations where order_id=oid and tenant_id=tid;
  end if;
  result:=jsonb_build_object('order_id',oid,'shipment_id',sid,'order_number',ordernum,'has_backorder',has_backorder);
  insert into inventory_operations values(tid,p_request_id,'ship',result,now());
  return result;
end $$;

revoke all on function public.ship_local_order_quantities(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.ship_local_order_quantities(uuid,jsonb) to authenticated;

commit;
