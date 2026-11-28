begin;

create or replace function ship_inventory(p_request_id uuid,p_shipment jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; oid uuid; sid uuid; customer uuid; line jsonb; qty integer; remaining integer; take_qty integer;
  lot lots; binrow bin_inventory; bin_remaining integer; serialrow record; serial_count integer; ordernum text; prod_id uuid; existing_order sales_orders; existing_id uuid; order_lines jsonb; scanned_serials jsonb; serial_tracked boolean; item record;
  warehouse uuid:=nullif(p_shipment->>'location_id','')::uuid; lot_capacity bigint;
begin
  tid:=public.require_warehouse_manager();
  if warehouse is not null and not exists(select 1 from locations where id=warehouse and tenant_id=tid and is_active) then
    raise exception 'Warehouse is not available';
  end if;
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
      order by
        case when (select stock_rotation from products where id=prod_id and tenant_id=tid) = 'FEFO' then l.expiration_date end nulls last,
        case when (select stock_rotation from products where id=prod_id and tenant_id=tid) = 'LIFO' then l.received_date end desc nulls last,
        case when (select stock_rotation from products where id=prod_id and tenant_id=tid) <> 'LIFO' then l.received_date end nulls last,
        l.id for update
    loop
      exit when remaining=0;
      if warehouse is not null then
        perform 1 from bin_inventory where tenant_id=tid and lot_id=lot.id order by id for update;
        select coalesce(sum(i.quantity) filter(where b.location_id=warehouse and b.is_active),0)
          + case when lot.location_id=warehouse then greatest(lot.quantity_on_hand-coalesce(sum(i.quantity),0),0) else 0 end
          into lot_capacity
          from bin_inventory i join bins b on b.id=i.bin_id and b.tenant_id=i.tenant_id
          where i.tenant_id=tid and i.lot_id=lot.id and i.product_id=prod_id
          having coalesce(sum(i.quantity),0)<=lot.quantity_on_hand;
        if lot_capacity is null or lot_capacity<=0 then continue; end if;
      else
        lot_capacity:=lot.quantity_on_hand;
      end if;
      take_qty:=least(remaining,lot_capacity);
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
      for binrow in select * from bin_inventory where tenant_id=tid and lot_id=lot.id and product_id=prod_id and quantity>0
        and (warehouse is null or exists(select 1 from bins b where b.id=bin_id and b.tenant_id=tid and b.location_id=warehouse and b.is_active))
        order by id for update loop
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

create table public.pos_registers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  name text not null check(length(trim(name)) between 1 and 80),
  is_active boolean not null default true,
  unique(tenant_id,location_id,name)
);
create index pos_registers_tenant_idx on public.pos_registers(tenant_id);
create table public.pos_register_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  register_id uuid not null references public.pos_registers(id),
  opened_by uuid not null references public.users(id),
  opened_at timestamptz not null default now(),
  opening_cash numeric(12,2) not null check(opening_cash>=0),
  closed_by uuid references public.users(id),
  closed_at timestamptz,
  counted_cash numeric(12,2) check(counted_cash>=0),
  expected_cash numeric(14,2),
  variance numeric(14,2),
  notes text check(length(notes)<=500)
);
create unique index pos_register_one_open_shift on public.pos_register_shifts(register_id) where closed_at is null;
create index pos_register_shifts_tenant_idx on public.pos_register_shifts(tenant_id,opened_at desc);
alter table public.pos_sales add column shift_id uuid references public.pos_register_shifts(id),
  add column payment_method text not null default 'cash' check(payment_method in ('cash','card'));
create index pos_sales_shift_idx on public.pos_sales(tenant_id,shift_id);

create table public.pos_terminal_credentials (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  register_id uuid primary key references public.pos_registers(id),
  reader_id text not null unique,
  encrypted_key text not null,
  livemode boolean not null
);
create table public.pos_card_attempts (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shift_id uuid not null references public.pos_register_shifts(id),
  register_id uuid not null references public.pos_registers(id),
  customer_name text,
  quote jsonb not null,
  currency text not null,
  status text not null default 'pending' check(status in ('pending','paid','paid_review','posted','cancelled','refund_pending','refunded')),
  intent_id text unique,
  refund_id text unique,
  failure text,
  created_at timestamptz not null default now()
);
create unique index pos_register_one_pending_payment on public.pos_card_attempts(register_id)
  where status in ('pending','paid','paid_review','refund_pending');
