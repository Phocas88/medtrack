begin;
create table tenant_api_keys (
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  primary key(tenant_id,provider)
);
alter table tenant_api_keys enable row level security;
revoke all on tenant_api_keys from public,anon,authenticated;
grant all on tenant_api_keys to service_role;

create function zapier_action(p_tenant_id uuid,p_request_id uuid,p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; actor uuid; record_id uuid; item jsonb; line_product uuid; lot lots; qty integer; remaining integer; b bin_inventory;
begin
  if not exists(select 1 from tenant_billing where tenant_id=p_tenant_id and (status='active' or status='trialing' and trial_ends_at>now())) then raise exception 'Active subscription required'; end if;
  select id into actor from users where tenant_id=p_tenant_id and role='admin' and is_active order by created_at limit 1;
  if actor is null then raise exception 'Active administrator required'; end if;
  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text||p_request_id::text));
  select o.result into result from inventory_operations o where tenant_id=p_tenant_id and request_id=p_request_id and operation='zapier:'||p_action;
  if result is not null then return result; end if;
  if p_action='create_product' then
    insert into products(tenant_id,name,sku,price,cost,unit_of_measure,low_stock_threshold)
    values(p_tenant_id,p_data->>'name',p_data->>'sku',coalesce((p_data->>'price')::numeric,0),coalesce((p_data->>'cost')::numeric,0),coalesce(p_data->>'unit_of_measure','each'),coalesce((p_data->>'low_stock_threshold')::integer,10)) returning id into record_id;
  elsif p_action='create_customer' then
    insert into customers(tenant_id,name,email,phone,ship_to_address,notes)
    values(p_tenant_id,p_data->>'name',p_data->>'email',p_data->>'phone',p_data->>'ship_to_address',p_data->>'notes') returning id into record_id;
  elsif p_action='create_order' then
    insert into sales_orders(tenant_id,customer_id,order_number,status,created_by,notes)
    values(p_tenant_id,(p_data->>'customer_id')::uuid,'ZAP-'||p_request_id::text,'confirmed',actor,p_data->>'notes') returning id into record_id;
    if jsonb_array_length(p_data->'lines')=0 then raise exception 'Order lines required'; end if;
    for item in select value from jsonb_array_elements(p_data->'lines') loop
      line_product:=(item->>'product_id')::uuid;
      insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price)
      values(p_tenant_id,record_id,line_product,(item->>'quantity')::integer,coalesce((item->>'unit_price')::numeric,(select price from products where id=line_product and tenant_id=p_tenant_id)));
    end loop;
  elsif p_action='adjust_inventory' then
    qty:=(p_data->>'quantity')::integer;
    select * into lot from lots where id=(p_data->>'lot_id')::uuid and tenant_id=p_tenant_id for update;
    if not found or qty=0 or qty is null or lot.quantity_on_hand+qty<0 then raise exception 'Invalid lot adjustment'; end if;
    update lots set quantity_on_hand=quantity_on_hand+qty where id=lot.id;
    if qty<0 then
      remaining:=-qty;
      for b in select * from bin_inventory where tenant_id=p_tenant_id and lot_id=lot.id and product_id=lot.product_id order by id for update loop
        exit when remaining=0;
        update bin_inventory set quantity=quantity-least(quantity,remaining) where id=b.id;
        remaining:=remaining-least(b.quantity,remaining);
      end loop;
    end if;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
    values(p_tenant_id,lot.product_id,lot.id,actor,qty,'adjust',coalesce(p_data->>'reason','Zapier adjustment'),p_request_id::text) returning id into record_id;
  else raise exception 'Unsupported action'; end if;
  result:=jsonb_build_object('id',record_id);
  insert into inventory_operations values(p_tenant_id,p_request_id,'zapier:'||p_action,result,now());
  return result;
end $$;
revoke all on function zapier_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function zapier_action(uuid,uuid,text,jsonb) to service_role;
commit;
