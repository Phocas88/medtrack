begin;

alter table public.shipments add column shopify_split boolean not null default false;
alter table public.integration_jobs add column fulfillment_attempted_at timestamptz;

create function public.enforce_shopify_split_tracking() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not new.shopify_split and exists(select 1 from shipments where order_id=new.order_id and tenant_id=new.tenant_id and shopify_split) then
    raise exception 'This Shopify order requires the split shipment workflow and unique tracking';
  end if;
  return new;
end $$;
create trigger enforce_shopify_split_tracking before insert on public.shipments
for each row execute function public.enforce_shopify_split_tracking();

create function public.mark_split_fulfillment_attempt(p_job uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare job integration_jobs; current_shipment shipments;
begin
  select * into job from integration_jobs where id=p_job and lease_token=p_lease and lease_until>now()
    and status='running' and fulfillment_attempted_at is null and payload->>'kind'='fulfillment' for update;
  if not found then return false; end if;
  select * into current_shipment from shipments where id=(job.payload->>'shipment_id')::uuid and tenant_id=job.tenant_id and shopify_split;
  if not found then return false; end if;
  if exists(select 1 from shipments s join integration_jobs j on j.tenant_id=s.tenant_id and j.event_id='fulfillment:'||s.id::text
    where s.tenant_id=job.tenant_id and s.order_id=current_shipment.order_id
      and (s.created_at,s.id)<(current_shipment.created_at,current_shipment.id) and j.status<>'complete')
    then return false; end if;
  update integration_jobs set fulfillment_attempted_at=now() where id=p_job;
  return true;
end $$;

create function public.ship_order_quantities(p_request_id uuid,p_shipment jsonb) returns jsonb
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
    raise exception 'An existing order and shipment quantities are required';
  end if;
  select * into existing_order from sales_orders where id=existing_id and tenant_id=tid for update;
  if not found then raise exception 'Order not found'; end if;
  if existing_order.status not in ('confirmed','picking') then raise exception 'Order must be confirmed before shipping'; end if;
  oid:=existing_order.id; customer:=existing_order.customer_id; ordernum:=existing_order.order_number;
  requested := p_shipment->'order_quantities';
  if existing_order.order_number ~ '^SHOPIFY-[0-9]+$' then
    if nullif(trim(p_shipment->>'tracking_number'),'') is null then
      raise exception 'Enter a unique tracking number for this Shopify shipment';
    end if;
    if exists(select 1 from shipments where order_id=oid and tenant_id=tid
      and lower(trim(tracking_number))=lower(trim(p_shipment->>'tracking_number'))) then
      raise exception 'This tracking number is already used on the Shopify order';
    end if;
    if not exists(select 1 from integration_credentials where tenant_id=tid and provider='shopify' and connected)
      then raise exception 'Reconnect Shopify before posting this shipment'; end if;
    if p_shipment ? 'cartons' and exists (
      select 1 from jsonb_array_elements(p_shipment->'cartons') c
      where nullif(trim(c->>'tracking'),'') is not null and trim(c->>'tracking')<>trim(p_shipment->>'tracking_number')
    ) then raise exception 'Use one tracking number per Shopify shipment'; end if;
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
  insert into shipments(tenant_id,order_id,customer_id,shipped_by,tracking_number,notes,shopify_split)
    values(tid,oid,customer,auth.uid(),nullif(trim(p_shipment->>'tracking_number'),''),p_shipment->>'notes',ordernum ~ '^SHOPIFY-[0-9]+$') returning id into sid;
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

create or replace function import_shopify_order(p_tenant_id uuid,p_order jsonb,p_event_id text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare oid uuid; custid uuid; adminid uuid; prodid uuid; item jsonb; email_value text; ref text; item_qty integer;
begin
  perform 1 from tenants where id=p_tenant_id for update;
  if not found then raise exception 'Unknown tenant'; end if;
  if not exists(select 1 from integration_credentials where tenant_id=p_tenant_id and provider='shopify' and connected) then raise exception 'Shopify is disconnected'; end if;
  if not exists(select 1 from tenant_billing where tenant_id=p_tenant_id and (status='active' or status='trialing' and trial_ends_at>now())) then raise exception 'Active subscription required'; end if;
  ref:='SHOPIFY-'||(p_order->>'id');
  if p_order->>'id' is null then raise exception 'Order ID required'; end if;
  if exists(select 1 from webhook_events where provider='shopify' and event_id=p_event_id) then
    select id into oid from sales_orders where tenant_id=p_tenant_id and order_number=ref; return oid;
  end if;
  select id into adminid from users where tenant_id=p_tenant_id and role='admin' and is_active order by created_at limit 1;
  if adminid is null then raise exception 'Active administrator required'; end if;
  select id into oid from sales_orders where tenant_id=p_tenant_id and order_number=ref for update;
  if oid is not null and exists(select 1 from sales_orders where id=oid and status='shipped') then
    -- Never change stock or rewrite a shipped order from an external notification.
    insert into webhook_events(provider,event_id,tenant_id) values('shopify',p_event_id,p_tenant_id);
    return oid;
  end if;
  if oid is not null and exists(select 1 from shipments where tenant_id=p_tenant_id and order_id=oid and shopify_split) then
    -- Preserve locally posted quantities. External cancellation stops further local shipping.
    if p_order->>'cancelled_at' is not null then
      update sales_orders set status='cancelled' where id=oid and tenant_id=p_tenant_id;
    elsif p_order->>'fulfillment_status'='fulfilled' then
      update sales_orders set status='externally_fulfilled' where id=oid and tenant_id=p_tenant_id;
    end if;
    insert into webhook_events(provider,event_id,tenant_id) values('shopify',p_event_id,p_tenant_id);
    return oid;
  end if;
  email_value:=nullif(coalesce(p_order->'customer'->>'email',p_order->>'email'),'');
  if email_value is not null then select id into custid from customers where tenant_id=p_tenant_id and lower(customers.email)=lower(email_value) order by created_at limit 1; end if;
  if custid is null then
    insert into customers(tenant_id,name,email,ship_to_address)
    values(p_tenant_id,coalesce(nullif(trim(concat(p_order->'customer'->>'first_name',' ',p_order->'customer'->>'last_name')),''),'Shopify guest'),email_value,
      nullif(concat_ws(', ',p_order->'shipping_address'->>'address1',p_order->'shipping_address'->>'city',p_order->'shipping_address'->>'province',p_order->'shipping_address'->>'zip'),'')) returning id into custid;
  end if;
  if oid is null then
    insert into sales_orders(tenant_id,order_number,customer_id,status,created_by,notes)
    values(p_tenant_id,ref,custid,'confirmed',adminid,'Imported from Shopify') returning id into oid;
  else
    delete from sales_order_lines where order_id=oid and tenant_id=p_tenant_id;
  end if;
  update sales_orders set customer_id=custid,
    status=case when p_order->>'cancelled_at' is not null then 'cancelled'::order_status when p_order->>'fulfillment_status'='fulfilled' then 'externally_fulfilled'::order_status else 'confirmed'::order_status end,
    ship_to_name=p_order->'shipping_address'->>'name',
    ship_to_address=nullif(concat_ws(', ',p_order->'shipping_address'->>'address1',p_order->'shipping_address'->>'city',p_order->'shipping_address'->>'province',p_order->'shipping_address'->>'zip'),'') where id=oid;
  if jsonb_typeof(p_order->'line_items') is distinct from 'array' or jsonb_array_length(p_order->'line_items')=0 then raise exception 'Order has no lines'; end if;
  for item in select value from jsonb_array_elements(p_order->'line_items') loop
    item_qty:=case when p_order->>'fulfillment_status'='partial' then coalesce((item->>'fulfillable_quantity')::integer,(item->>'quantity')::integer) else (item->>'quantity')::integer end;
    if item_qty=0 and p_order->>'fulfillment_status'='partial' then continue; end if;
    select id into prodid from products where tenant_id=p_tenant_id and sku=item->>'sku' and not is_archived;
    if prodid is null then raise exception 'Import products and map every order SKU before retrying'; end if;
    if item_qty<=0 then raise exception 'Invalid order quantity'; end if;
    insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price)
    values(p_tenant_id,oid,prodid,item_qty,(item->>'price')::numeric);
  end loop;
  insert into webhook_events(provider,event_id,tenant_id) values('shopify',p_event_id,p_tenant_id);
  return oid;
end $$;

revoke all on function public.ship_order_quantities(uuid,jsonb),public.mark_split_fulfillment_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ship_order_quantities(uuid,jsonb) to authenticated;
grant execute on function public.mark_split_fulfillment_attempt(uuid,uuid) to service_role;
commit;
