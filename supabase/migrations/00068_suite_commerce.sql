begin;

create table public.commerce_storefronts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 100),
  curated boolean not null default false
);
create table public.commerce_catalog_products (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  primary key(tenant_id,product_id)
);
create table public.commerce_volume_prices (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  minimum_quantity integer not null check(minimum_quantity between 1 and 1000000),
  unit_price numeric(12,4) not null check(unit_price>=0),
  primary key(tenant_id,customer_id,product_id,minimum_quantity)
);
create index commerce_volume_prices_product_idx on public.commerce_volume_prices(product_id);
create index commerce_volume_prices_customer_idx on public.commerce_volume_prices(customer_id);

do $$ declare tbl text; begin
  foreach tbl in array array['commerce_storefronts','commerce_catalog_products','commerce_volume_prices'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('revoke all on public.%I from public,anon,authenticated',tbl);
    execute format('grant select,insert,update,delete on public.%I to authenticated',tbl);
    execute format('create policy commerce_manager on public.%I for all to authenticated
      using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access(''commerce'')))
      with check (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access(''commerce'')))',tbl);
    execute format('create trigger enforce_tenant_relations before insert or update on public.%I
      for each row execute function public.enforce_tenant_relations()',tbl);
  end loop;
end $$;

create function public.portal_eligible_tenant(p_customer uuid) returns uuid
language sql stable set search_path=public,pg_temp as $$
  select m.tenant_id from portal_memberships m
  join customers c on c.id=m.customer_id and c.tenant_id=m.tenant_id and not c.is_archived
  join tenant_billing b on b.tenant_id=m.tenant_id
  where m.auth_user_id=auth.uid() and m.customer_id=p_customer
    and (b.status='active' or (b.status='trialing' and b.trial_ends_at>now()))
$$;

create function public.portal_product_base_price(p_tenant uuid,p_customer uuid,p_product uuid,p_list numeric)
returns numeric language sql stable set search_path=public,pg_temp as $$
  select round(coalesce(
    (select custom_price from customer_prices where tenant_id=p_tenant and customer_id=p_customer and product_id=p_product
      and effective_date<=current_date and (expiration_date is null or expiration_date>=current_date)),
    p_list*(1-coalesce((select t.discount_percent
      from customers c join price_tiers t on t.id=c.price_tier_id and t.tenant_id=c.tenant_id
      where c.tenant_id=p_tenant and c.id=p_customer),0)/100)
  ),4)
$$;

create function public.portal_storefront(p_customer uuid,p_search text,p_offset integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare tid uuid := public.portal_eligible_tenant(p_customer); enabled boolean; store commerce_storefronts;
  currency text; items jsonb; workspace_name text; page_size constant integer:=40;
begin
  if tid is null then raise exception 'Portal access required' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 or length(p_search)>120 then raise exception 'Invalid catalog filter'; end if;
  select t.name,coalesce(t.settings->>'currency','USD') into workspace_name,currency from tenants t where t.id=tid;
  enabled:=public.suite_workspace_available(tid,'commerce');
  if enabled then select * into store from commerce_storefronts where tenant_id=tid; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.name,i.id),'[]'::jsonb) into items
  from (
    select p.id,p.sku,p.name,p.unit_of_measure,case when enabled then p.image_url end image_url,
      public.portal_product_base_price(tid,p_customer,p.id,p.price) price,
      case when enabled then coalesce((select jsonb_agg(jsonb_build_object('quantity',v.minimum_quantity,'price',v.unit_price)
        order by v.minimum_quantity) from commerce_volume_prices v where v.tenant_id=tid and v.customer_id=p_customer
        and v.product_id=p.id),'[]'::jsonb) else '[]'::jsonb end breaks
    from products p where p.tenant_id=tid and not p.is_archived
      and (not coalesce(store.curated,false) or exists(select 1 from commerce_catalog_products c where c.tenant_id=tid and c.product_id=p.id))
      and (coalesce(p_search,'')='' or strpos(lower(p.name),lower(p_search))>0 or strpos(lower(p.sku),lower(p_search))>0)
    order by p.name,p.id offset p_offset limit page_size+1
  ) i;
  return jsonb_build_object('name',coalesce(store.name,workspace_name),'currency',currency,
    'has_more',jsonb_array_length(items)>page_size,'products',items-page_size);
