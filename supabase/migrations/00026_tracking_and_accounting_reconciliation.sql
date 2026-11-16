begin;
alter table sales_orders add column delivery_status text;
alter table sales_orders add column tracking_updated_at timestamptz;
create function apply_shipping_tracking(p_event text,p_tracker text,p_status text,p_updated timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes;
begin
  if p_status not in ('unknown','pre_transit','in_transit','out_for_delivery','delivered','available_for_pickup','return_to_sender','failure','cancelled','error') then raise exception 'Unknown tracking status'; end if;
  select * into q from shipping_quotes where purchased->>'tracker_id'=p_tracker and purchase_state='purchased' for update;
  if not found then raise exception 'Unknown tracker'; end if;
  if exists(select 1 from webhook_events where provider='easypost' and event_id=p_event) then return; end if;
  update sales_orders set delivery_status=p_status,tracking_updated_at=p_updated where id=q.order_id and tenant_id=q.tenant_id and (tracking_updated_at is null or tracking_updated_at<=p_updated);
  insert into webhook_events(provider,event_id,tenant_id) values('easypost',p_event,q.tenant_id);
end $$;
revoke all on function apply_shipping_tracking(text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function apply_shipping_tracking(text,text,text,timestamptz) to service_role;
commit;
