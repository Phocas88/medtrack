begin;

create table public.analytics_digest_preferences (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  cadence text not null check (cadence in ('daily','weekly')),
  primary key (tenant_id,user_id)
);
create table public.analytics_digest_history (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  report_date date not null,
  late_purchase_orders bigint not null,
  overdue_counts bigint not null,
  aging_orders bigint not null,
  carrier_exceptions bigint not null,
  primary key (tenant_id,user_id,report_date)
);
alter table public.analytics_digest_preferences enable row level security;
alter table public.analytics_digest_history enable row level security;
revoke all on public.analytics_digest_preferences,public.analytics_digest_history from public,anon,authenticated;
grant select on public.analytics_digest_preferences,public.analytics_digest_history to authenticated;
create policy analytics_digest_preferences_own on public.analytics_digest_preferences for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and user_id=(select auth.uid()) and
    (select public.get_user_role()) in ('admin','manager'));
create policy analytics_digest_history_own on public.analytics_digest_history for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and user_id=(select auth.uid()) and
    (select public.get_user_role()) in ('admin','manager'));

create function public.set_analytics_digest(p_cadence text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_warehouse_manager();
begin
  if p_cadence is null then
    delete from analytics_digest_preferences where tenant_id=tid and user_id=auth.uid();
  else
    insert into analytics_digest_preferences(tenant_id,user_id,cadence) values(tid,auth.uid(),p_cadence)
    on conflict(tenant_id,user_id) do update set cadence=excluded.cadence;
  end if;
end $$;

create function public.queue_analytics_digests() returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare today date := (now() at time zone 'UTC')::date; queued integer;
begin
  with recipients as materialized (
    select p.tenant_id,p.user_id
    from analytics_digest_preferences p
    join users u on u.id=p.user_id and u.tenant_id=p.tenant_id and u.is_active
    where u.role in ('admin','manager') and u.access_level is distinct from 'scanner_only'
      and (p.cadence='daily' or extract(isodow from today)=1)
      and exists (select 1 from tenant_billing b where b.tenant_id=p.tenant_id
        and (b.status='active' or (b.status='trialing' and b.trial_ends_at>now())))
      and not exists (select 1 from analytics_digest_history h
        where h.tenant_id=p.tenant_id and h.user_id=p.user_id and h.report_date=today)
  ), workplaces as (
    select distinct r.tenant_id from recipients r
  ), counts as materialized (
    select w.tenant_id,
      (select count(*) from purchase_orders p where p.tenant_id=w.tenant_id and p.expected_date<today
        and p.status in ('approved','sent','partial')) late_purchase_orders,
      (select count(*) from cycle_counts c where c.tenant_id=w.tenant_id and c.planned_date<today
        and c.status in ('planned','in_progress','pending_review')) overdue_counts,
      (select count(*) from sales_orders o where o.tenant_id=w.tenant_id and o.status in ('confirmed','picking')
        and o.created_at<now()-interval '48 hours') aging_orders,
      (select count(*) from public.carrier_exception_rows(w.tenant_id)) carrier_exceptions
    from workplaces w
  ), reports as (
    insert into analytics_digest_history(tenant_id,user_id,report_date,late_purchase_orders,overdue_counts,aging_orders,carrier_exceptions)
    select r.tenant_id,r.user_id,today,c.late_purchase_orders,c.overdue_counts,c.aging_orders,c.carrier_exceptions
    from recipients r join counts c on c.tenant_id=r.tenant_id
    on conflict(tenant_id,user_id,report_date) do nothing
    returning *
  )
  insert into notifications(tenant_id,user_id,notification_type,priority,title,message,entity_type,is_email_sent)
  select r.tenant_id,r.user_id,'general','low','Warehouse Exception Digest',
    format('Late POs: %s · Overdue counts: %s · Aging orders: %s · Carrier exceptions: %s. View the report in Analytics.',
      r.late_purchase_orders,r.overdue_counts,r.aging_orders,r.carrier_exceptions),
    'analytics_digest',true
  from reports r;
  get diagnostics queued=row_count;
  return queued;
end $$;

revoke all on function public.set_analytics_digest(text),public.queue_analytics_digests() from public,anon,authenticated;
grant execute on function public.set_analytics_digest(text) to authenticated;
grant execute on function public.queue_analytics_digests() to service_role;
commit;