end $$;

create or replace function public.portal_place_order(p_request_id uuid,p_customer_id uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.portal_eligible_tenant(p_customer_id); oid uuid; line record; prod products;
  unit_cost numeric; result jsonb; ordernum text; enabled boolean; curated boolean;
begin
  if tid is null then raise exception 'Portal access required' using errcode='42501'; end if;
  if p_request_id is null then raise exception 'A request ID is required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where tenant_id=tid and request_id=p_request_id and operation='portal-order:'||p_customer_id::text;
  if result is not null then return result; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Add between 1 and 100 order lines';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_lines) l(product_id uuid,quantity integer) where
    l.product_id is null or l.quantity is null or l.quantity not between 1 and 1000000) then raise exception 'Invalid order quantity'; end if;
  enabled:=public.suite_workspace_available(tid,'commerce');
  if enabled then select s.curated into curated from commerce_storefronts s where s.tenant_id=tid; end if;
  ordernum:='WEB-'||p_request_id::text;
  insert into sales_orders(tenant_id,customer_id,order_number,status,ship_to_name,ship_to_address)
    select tid,c.id,ordernum,'confirmed',c.name,c.ship_to_address from customers c where c.tenant_id=tid and c.id=p_customer_id
    returning id into oid;
  for line in select l.product_id,sum(l.quantity)::integer qty
    from jsonb_to_recordset(p_lines) l(product_id uuid,quantity integer) group by l.product_id order by l.product_id loop
    select * into prod from products where id=line.product_id and tenant_id=tid and not is_archived;
    if not found or (curated and not exists(select 1 from commerce_catalog_products where tenant_id=tid and product_id=line.product_id)) then
      raise exception 'A product is no longer in the catalog';
    end if;
    if line.qty>1000000 then raise exception 'Invalid order quantity'; end if;
    unit_cost:=null;
    if enabled then
      select v.unit_price into unit_cost from commerce_volume_prices v
      where v.tenant_id=tid and v.customer_id=p_customer_id and v.product_id=prod.id and v.minimum_quantity<=line.qty
      order by v.minimum_quantity desc limit 1;
    end if;
    unit_cost:=coalesce(unit_cost,public.portal_product_base_price(tid,p_customer_id,prod.id,prod.price));
    if unit_cost is null or unit_cost<0 then raise exception 'A catalog price is unavailable'; end if;
    insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price) values(tid,oid,prod.id,line.qty,unit_cost);
  end loop;
  result:=jsonb_build_object('order_id',oid,'order_number',ordernum);
  insert into inventory_operations values(tid,p_request_id,'portal-order:'||p_customer_id::text,result,now());
  return result;
end $$;

create table public.woocommerce_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 80),
  encrypted_secret text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index woocommerce_connections_tenant_idx on public.woocommerce_connections(tenant_id);
create table public.woocommerce_imports (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.woocommerce_connections(id),
  external_id bigint not null,
  order_id uuid references public.sales_orders(id),
  error text,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(connection_id,external_id)
);
create index woocommerce_imports_tenant_idx on public.woocommerce_imports(tenant_id,updated_at desc);
alter table public.woocommerce_connections enable row level security;
alter table public.woocommerce_imports enable row level security;
revoke all on public.woocommerce_connections,public.woocommerce_imports from public,anon,authenticated;
grant select,insert,update on public.woocommerce_connections to service_role;
grant select on public.woocommerce_imports to service_role;
grant select(id,tenant_id,name,enabled,created_at) on public.woocommerce_connections to authenticated;
grant select(tenant_id,connection_id,external_id,order_id,error,updated_at) on public.woocommerce_imports to authenticated;
create policy woo_connection_read on public.woocommerce_connections for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('commerce')));
create policy woo_import_read on public.woocommerce_imports for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('commerce')));

