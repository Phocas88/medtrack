begin;

create table public.analytics_dashboards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  metrics text[] not null check (cardinality(metrics) between 1 and 6
    and metrics <@ array['late_purchase_orders','overdue_counts','aging_orders','carrier_exceptions','units_in_stock','active_products']),
  created_at timestamptz not null default now(),
  unique (tenant_id,user_id,name)
);
alter table public.analytics_dashboards enable row level security;
revoke all on public.analytics_dashboards from public,anon,authenticated;
grant select,insert,update,delete on public.analytics_dashboards to authenticated;
create policy analytics_dashboards_own on public.analytics_dashboards for all to authenticated
  using (tenant_id=(select public.get_tenant_id()) and user_id=(select auth.uid()) and (select public.suite_has_access('analytics')))
  with check (tenant_id=(select public.get_tenant_id()) and user_id=(select auth.uid()) and (select public.suite_has_access('analytics')));

alter table public.analytics_digest_preferences
  add column email_delivery boolean not null default false,
  add column csv_export boolean not null default false;
alter table public.analytics_digest_history
  add column csv_export boolean not null default false,
  add column export_id uuid unique;
grant select on public.analytics_digest_preferences,public.analytics_digest_history to service_role;

create function public.analytics_exception_snapshot(p_tenant uuid)
returns table(late_purchase_orders bigint,overdue_counts bigint,aging_orders bigint,carrier_exceptions bigint)
language sql stable set search_path=public,pg_temp as $$
  select
    (select count(*) from purchase_orders p where p.tenant_id=p_tenant
      and p.expected_date<(now() at time zone 'UTC')::date and p.status in ('approved','sent','partial')),
    (select count(*) from cycle_counts c where c.tenant_id=p_tenant
      and c.planned_date<(now() at time zone 'UTC')::date and c.status in ('planned','in_progress','pending_review')),
    (select count(*) from sales_orders o where o.tenant_id=p_tenant and o.status in ('confirmed','picking')
      and o.created_at<now()-interval '48 hours'),
    (select count(*) from public.carrier_exception_rows(p_tenant))
$$;

create function public.suite_dashboard_metrics() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('analytics'); metrics jsonb;
begin
  select to_jsonb(e) into metrics from public.analytics_exception_snapshot(tid) e;
  return metrics||jsonb_build_object(
    'units_in_stock',(select coalesce(sum(l.quantity_on_hand),0) from lots l where l.tenant_id=tid and l.status='active'),
    'active_products',(select count(*) from products p where p.tenant_id=tid and not p.is_archived)
  );
end $$;

create function public.set_analytics_delivery(p_cadence text,p_email boolean,p_csv boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('analytics');
begin
  if p_cadence is null then
    delete from analytics_digest_preferences where tenant_id=tid and user_id=auth.uid();
  else
    insert into analytics_digest_preferences(tenant_id,user_id,cadence,email_delivery,csv_export)
      values(tid,auth.uid(),p_cadence,p_email,p_csv)
      on conflict(tenant_id,user_id) do update
      set cadence=excluded.cadence,email_delivery=excluded.email_delivery,csv_export=excluded.csv_export;
  end if;
end $$;

create or replace function public.queue_analytics_digests() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare today date := (now() at time zone 'UTC')::date; queued integer;
begin
  with eligible as materialized (
    select p.tenant_id,p.user_id,p.email_delivery,p.csv_export
    from analytics_digest_preferences p
    join users u on u.id=p.user_id and u.tenant_id=p.tenant_id and u.is_active
    where u.role in ('admin','manager') and u.access_level is distinct from 'scanner_only'
      and (p.cadence='daily' or extract(isodow from today)=1)
      and exists (select 1 from tenant_billing b where b.tenant_id=p.tenant_id
        and (b.status='active' or (b.status='trialing' and b.trial_ends_at>now())))
      and not exists (select 1 from analytics_digest_history h
        where h.tenant_id=p.tenant_id and h.user_id=p.user_id and h.report_date=today)
  ), workplaces as materialized (
    select d.tenant_id,public.suite_workspace_available(d.tenant_id,'analytics') enabled,e.*
    from (select distinct tenant_id from eligible) d
    cross join lateral public.analytics_exception_snapshot(d.tenant_id) e
  ), reports as (
    insert into analytics_digest_history(tenant_id,user_id,report_date,late_purchase_orders,overdue_counts,
      aging_orders,carrier_exceptions,csv_export,export_id)
    select r.tenant_id,r.user_id,today,w.late_purchase_orders,w.overdue_counts,w.aging_orders,w.carrier_exceptions,
      w.enabled and r.csv_export,case when w.enabled and (r.email_delivery or r.csv_export) then gen_random_uuid() end
    from eligible r join workplaces w on w.tenant_id=r.tenant_id
    on conflict(tenant_id,user_id,report_date) do nothing
    returning *
  )
  insert into notifications(tenant_id,user_id,notification_type,priority,title,message,entity_type,entity_id,is_email_sent)
  select r.tenant_id,r.user_id,'general','low','Warehouse Exception Digest',
    format('Late POs: %s · Overdue counts: %s · Aging orders: %s · Carrier exceptions: %s. View the report in Analytics.',
      r.late_purchase_orders,r.overdue_counts,r.aging_orders,r.carrier_exceptions),
    'analytics_digest',r.export_id,not (e.email_delivery and r.export_id is not null)
  from reports r join eligible e on e.tenant_id=r.tenant_id and e.user_id=r.user_id;
  get diagnostics queued=row_count;
  return queued;
end $$;

revoke all on function public.analytics_exception_snapshot(uuid),public.suite_dashboard_metrics(),
  public.set_analytics_delivery(text,boolean,boolean) from public,anon,authenticated;
grant execute on function public.suite_dashboard_metrics(),public.set_analytics_delivery(text,boolean,boolean) to authenticated;
commit;
