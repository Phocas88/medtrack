begin;

create function public.shopify_warehouse_stock_preview(p_tenant uuid, p_product uuid)
returns table (warehouse_id uuid, warehouse_name text, eligible_units bigint, allocated_demand bigint, unallocated_demand bigint)
language sql stable set search_path = public, pg_temp
as $$
  with eligible_lots as (
    select l.id, l.location_id, l.quantity_on_hand
    from lots l
    join products p on p.id = l.product_id and p.tenant_id = l.tenant_id
    where l.tenant_id = p_tenant and l.product_id = p_product and not p.is_archived
      and l.status = 'active' and (l.expiration_date is null or l.expiration_date >= current_date)
      and not exists (
        select 1 from quarantine_holds h where h.lot_id = l.id and h.status in ('held', 'rejected')
      )
  ), binned as (
    select i.lot_id, b.location_id, b.is_active, sum(i.quantity) as units
    from bin_inventory i
    join eligible_lots l on l.id = i.lot_id
    join bins b on b.id = i.bin_id and b.tenant_id = p_tenant
    where i.tenant_id = p_tenant and i.product_id = p_product and i.quantity > 0
    group by i.lot_id, b.location_id, b.is_active
  ), counted as (
    select lot_id, sum(units) as units from binned group by lot_id
  ), warehouse_stock as (
    select b.location_id, b.units from binned b
    join eligible_lots l on l.id = b.lot_id
    join counted c on c.lot_id = b.lot_id
    where b.is_active and c.units <= l.quantity_on_hand
    union all
    select l.location_id, greatest(0, l.quantity_on_hand - coalesce(c.units, 0))
    from eligible_lots l left join counted c on c.lot_id = l.id
  ), assigned_warehouses as (
    select t.pick_order_id as order_id, (array_agg(distinct b.location_id))[1] as location_id
    from scan_tasks t
    join pick_batches b on b.id = t.pick_batch_id and b.tenant_id = p_tenant and b.cancelled_at is null
    where t.tenant_id = p_tenant and t.product_id = p_product and t.status <> 'cancelled'
    group by t.pick_order_id
    having count(distinct b.location_id) = 1
  ), demand as (
    select a.location_id, sum(greatest(0, l.quantity_ordered - l.quantity_shipped)) as units
    from sales_order_lines l
    join sales_orders o on o.id = l.order_id and o.tenant_id = p_tenant
    left join assigned_warehouses a on a.order_id = o.id
    where l.tenant_id = p_tenant and l.product_id = p_product and o.status in ('confirmed', 'picking')
    group by a.location_id
  )
  select w.id, w.name, coalesce(sum(s.units), 0)::bigint,
    coalesce(assigned.units, 0), coalesce(unallocated.units, 0)
  from locations w
  left join demand assigned on assigned.location_id = w.id
  left join demand unallocated on unallocated.location_id is null
  left join warehouse_stock s on s.location_id = w.id
  where w.tenant_id = p_tenant and w.is_active
  group by w.id, w.name, assigned.units, unallocated.units
  order by w.name, w.id
$$;

revoke all on function public.shopify_warehouse_stock_preview(uuid, uuid) from public, anon, authenticated;
grant execute on function public.shopify_warehouse_stock_preview(uuid, uuid) to service_role;
commit;
