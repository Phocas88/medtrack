begin;

create function public.warehouse_operations_comparison()
returns table (
  warehouse_id uuid, warehouse_name text, stock_units bigint, stock_value numeric, currency text,
  unavailable_units bigint, stocked_skus bigint, open_picks bigint, overdue_counts bigint
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  tid uuid := public.require_warehouse_manager();
  today date;
  currency_code text;
begin
  select (now() at time zone coalesce((select zone.name from pg_timezone_names zone where zone.name=t.settings->>'timezone'),'UTC'))::date
    ,case when upper(t.settings->>'currency') ~ '^[A-Z]{3}$' then upper(t.settings->>'currency') else 'USD' end
  into today,currency_code from tenants t where t.id=tid;

  return query
  with warehouses as materialized (
    select w.id,w.name from locations w where w.tenant_id=tid and w.is_active
  ), stock as materialized (
    select l.id,l.product_id,l.location_id,l.quantity_on_hand,coalesce(l.cost_at_receipt,0) cost,
      (p.is_archived or l.status is distinct from 'active' or l.expiration_date<today
       or exists(select 1 from quarantine_holds h where h.tenant_id=tid and h.lot_id=l.id and h.status in ('held','rejected'))) restricted
    from lots l join products p on p.id=l.product_id and p.tenant_id=tid
    where l.tenant_id=tid and l.quantity_on_hand>0
  ), bin_rows as materialized (
    select s.id lot_id,b.location_id,w.id mapped,sum(i.quantity) units
    from stock s join bin_inventory i on i.tenant_id=tid and i.lot_id=s.id and i.product_id=s.product_id and i.quantity>0
    join bins b on b.id=i.bin_id and b.tenant_id=tid
    left join warehouses w on w.id=b.location_id
    group by s.id,b.location_id,w.id
  ), totals as (
    select b.lot_id,sum(b.units) units from bin_rows b group by b.lot_id
  ), usable_assignments as (
    select s.id,s.product_id,b.mapped location_id,b.units,s.cost,s.restricted
    from bin_rows b join stock s on s.id=b.lot_id join totals t on t.lot_id=b.lot_id
    where t.units<=s.quantity_on_hand and b.mapped is not null
    union all
    select s.id,s.product_id,w.id,(s.quantity_on_hand-coalesce(t.units,0))::bigint,s.cost,s.restricted
    from stock s join warehouses w on w.id=s.location_id left join totals t on t.lot_id=s.id
    where s.quantity_on_hand>coalesce(t.units,0)
  ), attributed as (
    select a.id,sum(a.units) units from usable_assignments a group by a.id
  ), buckets as (
    select a.product_id,a.location_id,a.units,a.cost,a.restricted from usable_assignments a
    union all
    select s.product_id,null::uuid,(s.quantity_on_hand-coalesce(a.units,0))::bigint,s.cost,true
    from stock s left join attributed a on a.id=s.id where s.quantity_on_hand>coalesce(a.units,0)
  ), balances as (
    select b.location_id,sum(b.units)::bigint units,sum(b.units*b.cost) value,
      coalesce(sum(b.units) filter(where b.restricted),0)::bigint restricted_units,
      count(distinct b.product_id) skus
    from buckets b group by b.location_id
  ), picks as (
    select t.location_id,count(*) tasks from scan_tasks t
    where t.tenant_id=tid and t.task_type='pick' and t.status in ('pending','assigned','in_progress')
    group by t.location_id
  ), counts as (
    select c.location_id,count(*) documents from cycle_counts c
    where c.tenant_id=tid and c.planned_date<today and c.status in ('planned','in_progress','pending_review')
    group by c.location_id
  )
  select w.id,w.name,coalesce(b.units,0),coalesce(b.value,0),currency_code,coalesce(b.restricted_units,0),
    coalesce(b.skus,0),coalesce(p.tasks,0),coalesce(c.documents,0)
  from warehouses w left join balances b on b.location_id=w.id
  left join picks p on p.location_id=w.id left join counts c on c.location_id=w.id
  union all
  select null::uuid,'Needs Location Review',b.units,b.value,currency_code,b.restricted_units,b.skus,0::bigint,0::bigint
  from balances b where b.location_id is null
  order by 2;
end $$;

revoke all on function public.warehouse_operations_comparison() from public,anon,authenticated;
grant execute on function public.warehouse_operations_comparison() to authenticated;
commit;
