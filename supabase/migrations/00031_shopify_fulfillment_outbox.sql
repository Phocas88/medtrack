begin;
create function enqueue_shopify_fulfillment() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from sales_orders o join integration_credentials c on c.tenant_id=o.tenant_id and c.provider='shopify' and c.connected where o.id=new.order_id and o.tenant_id=new.tenant_id and o.order_number ~ '^SHOPIFY-[0-9]+$') then
  insert into integration_jobs(tenant_id,provider,event_id,payload) values(new.tenant_id,'shopify','fulfillment:'||new.id::text,jsonb_build_object('kind','fulfillment','shipment_id',new.id)) on conflict(event_id) do nothing;
 end if;
 if new.tracking_number is not null then update sales_orders set tracking_number=new.tracking_number where id=new.order_id and tenant_id=new.tenant_id;end if;
 return new;
end $$;
create trigger queue_shopify_fulfillment after insert on shipments for each row execute function enqueue_shopify_fulfillment();
commit;
