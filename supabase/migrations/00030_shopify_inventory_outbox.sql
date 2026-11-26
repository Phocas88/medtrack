begin;
alter table integration_jobs add column revision integer not null default 1;
create table shopify_inventory_mappings (
 tenant_id uuid not null references tenants(id) on delete cascade,
 product_id uuid not null references products(id) on delete cascade,
 variant_id text not null,
 inventory_item_id text not null,
 location_id text,
 publish_enabled boolean not null default false,
 primary key(tenant_id,product_id),unique(tenant_id,variant_id),
 check(not publish_enabled or location_id is not null)
);
alter table shopify_inventory_mappings enable row level security;
revoke all on shopify_inventory_mappings from public,anon,authenticated;
grant all on shopify_inventory_mappings to service_role;
create function map_shopify_variant(p_tenant uuid,p_product uuid,p_variant text,p_item text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from products where tenant_id=p_tenant and id=p_product) then raise exception 'Product not found'; end if;
 if exists(select 1 from shopify_inventory_mappings where tenant_id=p_tenant and product_id=p_product and variant_id<>p_variant) then raise exception 'SKU is already mapped to another Shopify variant'; end if;
 insert into shopify_inventory_mappings(tenant_id,product_id,variant_id,inventory_item_id) values(p_tenant,p_product,p_variant,p_item)
 on conflict(tenant_id,product_id) do update set inventory_item_id=excluded.inventory_item_id;
end $$;
create function enqueue_shopify_stock(p_tenant uuid,p_product uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from tenants where id=p_tenant) then return; end if;
 if not exists(select 1 from shopify_inventory_mappings m join integration_credentials c on c.tenant_id=m.tenant_id and c.provider='shopify' and c.connected where m.tenant_id=p_tenant and m.product_id=p_product and m.publish_enabled) then return; end if;
 insert into integration_jobs(tenant_id,provider,event_id,payload) values(p_tenant,'shopify','stock:'||p_tenant::text||':'||p_product::text,jsonb_build_object('kind','inventory','product_id',p_product))
 on conflict(event_id) do update set revision=integration_jobs.revision+1,
 status=case when integration_jobs.status='running' then 'running' else 'pending' end,
 attempts=case when integration_jobs.status='running' then integration_jobs.attempts else 0 end,
 next_attempt_at=now(),completed_at=null,last_error=null;
end $$;
create function stock_publish_quantity(p_tenant uuid,p_product uuid) returns integer language sql security definer stable set search_path=public,pg_temp as $$
 select greatest(0,coalesce((select sum(l.quantity_on_hand) from lots l join products p on p.id=l.product_id and p.tenant_id=l.tenant_id and not p.is_archived where l.tenant_id=p_tenant and l.product_id=p_product and l.status='active' and (l.expiration_date is null or l.expiration_date>=current_date) and not exists(select 1 from quarantine_holds h where h.lot_id=l.id and h.status in ('held','rejected'))),0)
 -coalesce((select sum(greatest(0,l.quantity_ordered-l.quantity_shipped)) from sales_order_lines l join sales_orders o on o.id=l.order_id and o.tenant_id=p_tenant where l.tenant_id=p_tenant and l.product_id=p_product and o.status in ('confirmed','picking')),0))::integer
$$;
create function queue_inventory_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare record_data jsonb; prod uuid; tid uuid;
begin
 record_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 tid:=(record_data->>'tenant_id')::uuid;
 if tg_table_name='sales_orders' then
  for prod in select product_id from sales_order_lines where order_id=(record_data->>'id')::uuid and tenant_id=tid loop perform enqueue_shopify_stock(tid,prod); end loop;
 elsif tg_table_name='quarantine_holds' then
  select product_id into prod from lots where id=(record_data->>'lot_id')::uuid and tenant_id=tid;perform enqueue_shopify_stock(tid,prod);
 elsif tg_table_name='products' then
  prod:=(record_data->>'id')::uuid;perform enqueue_shopify_stock(tid,prod);
 else
  prod:=(record_data->>'product_id')::uuid;perform enqueue_shopify_stock(tid,prod);
 end if;
 return null;
end $$;
create trigger queue_lot_stock after insert or update or delete on lots for each row execute function queue_inventory_change();
create trigger queue_line_stock after insert or update or delete on sales_order_lines for each row execute function queue_inventory_change();
create trigger queue_order_stock after update of status on sales_orders for each row execute function queue_inventory_change();
create trigger queue_archived_stock after update of is_archived on products for each row execute function queue_inventory_change();
create trigger queue_hold_stock after insert or update or delete on quarantine_holds for each row execute function queue_inventory_change();
create function finish_integration_job(p_job uuid,p_token uuid,p_revision integer,p_success boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update integration_jobs set
 status=case when revision<>p_revision then 'pending' when p_success then 'complete' when attempts>=8 then 'failed' else 'pending' end,
 next_attempt_at=case when revision<>p_revision then now() else now()+make_interval(secs=>least(3600,30*(2^least(attempts,8))::integer)) end,
 attempts=case when revision<>p_revision then 0 else attempts end,
 completed_at=case when p_success and revision=p_revision then now() else null end,
 lease_until=null,last_error=case when p_success then null else 'provider_or_import_failed' end
 where id=p_job and lease_token=p_token;
end $$;
revoke all on function map_shopify_variant(uuid,uuid,text,text),enqueue_shopify_stock(uuid,uuid),stock_publish_quantity(uuid,uuid),finish_integration_job(uuid,uuid,integer,boolean) from public,anon,authenticated;
grant execute on function map_shopify_variant(uuid,uuid,text,text),enqueue_shopify_stock(uuid,uuid),stock_publish_quantity(uuid,uuid),finish_integration_job(uuid,uuid,integer,boolean) to service_role;
commit;
