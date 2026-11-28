begin;

alter table public.shopify_inventory_mappings
  add column warehouse_id uuid references public.locations(id);

create function public.configure_shopify_stock_source(
  p_tenant uuid, p_product uuid, p_location text, p_warehouse uuid, p_enabled boolean
) returns void language plpgsql set search_path = public, pg_temp as $$
begin
  if p_warehouse is not null and not exists (
    select 1 from locations w where w.id = p_warehouse and w.tenant_id = p_tenant and (not p_enabled or w.is_active)
  ) then
    raise exception 'Choose an active warehouse in this workspace';
  end if;

  update shopify_inventory_mappings
  set location_id = p_location, warehouse_id = p_warehouse, publish_enabled = p_enabled
  where tenant_id = p_tenant and product_id = p_product;
  if not found then raise exception 'Shopify stock mapping not found'; end if;

  perform enqueue_shopify_stock(p_tenant, p_product);
end $$;

create function public.shopify_stock_quantity_for_mapping(
  p_tenant uuid, p_product uuid, p_location text, p_warehouse uuid
) returns integer language plpgsql stable set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from shopify_inventory_mappings m
    where m.tenant_id = p_tenant and m.product_id = p_product and m.publish_enabled
      and m.location_id = p_location and m.warehouse_id is not distinct from p_warehouse
  ) then
    return null;
  end if;

  if p_warehouse is null then
    return stock_publish_quantity(p_tenant, p_product);
  end if;

  -- Orders without a reliable location can still consume stock at the source warehouse.
  return coalesce((
    select greatest(0, eligible_units - allocated_demand - unallocated_demand)::integer
    from shopify_warehouse_stock_preview(p_tenant, p_product) where warehouse_id = p_warehouse
  ), 0);
end $$;

create function public.queue_shopify_warehouse_stock() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  previous_row jsonb;
  current_row jsonb;
  mapping record;
begin
  previous_row := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  current_row := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  if tg_table_name in ('bin_inventory', 'scan_tasks') then
    if tg_table_name = 'scan_tasks'
      and coalesce(previous_row->>'pick_batch_id', current_row->>'pick_batch_id') is null then
      return null;
    end if;
    for mapping in
      select distinct m.tenant_id, m.product_id from shopify_inventory_mappings m
      join (values (previous_row), (current_row)) r(data)
        on m.tenant_id = (r.data->>'tenant_id')::uuid and m.product_id = (r.data->>'product_id')::uuid
      where m.warehouse_id is not null and m.publish_enabled
    loop
      perform enqueue_shopify_stock(mapping.tenant_id, mapping.product_id);
    end loop;
  else
    -- Bin and warehouse activation changes can move eligible stock without touching its lot.
    for mapping in
      select m.tenant_id, m.product_id from shopify_inventory_mappings m
      where m.tenant_id = (current_row->>'tenant_id')::uuid and m.warehouse_id is not null and m.publish_enabled
      order by m.product_id
    loop
      perform enqueue_shopify_stock(mapping.tenant_id, mapping.product_id);
    end loop;
  end if;
  return null;
end $$;

create trigger queue_shopify_bin_stock after insert or update or delete on public.bin_inventory
for each row execute function public.queue_shopify_warehouse_stock();
create trigger queue_shopify_pick_assignment after insert or delete or update of status, pick_batch_id, product_id, pick_order_id on public.scan_tasks
for each row execute function public.queue_shopify_warehouse_stock();
create trigger queue_shopify_bin_configuration after update of location_id, is_active on public.bins
for each row when (old.location_id is distinct from new.location_id or old.is_active is distinct from new.is_active)
execute function public.queue_shopify_warehouse_stock();
create trigger queue_shopify_warehouse_configuration after update of is_active on public.locations
for each row when (old.is_active is distinct from new.is_active)
execute function public.queue_shopify_warehouse_stock();

revoke all on function public.configure_shopify_stock_source(uuid,uuid,text,uuid,boolean),
  public.shopify_stock_quantity_for_mapping(uuid,uuid,text,uuid), public.queue_shopify_warehouse_stock()
  from public, anon, authenticated;
grant execute on function public.configure_shopify_stock_source(uuid,uuid,text,uuid,boolean),
  public.shopify_stock_quantity_for_mapping(uuid,uuid,text,uuid) to service_role;
commit;
