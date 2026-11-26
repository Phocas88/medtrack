begin;
create table portal_memberships (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(auth_user_id,customer_id)
);
alter table portal_memberships enable row level security;
revoke all on portal_memberships from anon,authenticated;
grant all on portal_memberships to service_role;
create trigger enforce_tenant_relations before insert or update on portal_memberships for each row execute function enforce_tenant_relations();
create function grant_portal_access(p_tenant_id uuid,p_customer_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare identity_id uuid;
begin
  select a.id into identity_id from auth.users a join customers c on lower(c.email)=lower(a.email)
    where c.id=p_customer_id and c.tenant_id=p_tenant_id;
  if identity_id is null then raise exception 'Invitation identity not found'; end if;
  insert into portal_memberships(auth_user_id,tenant_id,customer_id) values(identity_id,p_tenant_id,p_customer_id) on conflict do nothing;
end $$;
revoke all on function grant_portal_access(uuid,uuid) from public,anon,authenticated;
grant execute on function grant_portal_access(uuid,uuid) to service_role;

create function portal_place_order(p_request_id uuid,p_customer_id uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; oid uuid; line jsonb; prod products; qty integer; unit_cost numeric; discount numeric; result jsonb; ordernum text;
begin
  select tenant_id into tid from portal_memberships where auth_user_id=auth.uid() and customer_id=p_customer_id;
  if tid is null then raise exception 'Portal access required'; end if;
  if not exists(select 1 from tenant_billing where tenant_id=tid and (status='active' or status='trialing' and trial_ends_at>now())) then raise exception 'Supplier account is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where tenant_id=tid and request_id=p_request_id and operation='portal-order:'||p_customer_id::text;
  if result is not null then return result; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)=0 then raise exception 'Order lines required'; end if;
  ordernum:='WEB-'||p_request_id::text;
  insert into sales_orders(tenant_id,customer_id,order_number,status) values(tid,p_customer_id,ordernum,'confirmed') returning id into oid;
  select coalesce(t.discount_percent,0) into discount from customers c left join price_tiers t on t.id=c.price_tier_id and t.tenant_id=c.tenant_id where c.id=p_customer_id and c.tenant_id=tid;
  for line in select value from jsonb_array_elements(p_lines) loop
    select * into prod from products where id=(line->>'product_id')::uuid and tenant_id=tid and not is_archived;
    if not found then raise exception 'Product not available'; end if;
    qty:=(line->>'quantity')::integer;
    if qty is null or qty<=0 then raise exception 'Positive quantity required'; end if;
    select custom_price into unit_cost from customer_prices where tenant_id=tid and customer_id=p_customer_id and product_id=prod.id
      and effective_date<=current_date and (expiration_date is null or expiration_date>=current_date);
    unit_cost:=coalesce(unit_cost,prod.price*(1-coalesce(discount,0)/100));
    insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price) values(tid,oid,prod.id,qty,unit_cost);
  end loop;
  result:=jsonb_build_object('order_id',oid,'order_number',ordernum);
  insert into inventory_operations values(tid,p_request_id,'portal-order:'||p_customer_id::text,result,now());
  return result;
end $$;
revoke all on function portal_place_order(uuid,uuid,jsonb) from public,anon;
grant execute on function portal_place_order(uuid,uuid,jsonb) to authenticated;
commit;
