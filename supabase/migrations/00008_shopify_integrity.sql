begin;
-- Move only encrypted legacy Shopify credentials out of browser-readable settings.
insert into integration_credentials(tenant_id,provider,shop_domain,encrypted_token,connected)
select id,'shopify',lower(regexp_replace(regexp_replace(settings->'shopify'->>'store_url','^https?://',''),'/$','')),
 settings->'shopify'->>'access_token',coalesce((settings->'shopify'->>'connected')::boolean,false)
from tenants where settings->'shopify'->>'access_token' like '%:%:%'
 and lower(regexp_replace(regexp_replace(settings->'shopify'->>'store_url','^https?://',''),'/$','')) ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
on conflict do nothing;
update tenants set settings=(settings-'qb_client_secret'-'zapier_api_key'-'billing') ||
 case when settings ? 'shopify' then jsonb_build_object('shopify',(settings->'shopify')-'access_token') else '{}'::jsonb end;

create function save_shopify_connection(p_tenant_id uuid,p_domain text,p_token text,p_name text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_domain !~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$' or p_token not like '%:%:%' then raise exception 'Invalid connection'; end if;
  perform 1 from tenants where id=p_tenant_id for update;
  if not found then raise exception 'Unknown tenant'; end if;
  insert into integration_credentials(tenant_id,provider,shop_domain,encrypted_token,connected)
  values(p_tenant_id,'shopify',p_domain,p_token,true)
  on conflict(tenant_id,provider) do update set shop_domain=excluded.shop_domain,encrypted_token=excluded.encrypted_token,connected=true,updated_at=now();
  update tenants set settings=jsonb_set(coalesce(settings,'{}'),'{shopify}',jsonb_build_object('store_url',p_domain,'shop_domain',p_domain,'shop_name',p_name,'connected',true,'auto_sync_orders',true,'auto_sync_inventory',false)) where id=p_tenant_id;
end $$;
revoke all on function save_shopify_connection(uuid,text,text,text) from public,anon,authenticated;
grant execute on function save_shopify_connection(uuid,text,text,text) to service_role;

create function import_shopify_order(p_tenant_id uuid,p_order jsonb,p_event_id text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare oid uuid; custid uuid; adminid uuid; prodid uuid; item jsonb; email_value text; ref text;
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
    status=case when p_order->>'cancelled_at' is not null then 'cancelled'::order_status else 'confirmed'::order_status end,
    ship_to_name=p_order->'shipping_address'->>'name',
    ship_to_address=nullif(concat_ws(', ',p_order->'shipping_address'->>'address1',p_order->'shipping_address'->>'city',p_order->'shipping_address'->>'province',p_order->'shipping_address'->>'zip'),'') where id=oid;
  if jsonb_typeof(p_order->'line_items') is distinct from 'array' or jsonb_array_length(p_order->'line_items')=0 then raise exception 'Order has no lines'; end if;
  for item in select value from jsonb_array_elements(p_order->'line_items') loop
    select id into prodid from products where tenant_id=p_tenant_id and sku=item->>'sku' and not is_archived;
    if prodid is null then raise exception 'Import products and map every order SKU before retrying'; end if;
    if (item->>'quantity')::integer<=0 then raise exception 'Invalid order quantity'; end if;
    insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price)
    values(p_tenant_id,oid,prodid,(item->>'quantity')::integer,(item->>'price')::numeric);
  end loop;
  insert into webhook_events(provider,event_id,tenant_id) values('shopify',p_event_id,p_tenant_id);
  return oid;
end $$;
revoke all on function import_shopify_order(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function import_shopify_order(uuid,jsonb,text) to service_role;
commit;