create function public.import_woocommerce_order(p_connection uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; external bigint; customer uuid; oid uuid; failure text; expected_currency text;
  expected_count integer; inserted_count integer; buyer_email text:=nullif(lower(trim(p_payload->>'email')),'');
begin
  select tenant_id into tid from woocommerce_connections where id=p_connection and enabled for share;
  if tid is null or not public.suite_workspace_available(tid,'commerce') then raise exception 'WooCommerce connection unavailable'; end if;
  external:=(p_payload->>'id')::bigint;
  if external is null or external<=0 then raise exception 'Missing WooCommerce order number'; end if;
  perform pg_advisory_xact_lock(hashtext(p_connection::text||':'||external::text));
  select order_id into oid from woocommerce_imports where connection_id=p_connection and external_id=external;
  if oid is not null then return jsonb_build_object('order_id',oid); end if;
  begin
    select coalesce(settings->>'currency','USD') into expected_currency from tenants where id=tid;
    if expected_currency is distinct from p_payload->>'currency' then
      raise exception 'WooCommerce order currency differs from workspace currency';
    end if;
    if nullif(trim(p_payload->>'address'),'') is null then raise exception 'WooCommerce order is missing a shipping address'; end if;
    if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 250 then
      raise exception 'WooCommerce order must contain between 1 and 250 lines';
    end if;
    expected_count:=jsonb_array_length(p_payload->'lines');
    if buyer_email is not null then
      perform pg_advisory_xact_lock(hashtext(tid::text||':woo-customer:'||buyer_email));
      select id into customer from customers where tenant_id=tid and not is_archived and lower(email)=buyer_email
        order by created_at,id limit 1;
    end if;
    if customer is null then
      insert into customers(tenant_id,name,email,ship_to_address) values(tid,p_payload->>'name',buyer_email,p_payload->>'address')
        returning id into customer;
    end if;
    insert into sales_orders(tenant_id,customer_id,order_number,status,ship_to_name,ship_to_address,notes)
      values(tid,customer,'WOO-'||p_connection::text||'-'||external,'confirmed',
        p_payload->>'name',p_payload->>'address','WooCommerce paid order. Payment reconciles in WooCommerce.') returning id into oid;
    insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price)
      select tid,oid,p.id,l.quantity,round(l.total/l.quantity,4)
      from jsonb_to_recordset(p_payload->'lines') l(sku text,quantity integer,total numeric)
      join products p on p.tenant_id=tid and p.sku=l.sku and not p.is_archived
      where l.quantity between 1 and 1000000 and l.total>=0;
    get diagnostics inserted_count=row_count;
    if inserted_count<>expected_count then raise exception 'Match every WooCommerce SKU to an active Invexiqs product'; end if;
  exception when raise_exception or data_exception or integrity_constraint_violation then
    oid:=null;
    failure:=case when sqlstate='P0001' then sqlerrm else 'WooCommerce order data could not be imported' end;
  end;
  insert into woocommerce_imports(tenant_id,connection_id,external_id,order_id,error,payload)
    values(tid,p_connection,external,oid,failure,case when oid is null then p_payload else '{}'::jsonb end)
    on conflict(connection_id,external_id) do update set order_id=excluded.order_id,error=excluded.error,payload=excluded.payload,updated_at=now();
  return jsonb_build_object('order_id',oid,'review',failure);
end $$;

create function public.retry_woocommerce_import(p_connection uuid,p_external bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid:=public.require_suite_access('commerce'); original woocommerce_imports;
begin
  select * into original from woocommerce_imports where tenant_id=tid and connection_id=p_connection and external_id=p_external;
  if not found then raise exception 'WooCommerce order not found'; end if;
  if original.order_id is not null then return jsonb_build_object('order_id',original.order_id); end if;
  return public.import_woocommerce_order(p_connection,original.payload);
end $$;

revoke all on function public.portal_eligible_tenant(uuid),public.portal_product_base_price(uuid,uuid,uuid,numeric),
  public.portal_storefront(uuid,text,integer),public.import_woocommerce_order(uuid,jsonb),
  public.retry_woocommerce_import(uuid,bigint) from public,anon,authenticated;
grant execute on function public.portal_storefront(uuid,text,integer),public.retry_woocommerce_import(uuid,bigint) to authenticated;
grant execute on function public.import_woocommerce_order(uuid,jsonb) to service_role;
commit;
