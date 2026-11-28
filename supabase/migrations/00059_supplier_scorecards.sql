begin;

create index purchase_orders_supplier_scorecard_dates
  on public.purchase_orders(tenant_id, expected_date)
  include (id, supplier_id, status)
  where expected_date is not null and status in ('approved','sent','partial','received');

create index po_receipt_operation_reference
  on public.inventory_operations(tenant_id, (result->>'po_id'), created_at desc)
  where operation = 'receive-po';

create function public.supplier_scorecards(p_start date, p_end date)
returns table (
  supplier_id uuid, supplier_name text, po_count bigint, ordered_units bigint,
  delivered_units bigint, damaged_units bigint, usable_units bigint, overdue_pos bigint,
  overdue_units bigint, timed_completions bigint, on_time_completions bigint,
  unknown_completions bigint, shortage_reports bigint, late_orders jsonb
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  tid uuid := public.require_warehouse_manager();
  warehouse_timezone text;
  today date;
begin
  if p_start is null or p_end is null or p_start > p_end or p_end - p_start > 365 then
    raise exception 'Choose a period of up to one year';
  end if;
  select zone.name into warehouse_timezone
  from tenants t join pg_timezone_names zone on zone.name = t.settings->>'timezone'
  where t.id = tid;
  warehouse_timezone := coalesce(warehouse_timezone, 'UTC');
  today := (now() at time zone warehouse_timezone)::date;

  return query
  with cohort as materialized (
    select p.id,p.po_number,p.supplier_id,p.status,p.expected_date
    from purchase_orders p
    where p.tenant_id = tid and p.expected_date between p_start and p_end
      and p.status in ('approved','sent','partial','received')
  ), quantities as (
    select l.po_id, sum(l.quantity_ordered) ordered, sum(coalesce(l.quantity_received,0)) delivered,
      sum(greatest(0,l.quantity_ordered-coalesce(l.quantity_received,0))) open
    from cohort c join po_lines l on l.po_id=c.id and l.tenant_id=tid
    group by l.po_id
  ), discrepancy as (
    select d.po_id, sum(d.damaged_quantity) damaged, count(*) filter(where d.confirmed_shortage) shortages
    from cohort c join po_receiving_discrepancies d on d.po_id=c.id and d.tenant_id=tid
    group by d.po_id
  ), results as (
    select c.*,q.ordered,q.delivered,q.open,coalesce(d.damaged,0) damaged,coalesce(d.shortages,0) shortages,
      r.completed_on,(c.expected_date<today and q.open>0) overdue
    from cohort c join quantities q on q.po_id=c.id
    left join discrepancy d on d.po_id=c.id
    left join lateral (
      select (o.created_at at time zone warehouse_timezone)::date completed_on
      from inventory_operations o
      where o.tenant_id=tid and o.operation='receive-po' and o.result->>'po_id'=c.id::text
      order by o.created_at desc limit 1
    ) r on c.status='received' and q.open=0
  ), late as (
    select r.*,row_number() over(partition by r.supplier_id order by r.expected_date,r.id) position
    from results r where r.overdue
  ), late_preview as (
    select l.supplier_id,jsonb_agg(jsonb_build_object('id',l.id,'number',l.po_number,'due',l.expected_date,'open',l.open)
      order by l.position) examples from late l where l.position<=3 group by l.supplier_id
  )
  select s.id,s.name,count(*),sum(r.ordered)::bigint,sum(r.delivered)::bigint,sum(r.damaged)::bigint,
    sum(greatest(0,r.delivered-r.damaged))::bigint,
    count(*) filter(where r.overdue),coalesce(sum(r.open) filter(where r.overdue),0)::bigint,
    count(r.completed_on),count(*) filter(where r.completed_on<=r.expected_date),
    count(*) filter(where r.status='received' and r.open=0 and r.completed_on is null),
    sum(r.shortages)::bigint,coalesce(lp.examples,'[]'::jsonb)
  from results r join suppliers s on s.id=r.supplier_id and s.tenant_id=tid
  left join late_preview lp on lp.supplier_id=s.id
  group by s.id,s.name,lp.examples
  order by count(*) filter(where r.overdue) desc,s.name,s.id;
end $$;

revoke all on function public.supplier_scorecards(date,date) from public,anon,authenticated;
grant execute on function public.supplier_scorecards(date,date) to authenticated;
commit;
