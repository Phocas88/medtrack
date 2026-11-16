alter type order_status add value if not exists 'externally_fulfilled';
begin;
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
create or replace function list_order_desk(p_query text default '',p_status text default 'all',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; total integer;
begin
  tid:=get_tenant_id();
  if tid is null or get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  if p_status not in ('all','draft','confirmed','picking','shipped','cancelled','externally_fulfilled') or p_page<0 or p_page>100000 or length(p_query)>200 then raise exception 'Invalid filters'; end if;
  select count(*) into total from sales_orders o join customers c on c.id=o.customer_id and c.tenant_id=tid where o.tenant_id=tid
    and (p_status='all' or o.status::text=p_status) and (p_query='' or o.order_number ilike '%'||p_query||'%' or c.name ilike '%'||p_query||'%');
  select coalesce(jsonb_agg(row_to_json(r)),'[]'::jsonb) into result from (
    select o.id,o.order_number,o.status,o.created_at,o.tracking_number,o.carrier,o.delivery_status,o.tracking_updated_at,o.notes,c.name as customer,
      coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'product_id',l.product_id,'product',p.name,'sku',p.sku,'ordered',l.quantity_ordered,'shipped',l.quantity_shipped))
        from sales_order_lines l join products p on p.id=l.product_id and p.tenant_id=tid where l.order_id=o.id and l.tenant_id=tid),'[]'::jsonb) as lines
    from sales_orders o join customers c on c.id=o.customer_id and c.tenant_id=tid where o.tenant_id=tid
      and (p_status='all' or o.status::text=p_status) and (p_query='' or o.order_number ilike '%'||p_query||'%' or c.name ilike '%'||p_query||'%')
    order by o.created_at desc,o.id limit 50 offset p_page*50
  ) r;
  return jsonb_build_object('orders',result,'total',total,'page',p_page);
end $$;
commit;
