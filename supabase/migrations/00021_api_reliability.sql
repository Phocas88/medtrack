begin;
create table api_rate_limits (
  key_hash text primary key,
  hits integer not null,
  resets_at timestamptz not null
);
create index api_limits_expiry on api_rate_limits(resets_at);
alter table api_rate_limits enable row level security;
revoke all on api_rate_limits from public,anon,authenticated;
grant all on api_rate_limits to service_role;
create function consume_api_limit(p_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
  if p_limit<1 or p_window_seconds<1 or p_window_seconds>86400 or length(p_key)>200 then raise exception 'Invalid rate limit'; end if;
  insert into api_rate_limits(key_hash,hits,resets_at) values(p_key,1,now()+make_interval(secs=>p_window_seconds))
  on conflict(key_hash) do update set hits=case when api_rate_limits.resets_at<=now() then 1 else api_rate_limits.hits+1 end,
    resets_at=case when api_rate_limits.resets_at<=now() then now()+make_interval(secs=>p_window_seconds) else api_rate_limits.resets_at end
  returning hits into n;
  delete from api_rate_limits where resets_at<now()-interval '1 day';
  return n<=p_limit;
end $$;
revoke all on function consume_api_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function consume_api_limit(text,integer,integer) to service_role;

alter table shipping_quotes add column order_id uuid references sales_orders(id);
alter table shipping_quotes add column rate_id text;
alter table shipping_quotes add column purchase_state text not null default 'quoted' check(purchase_state in ('quoted','buying','uncertain','purchased'));
alter table shipping_quotes add column lease_token uuid;
alter table shipping_quotes add column lease_until timestamptz;
create unique index one_active_label_per_order on shipping_quotes(order_id) where order_id is not null and purchase_state in ('buying','uncertain','purchased');
create function claim_label_purchase(p_tenant uuid,p_order uuid,p_shipment text,p_rate text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes; o sales_orders; token uuid;
begin
  select * into o from sales_orders where tenant_id=p_tenant and id=p_order for update;
  if not found then raise exception 'Order not found'; end if;
  select * into q from shipping_quotes where shipment_id=p_shipment and tenant_id=p_tenant for update;
  if not found or not exists(select 1 from jsonb_array_elements(q.rates) r where r->>'id'=p_rate) then raise exception 'Quote or rate not found'; end if;
  if q.order_id is not null and (q.order_id<>p_order or q.rate_id<>p_rate) then raise exception 'Quote is bound to another purchase'; end if;
  if q.purchased is not null and q.order_id is null then raise exception 'Legacy label requires reconciliation before reuse'; end if;
  if q.purchased is not null then return jsonb_build_object('mode','cached','result',q.purchased); end if;
  if o.status not in ('draft','confirmed','picking') and q.purchase_state='quoted' then raise exception 'Order is unavailable for shipping'; end if;
  if q.lease_until>now() then return jsonb_build_object('mode','busy'); end if;
  if exists(select 1 from shipping_quotes where order_id=p_order and shipment_id<>p_shipment and purchase_state in ('buying','uncertain','purchased')) then raise exception 'Order already has a label purchase; recover it before buying another'; end if;
  token:=gen_random_uuid();
  update shipping_quotes set order_id=p_order,rate_id=p_rate,purchase_state='buying',lease_token=token,lease_until=now()+interval '90 seconds' where shipment_id=p_shipment;
  return jsonb_build_object('mode',case when q.purchase_state in ('buying','uncertain') then 'recover' else 'buy' end,'token',token);
end $$;
create function complete_label_purchase(p_tenant uuid,p_shipment text,p_token uuid,p_result jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes; orderid uuid;
begin
  select order_id into orderid from shipping_quotes where shipment_id=p_shipment and tenant_id=p_tenant;
  perform 1 from sales_orders where id=orderid and tenant_id=p_tenant for update;
  select * into q from shipping_quotes where shipment_id=p_shipment and tenant_id=p_tenant for update;
  if not found or q.lease_token is distinct from p_token then raise exception 'Purchase lease expired'; end if;
  if p_result->>'id' is distinct from p_shipment or p_result#>>'{rate,id}' is distinct from q.rate_id or nullif(p_result->>'label_url','') is null or nullif(p_result->>'tracking_code','') is null then raise exception 'Invalid label response'; end if;
  update shipping_quotes set purchased=p_result,purchase_state='purchased',lease_until=null where shipment_id=p_shipment;
  update sales_orders set tracking_number=p_result->>'tracking_code',carrier=p_result#>>'{rate,carrier}',shipping_label_url=p_result->>'label_url',shipping_rate=(p_result#>>'{rate,rate}')::numeric where id=q.order_id and tenant_id=p_tenant;
end $$;
revoke all on function claim_label_purchase(uuid,uuid,text,text),complete_label_purchase(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function claim_label_purchase(uuid,uuid,text,text),complete_label_purchase(uuid,text,uuid,jsonb) to service_role;
commit;