create index pos_attempts_tenant_idx on public.pos_card_attempts(tenant_id,created_at desc);
create index pos_attempts_shift_idx on public.pos_card_attempts(shift_id);

do $$ declare tbl text; begin
  foreach tbl in array array['pos_registers','pos_register_shifts','pos_terminal_credentials','pos_card_attempts'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated',tbl);
    execute format('create trigger enforce_tenant_relations before insert or update on public.%I
      for each row execute function public.enforce_tenant_relations()',tbl);
    if tbl<>'pos_terminal_credentials' then
      execute format('grant select on public.%I to authenticated',tbl);
      execute format('create policy pos_addon_read on public.%I for select to authenticated
        using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access(''pos'')))',tbl);
    end if;
  end loop;
end $$;
grant select,insert,update,delete on public.pos_terminal_credentials to service_role;
grant update on public.pos_card_attempts to service_role;
grant select on public.pos_card_attempts,public.pos_registers to service_role;

create function public.save_pos_register(p_id uuid,p_location uuid,p_name text,p_active boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid:=public.require_suite_access('pos'); old_register pos_registers;
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  if not exists(select 1 from locations where tenant_id=tid and id=p_location and is_active) then
    raise exception 'Select an active store or warehouse';
  end if;
  select * into old_register from pos_registers where tenant_id=tid and id=p_id for update;
  if found then
    if p_location is distinct from old_register.location_id then raise exception 'Create a separate register for another store'; end if;
    if not p_active and exists(select 1 from pos_register_shifts where register_id=p_id and closed_at is null) then
      raise exception 'Close the register shift before disabling this register';
    end if;
    update pos_registers set name=trim(p_name),is_active=p_active where id=p_id and tenant_id=tid;
  else
    insert into pos_registers(id,tenant_id,location_id,name,is_active) values(p_id,tid,p_location,trim(p_name),p_active);
  end if;
end $$;

create function public.open_pos_shift(p_register uuid,p_cash numeric) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid:=public.require_suite_access('pos'); sid uuid;
begin
  perform 1 from pos_registers r join locations w on w.id=r.location_id and w.tenant_id=r.tenant_id
    where r.id=p_register and r.tenant_id=tid and r.is_active and w.is_active for update of r;
  if not found then raise exception 'Register is not available'; end if;
  select id into sid from pos_register_shifts where register_id=p_register and closed_at is null;
  if found then return sid; end if;
  insert into pos_register_shifts(tenant_id,register_id,opened_by,opening_cash)
    values(tid,p_register,auth.uid(),p_cash) returning id into sid;
  return sid;
end $$;

create function public.close_pos_shift(p_shift uuid,p_count numeric,p_notes text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid:=public.require_suite_access('pos'); shift pos_register_shifts; expected numeric;
begin
  select * into shift from pos_register_shifts where id=p_shift and tenant_id=tid for update;
  if not found then raise exception 'Register shift not found'; end if;
  if shift.closed_at is not null then return to_jsonb(shift); end if;
  if p_count is null or p_count<0 then raise exception 'Enter the cash counted in the drawer'; end if;
  if exists(select 1 from pos_card_attempts where shift_id=p_shift and status in ('pending','paid','paid_review','refund_pending')) then
    raise exception 'Resolve pending card payments before closing this shift';
  end if;
  select shift.opening_cash+coalesce(sum(total) filter(where payment_method='cash'),0) into expected
    from pos_sales where shift_id=p_shift and tenant_id=tid;
  update pos_register_shifts set closed_at=now(),closed_by=auth.uid(),counted_cash=p_count,expected_cash=expected,
    variance=round(p_count,2)-expected,notes=nullif(trim(p_notes),'') where id=p_shift returning * into shift;
  return to_jsonb(shift);
end $$;

create function public.pos_checkout_quote(p_tenant uuid,p_items jsonb,p_order_discount numeric) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare item jsonb; prod products; qty integer; price numeric; discount numeric; subtotal numeric:=0; tax numeric; tax_rate numeric;
  items jsonb:='[]'; ship_lines jsonb:='[]';
begin
  if p_order_discount is null or p_order_discount not between 0 and 100 then raise exception 'Invalid discount'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 250 then raise exception 'Sale items required'; end if;
  select coalesce((settings->>'sales_tax_rate')::numeric,0) into tax_rate from tenants where id=p_tenant;
  if tax_rate not between 0 and 1 then raise exception 'Configure a valid sales tax rate'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'lineType' is distinct from 'product' then raise exception 'Service checkout requires a linked service record'; end if;
    qty:=(item->>'quantity')::integer;
    select * into prod from products where id=(item->>'productId')::uuid and tenant_id=p_tenant and not is_archived;
    if not found or qty is null or qty<=0 then raise exception 'Invalid sale item'; end if;
    if prod.is_serial_tracked then raise exception 'Use warehouse shipping for serialized sales'; end if;
    select sale_price into price from promotions where tenant_id=p_tenant and product_id=prod.id and status='active'
      and start_date<=current_date and end_date>=current_date order by sale_price limit 1;
    price:=coalesce(price,prod.price); discount:=coalesce((item->>'discount')::numeric,0);
    if discount not between 0 and price then raise exception 'Invalid line discount'; end if;
    subtotal:=subtotal+(price-discount)*qty;
    items:=items||jsonb_build_array(jsonb_build_object('product',null,'productId',prod.id,'label',prod.name,'sku',prod.sku,
      'lineType','product','quantity',qty,'unitPrice',price,'originalPrice',prod.price,'discount',discount));
    ship_lines:=ship_lines||jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',qty,'unit_price',(price-discount)*(1-p_order_discount/100)));
  end loop;
  subtotal:=round(subtotal*(1-p_order_discount/100),2);
  tax:=round(subtotal*tax_rate,2);
  return jsonb_build_object('items',items,'lines',ship_lines,'total',subtotal+tax,'tax',tax);
end $$;

create function public.pos_sale_result(p_sale public.pos_sales) returns jsonb
language sql stable set search_path=public,pg_temp as $$
  select jsonb_build_object('items',p_sale.items,'total',p_sale.total,'tax',p_sale.tax,'change',p_sale.change,
    'ref','POS-'||p_sale.request_id::text,'payment',p_sale.payment_method)
$$;

create function public.post_pos_sale(p_tenant uuid,p_request uuid,p_quote jsonb,p_customer text,p_tendered numeric,
  p_method text,p_shift uuid,p_location uuid) returns jsonb
language plpgsql set search_path=public,pg_temp as $$
declare sale pos_sales; customerid uuid; shipped jsonb; amount numeric:=(p_quote->>'total')::numeric;
begin
  if p_request is null then raise exception 'Request ID required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant::text||p_request::text));
  select * into sale from pos_sales where tenant_id=p_tenant and request_id=p_request;
  if found then
    if row(sale.payment_method,sale.shift_id) is distinct from row(p_method,p_shift) then
      raise exception 'This request was used by a different checkout';
    end if;
    return public.pos_sale_result(sale);
  end if;
  if p_tendered is null or p_tendered<amount then raise exception 'Insufficient payment amount'; end if;
  if p_method='cash' and exists(select 1 from pos_card_attempts where tenant_id=p_tenant and id=p_request) then
    raise exception 'Resolve the card transaction before accepting cash';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant::text||':pos-walk-in'));
  select id into customerid from customers where tenant_id=p_tenant and name='POS walk-in' and not is_archived order by created_at limit 1;
  if customerid is null then insert into customers(tenant_id,name) values(p_tenant,'POS walk-in') returning id into customerid; end if;
  shipped:=public.ship_inventory(gen_random_uuid(),jsonb_build_object('customer_id',customerid,'lines',p_quote->'lines',
    'location_id',p_location,'notes',initcap(p_method)||' POS sale: '||left(coalesce(p_customer,'Walk-in'),200)));
  insert into pos_sales(tenant_id,request_id,order_id,items,total,tax,tendered,change,created_by,shift_id,payment_method)
    values(p_tenant,p_request,(shipped->>'order_id')::uuid,p_quote->'items',amount,(p_quote->>'tax')::numeric,
      p_tendered,p_tendered-amount,auth.uid(),p_shift,p_method) returning * into sale;
  return public.pos_sale_result(sale);
end $$;

create or replace function public.post_cash_sale(p_request_id uuid,p_items jsonb,p_customer_name text,p_order_discount numeric,p_tendered numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid:=public.require_warehouse_manager(); sale pos_sales;
begin
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select * into sale from pos_sales where tenant_id=tid and request_id=p_request_id and shift_id is null and payment_method='cash';
  if found then return public.pos_sale_result(sale); end if;
  if public.suite_workspace_available(tid,'pos') and exists(select 1 from pos_registers where tenant_id=tid and is_active) then
    raise exception 'Choose an open register for this sale';
  end if;
  return public.post_pos_sale(tid,p_request_id,public.pos_checkout_quote(tid,p_items,p_order_discount),p_customer_name,p_tendered,'cash',null,null);
end $$;

create function public.post_register_cash_sale(p_shift uuid,p_request_id uuid,p_items jsonb,p_customer_name text,p_discount numeric,p_tendered numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid:=public.require_suite_access('pos'); shift pos_register_shifts; location uuid; sale pos_sales;
begin
  select * into sale from pos_sales where tenant_id=tid and request_id=p_request_id and shift_id=p_shift and payment_method='cash';
  if found then return public.pos_sale_result(sale); end if;
  select * into shift from pos_register_shifts where id=p_shift and tenant_id=tid and closed_at is null for update;
  if not found then raise exception 'Open a register shift before accepting payment'; end if;
  select location_id into location from pos_registers where id=shift.register_id and tenant_id=tid and is_active;
  if location is null then raise exception 'Register is not available'; end if;
  return public.post_pos_sale(tid,p_request_id,public.pos_checkout_quote(tid,p_items,p_discount),
    p_customer_name,p_tendered,'cash',shift.id,location);
end $$;

create function public.begin_pos_card_attempt(p_shift uuid,p_request uuid,p_items jsonb,p_customer text,p_discount numeric)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid:=public.require_suite_access('pos'); shift pos_register_shifts; attempt pos_card_attempts; quote jsonb; curr text;
  warehouse uuid; line record; capacity numeric;
begin
  if p_request is null then raise exception 'Request ID required'; end if;
  select * into shift from pos_register_shifts where id=p_shift and tenant_id=tid and closed_at is null for update;
  if not found then raise exception 'Open a register shift before accepting payment'; end if;
  select location_id into warehouse from pos_registers where id=shift.register_id and tenant_id=tid and is_active;
  if warehouse is null or not exists(select 1 from locations where id=warehouse and tenant_id=tid and is_active) then
    raise exception 'Register store or warehouse is unavailable';
  end if;
  if not exists(select 1 from pos_terminal_credentials where register_id=shift.register_id and tenant_id=tid) then
    raise exception 'Connect a Stripe Terminal reader to this register';
  end if;
  select * into attempt from pos_card_attempts where tenant_id=tid and shift_id=p_shift and id=p_request;
  if found then return attempt.id; end if;
  if exists(select 1 from pos_card_attempts where register_id=shift.register_id and status in ('pending','paid','paid_review','refund_pending')) then
    raise exception 'Resolve the existing card transaction at this register';
  end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request::text));
  if exists(select 1 from pos_sales where tenant_id=tid and request_id=p_request) then raise exception 'This checkout already posted'; end if;
  quote:=public.pos_checkout_quote(tid,p_items,p_discount);
  select lower(coalesce(settings->>'currency','USD')) into curr from tenants where id=tid;
  if curr not in ('usd','cad','gbp','aud','nzd','eur') or (quote->>'total')::numeric not between 0.50 and 999999.99 then
    raise exception 'This currency or amount is unavailable for Terminal checkout';
  end if;
  for line in select l.product_id,sum(l.quantity) quantity
    from jsonb_to_recordset(quote->'lines') l(product_id uuid,quantity integer) group by l.product_id loop
    select coalesce(sum(stock.available),0) into capacity from lots l
    cross join lateral (
      select case when coalesce(sum(i.quantity),0)<=l.quantity_on_hand then
        coalesce(sum(i.quantity) filter(where b.location_id=warehouse and b.is_active),0)
        + case when l.location_id=warehouse then l.quantity_on_hand-coalesce(sum(i.quantity),0) else 0 end
        else 0 end available
      from bin_inventory i join bins b on b.id=i.bin_id and b.tenant_id=i.tenant_id
      where i.tenant_id=tid and i.lot_id=l.id and i.product_id=l.product_id
    ) stock
    where l.tenant_id=tid and l.product_id=line.product_id and l.status='active' and l.quantity_on_hand>0
      and (l.expiration_date is null or l.expiration_date>=current_date)
      and not exists(select 1 from quarantine_holds h where h.tenant_id=tid and h.lot_id=l.id and h.status in ('held','rejected'));
    if capacity<line.quantity or not exists(select 1 from public.product_shipping_balance(tid,line.product_id,null) b
      where b.on_hand-b.reserved_other>=line.quantity) then raise exception 'Insufficient stock at this register location'; end if;
  end loop;
  insert into pos_card_attempts(id,tenant_id,shift_id,register_id,customer_name,quote,currency)
    values(p_request,tid,p_shift,shift.register_id,left(p_customer,200),quote,curr);
  return p_request;
end $$;

create function public.record_pos_card_state(p_tenant uuid,p_request uuid,p_intent text,p_status text) returns boolean
language plpgsql set search_path=public,pg_temp as $$
declare changed integer;
begin
  update pos_card_attempts set intent_id=p_intent,status=p_status
  where tenant_id=p_tenant and id=p_request and (intent_id is null or intent_id=p_intent)
    and ((status='pending' and p_status in ('pending','paid','cancelled'))
      or (status in ('pending','paid','paid_review','refund_pending') and p_status='refunded'));
  get diagnostics changed=row_count;
  return changed=1;
end $$;

create function public.complete_pos_card_sale(p_request uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid:=public.require_warehouse_manager(); attempt pos_card_attempts; site uuid; sale pos_sales; receipt jsonb;
begin
  select * into attempt from pos_card_attempts where tenant_id=tid and id=p_request for update;
  if not found then raise exception 'Card payment not found'; end if;
  if attempt.status='posted' then
    select * into sale from pos_sales where tenant_id=tid and request_id=p_request;
    return jsonb_build_object('status','posted','receipt',public.pos_sale_result(sale));
  end if;
  if attempt.status not in ('paid','paid_review') then return jsonb_build_object('status',attempt.status); end if;
  begin
    select location_id into site from pos_registers where id=attempt.register_id and tenant_id=tid;
    if site is null then raise exception 'Register location is unavailable'; end if;
    receipt:=public.post_pos_sale(tid,p_request,attempt.quote,attempt.customer_name,(attempt.quote->>'total')::numeric,'card',attempt.shift_id,site);
    update pos_card_attempts set status='posted',failure=null where id=p_request;
  exception when raise_exception or data_exception or integrity_constraint_violation then
    update pos_card_attempts set status='paid_review',failure=case when sqlstate='P0001' then sqlerrm else 'Inventory posting needs review' end where id=p_request;
    return jsonb_build_object('status','paid_review','message','Card payment succeeded. Retry inventory posting or refund this payment from Register Operations.');
  end;
  return jsonb_build_object('status','posted','receipt',receipt);
end $$;

create function public.claim_pos_refund(p_tenant uuid,p_request uuid) returns text
language plpgsql set search_path=public,pg_temp as $$
declare attempt pos_card_attempts;
begin
  select * into attempt from pos_card_attempts where tenant_id=p_tenant and id=p_request for update;
  if not found or attempt.status not in ('paid_review','refund_pending') or attempt.intent_id is null then return null; end if;
  update pos_card_attempts set status='refund_pending' where id=p_request;
  return attempt.intent_id;
end $$;

create function public.configure_pos_terminal(p_tenant uuid,p_register uuid,p_reader text,p_key text,p_live boolean)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
  if not public.suite_workspace_available(p_tenant,'pos') then raise exception 'POS add-on required'; end if;
  perform 1 from pos_registers where tenant_id=p_tenant and id=p_register for update;
  if not found then raise exception 'Register not found'; end if;
  if exists(select 1 from pos_register_shifts where tenant_id=p_tenant and register_id=p_register and closed_at is null) then
    raise exception 'Close the register shift before changing its reader';
  end if;
  if p_reader is null then
    delete from pos_terminal_credentials where tenant_id=p_tenant and register_id=p_register;
  else
    insert into pos_terminal_credentials(tenant_id,register_id,reader_id,encrypted_key,livemode)
      values(p_tenant,p_register,p_reader,p_key,p_live) on conflict(register_id) do update
      set reader_id=excluded.reader_id,encrypted_key=excluded.encrypted_key,livemode=excluded.livemode;
  end if;
end $$;

create function public.pos_register_terminal_state() returns table(register_id uuid,livemode boolean)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('pos');
begin
  return query select t.register_id,t.livemode from pos_terminal_credentials t where t.tenant_id=tid;
end $$;

create function public.record_pos_refund(p_tenant uuid,p_request uuid,p_refund text,p_succeeded boolean)
returns void language plpgsql set search_path=public,pg_temp as $$
begin
  update pos_card_attempts set refund_id=p_refund,status=case when p_succeeded then 'refunded' else 'refund_pending' end
    where tenant_id=p_tenant and id=p_request and status='refund_pending' and (refund_id is null or refund_id=p_refund);
end $$;

revoke all on function public.configure_pos_terminal(uuid,uuid,text,text,boolean),public.pos_register_terminal_state(),
  public.record_pos_refund(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.pos_register_terminal_state() to authenticated;
grant execute on function public.configure_pos_terminal(uuid,uuid,text,text,boolean),public.record_pos_refund(uuid,uuid,text,boolean) to service_role;

revoke all on function public.save_pos_register(uuid,uuid,text,boolean),public.open_pos_shift(uuid,numeric),
  public.close_pos_shift(uuid,numeric,text),public.post_pos_sale(uuid,uuid,jsonb,text,numeric,text,uuid,uuid),
  public.pos_checkout_quote(uuid,jsonb,numeric),public.pos_sale_result(public.pos_sales),
  public.post_register_cash_sale(uuid,uuid,jsonb,text,numeric,numeric),
  public.begin_pos_card_attempt(uuid,uuid,jsonb,text,numeric),public.record_pos_card_state(uuid,uuid,text,text),
  public.complete_pos_card_sale(uuid),public.claim_pos_refund(uuid,uuid) from public,anon,authenticated;
grant execute on function public.save_pos_register(uuid,uuid,text,boolean),public.open_pos_shift(uuid,numeric),
  public.close_pos_shift(uuid,numeric,text),public.post_register_cash_sale(uuid,uuid,jsonb,text,numeric,numeric),
  public.begin_pos_card_attempt(uuid,uuid,jsonb,text,numeric),public.complete_pos_card_sale(uuid) to authenticated;
grant execute on function public.record_pos_card_state(uuid,uuid,text,text),public.claim_pos_refund(uuid,uuid) to service_role;

create or replace function prepare_accounting_invoice(p_tenant uuid,p_order uuid,p_request text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o sales_orders; payload jsonb; customerref text; itemcount integer; items jsonb; existing accounting_exports;
begin
  select * into o from sales_orders where tenant_id=p_tenant and id=p_order for update;
  if not found or o.status<>'shipped' then raise exception 'Only shipped orders can be invoiced'; end if;
  if o.order_number like 'SHOPIFY-%' or o.order_number like 'WOO-%' or coalesce(o.notes,'') like 'Cash POS sale:%'
    or exists(select 1 from pos_sales s where s.tenant_id=p_tenant and s.order_id=p_order) then
    raise exception 'Marketplace and paid POS orders require payment, tax, discount and freight reconciliation before accounting export';
  end if;
  select * into existing from accounting_exports where tenant_id=p_tenant and order_id=p_order;
  if found then return jsonb_build_object('request_id',existing.request_id,'snapshot',existing.snapshot,'invoice_id',existing.invoice_id,'created_at',existing.created_at); end if;
  select remote_id into customerref from accounting_mappings where tenant_id=p_tenant and entity_type='customer' and entity_id=o.customer_id;
  if customerref is null then raise exception 'Map the customer to QuickBooks first'; end if;
  select count(*) into itemcount from sales_order_lines where tenant_id=p_tenant and order_id=p_order;
  if itemcount=0 or exists(select 1 from sales_order_lines l where l.tenant_id=p_tenant and l.order_id=p_order and not exists(select 1 from accounting_mappings m where m.tenant_id=p_tenant and m.entity_type='product' and m.entity_id=l.product_id and nullif(m.tax_code,'') is not null)) then raise exception 'Map every product and tax code before exporting'; end if;
  select jsonb_agg(jsonb_build_object('Amount',l.quantity_shipped*l.unit_price,'DetailType','SalesItemLineDetail','SalesItemLineDetail',jsonb_build_object('ItemRef',jsonb_build_object('value',m.remote_id),'Qty',l.quantity_shipped,'UnitPrice',l.unit_price,'TaxCodeRef',jsonb_build_object('value',m.tax_code)))) into items
    from sales_order_lines l join accounting_mappings m on m.tenant_id=p_tenant and m.entity_type='product' and m.entity_id=l.product_id where l.tenant_id=p_tenant and l.order_id=p_order;
  payload:=jsonb_build_object('CustomerRef',jsonb_build_object('value',customerref),'CurrencyRef',jsonb_build_object('value','USD'),'TxnDate',coalesce(o.ship_date,current_date)::text,'DocNumber','STK-'||left(p_request,16),'PrivateNote','Stokora order '||o.order_number,'Line',items);
  insert into accounting_exports(tenant_id,order_id,request_id,snapshot) values(p_tenant,p_order,p_request,payload);
  return jsonb_build_object('request_id',p_request,'snapshot',payload,'invoice_id',null,'created_at',now());
end $$;
commit;
