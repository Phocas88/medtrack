begin;

create table public.cycle_count_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  start_date date not null,
  deadline date not null check (deadline >= start_date),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index cycle_count_plans_tenant on public.cycle_count_plans(tenant_id, created_at desc);
alter table public.cycle_count_plans enable row level security;
revoke all on public.cycle_count_plans from public, anon, authenticated;
grant select on public.cycle_count_plans to authenticated;
create policy cycle_count_plans_read on public.cycle_count_plans for select to authenticated
  using (tenant_id = public.get_tenant_id() and public.get_user_role() in ('admin', 'manager'));

alter table public.cycle_counts add column plan_id uuid references public.cycle_count_plans(id);
create index cycle_counts_plan on public.cycle_counts(plan_id) where plan_id is not null;
alter table public.cycle_count_lines
  add column count_bin_id uuid references public.bins(id),
  add column count_bin_version timestamptz,
  add column count_lot_version timestamptz;

alter table public.products add column cycle_count_class text
  check (cycle_count_class is null or cycle_count_class in ('A','B','C','D')),
  add column cycle_count_class_locked boolean not null default false;

create table public.cycle_count_rules (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  class text not null check (class in ('A','B','C','D')),
  counts_per_year integer not null check (counts_per_year between 1 and 365),
  interval_days integer not null check (interval_days between 1 and 366),
  float_days integer not null check (float_days >= 0 and float_days < interval_days),
  fiscal_start_month integer not null default 1 check (fiscal_start_month between 1 and 12),
  primary key (tenant_id, class)
);
alter table public.cycle_count_rules enable row level security;
revoke all on public.cycle_count_rules from public, anon, authenticated;
grant select on public.cycle_count_rules to authenticated;
create policy cycle_count_rules_read on public.cycle_count_rules for select to authenticated
  using (tenant_id = public.get_tenant_id() and public.get_user_role() in ('admin','manager'));
alter table public.cycle_count_plans add column recurring boolean not null default false;

create function public.save_cycle_count_rule(p_class text, p_counts integer, p_interval integer, p_float integer, p_fiscal_month integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := public.require_warehouse_manager();
begin
  if p_counts is null then
    delete from cycle_count_rules where tenant_id = tid and class = p_class;
    return;
  end if;
  insert into cycle_count_rules(tenant_id,class,counts_per_year,interval_days,float_days,fiscal_start_month)
  values (tid,p_class,p_counts,coalesce(p_interval,ceil(365.0 / nullif(p_counts,0))::integer),p_float,p_fiscal_month)
  on conflict (tenant_id,class) do update set counts_per_year=excluded.counts_per_year,
    interval_days=excluded.interval_days,float_days=excluded.float_days,fiscal_start_month=excluded.fiscal_start_month;
end $$;

create function public.generate_count_plan(p_tenant uuid, p_location uuid, p_start date, p_deadline date, p_recurring boolean)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tid uuid := p_tenant;
  plan uuid;
  day_count integer;
  warehouse_name text;
  inserted integer;
begin
  if p_start is null or p_deadline is null or p_start < current_date
     or p_deadline < p_start or p_deadline > p_start + 365 then
    raise exception 'Choose a start date and deadline within one year of each other';
  end if;
  select name into warehouse_name from locations
  where id = p_location and tenant_id = tid and is_active;
  if not found then raise exception 'Active warehouse not found'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text || ':count-plan:' || p_location::text));
  if exists (
    select 1 from cycle_counts
    where tenant_id = tid and location_id = p_location and plan_id is not null
      and status in ('planned', 'in_progress', 'pending_review')
  ) then
    if p_recurring then return null; end if;
    raise exception 'Finish or cancel the open count documents for this warehouse first';
  end if;

  if exists (
    select 1 from bin_inventory i join bins b on b.id = i.bin_id and b.tenant_id = tid
    where not p_recurring and i.tenant_id = tid and b.location_id = p_location and i.quantity > 0 and i.lot_id is null
  ) then raise exception 'Assign lot records to unlinked bin stock before creating a coverage plan'; end if;

  day_count := p_deadline - p_start + 1;
  insert into cycle_count_plans(tenant_id, location_id, start_date, deadline, created_by, recurring)
  values (tid, p_location, p_start, p_deadline, auth.uid(), p_recurring) returning id into plan;

  with bin_stock as (
    select l.id as lot_id, l.product_id, b.id as bin_id, b.bin_code as place, i.quantity,
      i.updated_at as bin_version, l.updated_at as lot_version, greatest(i.created_at::date, l.received_date) as stocked_date
    from bin_inventory i
    join bins b on b.id = i.bin_id and b.tenant_id = tid
    join lots l on l.id = i.lot_id and l.tenant_id = tid and l.product_id = i.product_id
    where i.tenant_id = tid and b.location_id = p_location and i.quantity > 0
  ), unlocated_stock as (
    select l.id as lot_id, l.product_id, null::uuid as bin_id, warehouse_name || ' · Unbinned' as place,
      (l.quantity_on_hand - coalesce(sum(i.quantity) filter (where i.quantity > 0), 0))::integer as quantity,
      null::timestamptz as bin_version, l.updated_at as lot_version, l.received_date as stocked_date
    from lots l
    left join bin_inventory i on i.tenant_id = tid and i.lot_id = l.id and i.product_id = l.product_id
    where l.tenant_id = tid and l.location_id = p_location and l.quantity_on_hand > 0
    group by l.id
    having l.quantity_on_hand > coalesce(sum(i.quantity) filter (where i.quantity > 0), 0)
  ), scope as (
    select * from bin_stock union all select * from unlocated_stock
  ), ranked as (
    select scope.*, row_number() over (order by place, product_id, lot_id, bin_id) - 1 as position,
      count(*) over () as total
    from scope
    where not p_recurring or exists (
      select 1 from products p join cycle_count_rules rule on rule.tenant_id = p.tenant_id and rule.class = p.cycle_count_class
      where p.tenant_id = tid and p.id = scope.product_id and not p.is_archived
        and exists (
          select 1
          from cycle_count_lines l
          join cycle_counts c on c.id = l.count_id and c.tenant_id = tid
          where l.tenant_id = tid and l.lot_id = scope.lot_id
            and l.count_bin_id is not distinct from scope.bin_id
            and c.status = 'approved' and c.plan_id is not null
          having coalesce(max(c.approved_at::date), scope.stocked_date, current_date)
                   + rule.interval_days - rule.float_days <= p_start
             and count(*) filter (where c.approved_at::date >= make_date(
               extract(year from p_start)::integer - (extract(month from p_start)::integer < rule.fiscal_start_month)::integer,
               rule.fiscal_start_month, 1
             )) < rule.counts_per_year
        )
    )
  ), assigned as (
    select ranked.*, p_start + (position * day_count / greatest(total, day_count))::integer as due
    from ranked
  ), batches as (
    select assigned.*, (row_number() over (partition by due order by position) - 1) / 200 + 1 as batch_number
    from assigned
  ), documents as (
    insert into cycle_counts(tenant_id, plan_id, location_id, count_number, count_type, status,
      is_blind, planned_date, created_by)
    select tid, plan, p_location, 'PLAN-' || plan::text || '-' || due::text || '-' || batch_number::text, case when p_recurring then 'recurring' else 'coverage' end, 'planned', true, due, auth.uid()
    from (select distinct due, batch_number from batches) dates
    returning id, count_number
  )
  insert into cycle_count_lines(tenant_id, count_id, product_id, lot_id, location, system_quantity,
    count_bin_id, count_bin_version, count_lot_version)
  select tid, documents.id, a.product_id, a.lot_id, a.place, a.quantity, a.bin_id, a.bin_version, a.lot_version
  from batches a join documents on documents.count_number = 'PLAN-' || plan::text || '-' || a.due::text || '-' || a.batch_number::text;
  get diagnostics inserted = row_count;
  if inserted = 0 then
    if not p_recurring then raise exception 'No countable stock in this warehouse'; end if;
    delete from cycle_count_plans where id = plan;
    return null;
  end if;
  return plan;
end $$;

create function public.create_cycle_count_plan(p_location uuid, p_start date, p_deadline date)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.generate_count_plan(public.require_warehouse_manager(), p_location, p_start, p_deadline, false);
end $$;

create function public.generate_due_cycle_counts(p_location uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.generate_count_plan(public.require_warehouse_manager(), p_location, current_date, current_date, true);
end $$;

create function public.schedule_due_cycle_counts()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare warehouse record; generated integer := 0;
begin
  for warehouse in
    select l.id, l.tenant_id from locations l
    where l.is_active and exists (select 1 from cycle_count_rules r where r.tenant_id = l.tenant_id)
    order by l.tenant_id, l.id
  loop
    if public.generate_count_plan(warehouse.tenant_id, warehouse.id, current_date, current_date, true) is not null then
      generated := generated + 1;
    end if;
  end loop;
  return generated;
end $$;

create function public.cycle_count_plan_progress()
returns table (id uuid, warehouse text, start_date date, deadline date, recurring boolean, total bigint, approved bigint,
  due_today bigint, overdue bigint, per_day bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select p.id, w.name, p.start_date, p.deadline, p.recurring, count(l.id),
    count(l.id) filter (where c.status = 'approved'),
    count(l.id) filter (where c.status <> 'approved' and c.planned_date = current_date),
    count(l.id) filter (where c.status <> 'approved' and c.planned_date < current_date),
    ceil((count(l.id) filter (where c.status <> 'approved'))::numeric
      / greatest(1, p.deadline - greatest(current_date, p.start_date) + 1))::bigint
  from cycle_count_plans p
  join locations w on w.id = p.location_id and w.tenant_id = p.tenant_id
  join cycle_counts c on c.plan_id = p.id and c.tenant_id = p.tenant_id
  join cycle_count_lines l on l.count_id = c.id and l.tenant_id = p.tenant_id
  where not p.recurring
  group by p.id, w.name
  order by p.created_at desc, p.id
  limit 20
$$;

revoke all on function public.generate_count_plan(uuid,uuid,date,date,boolean), public.generate_due_cycle_counts(uuid),
  public.schedule_due_cycle_counts(), public.save_cycle_count_rule(text,integer,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.generate_due_cycle_counts(uuid), public.save_cycle_count_rule(text,integer,integer,integer,integer) to authenticated;
grant execute on function public.schedule_due_cycle_counts() to service_role;

revoke all on function public.create_cycle_count_plan(uuid, date, date), public.cycle_count_plan_progress()
  from public, anon, authenticated;
grant execute on function public.create_cycle_count_plan(uuid, date, date), public.cycle_count_plan_progress() to authenticated;

-- A planned document's scope and approval can only be changed by the count RPCs.
create function public.guard_cycle_count_plan_records() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare plan uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_table_name = 'cycle_counts' then
    if tg_op = 'INSERT' then
      if new.plan_id is not null then raise exception 'Create coverage counts from the planner'; end if;
      return new;
    end if;
    if old.plan_id is not null and (tg_op = 'DELETE' or old.status = 'approved') then
      raise exception 'Coverage plan history is locked';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    if new.plan_id is distinct from old.plan_id or (old.plan_id is not null and (
      new.status = 'approved' or new.tenant_id is distinct from old.tenant_id
      or new.location_id is distinct from old.location_id or new.planned_date is distinct from old.planned_date
    )) then raise exception 'Coverage plan scope and approval are managed by the planner'; end if;
  else
    select plan_id into plan from cycle_counts where id = case when tg_op = 'INSERT' then new.count_id else old.count_id end;
    if plan is not null then
      if tg_op <> 'UPDATE' then raise exception 'Coverage plan scope is locked'; end if;
      if (to_jsonb(new) - array['counted_quantity','variance','counted_by','counted_at','reason_code','notes'])
         is distinct from
         (to_jsonb(old) - array['counted_quantity','variance','counted_by','counted_at','reason_code','notes']) then
        raise exception 'Coverage plan scope is locked';
      end if;
      perform 1 from cycle_counts where id = old.count_id and status in ('planned','in_progress') for share;
      if not found then raise exception 'Reopen the count before editing results'; end if;
    elsif tg_op = 'UPDATE' and exists (select 1 from cycle_counts where id = new.count_id and plan_id is not null) then
      raise exception 'Coverage plan scope is locked';
    end if;
    if tg_op = 'DELETE' then return old; end if;
  end if;
  return new;
end $$;
create trigger guard_coverage_count before insert or update or delete on public.cycle_counts
for each row execute function public.guard_cycle_count_plan_records();
create trigger guard_coverage_line before insert or update or delete on public.cycle_count_lines
for each row execute function public.guard_cycle_count_plan_records();

alter function public.post_cycle_count(uuid) rename to post_legacy_cycle_count;
revoke all on function public.post_legacy_cycle_count(uuid) from public, anon, authenticated;

create function public.post_cycle_count(p_count_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tid uuid := public.require_warehouse_manager();
  doc cycle_counts;
  line cycle_count_lines;
  lot lots;
  bin bin_inventory;
  binned bigint;
  delta integer;
begin
  select * into doc from cycle_counts where id = p_count_id and tenant_id = tid for update;
  if not found then raise exception 'Count not found'; end if;
  if doc.plan_id is null then perform public.post_legacy_cycle_count(p_count_id); return; end if;
  if doc.status = 'approved' then return; end if;
  if doc.status <> 'pending_review' then raise exception 'Count must be submitted for review'; end if;
  if doc.planned_date > current_date then raise exception 'This document is scheduled for a later date'; end if;

  -- Follow the shipping lock order and validate every line against its recorded balance.
  perform pg_advisory_xact_lock(hashtext(tid::text || product_id::text))
    from (select distinct product_id from cycle_count_lines where count_id = doc.id and tenant_id = tid order by product_id) products;
  for line in select * from cycle_count_lines where count_id = doc.id and tenant_id = tid order by product_id, lot_id, count_bin_id nulls first for update loop
    if line.counted_quantity is null or line.counted_quantity < 0 then raise exception 'Every line needs a nonnegative count'; end if;
    delta := line.counted_quantity - line.system_quantity;
    if delta <> 0 and nullif(btrim(line.reason_code), '') is null then raise exception 'Every variance needs a reason code'; end if;
    select * into lot from lots where id = line.lot_id and tenant_id = tid and product_id = line.product_id for update;
    if not found then raise exception 'Counted lot no longer exists'; end if;

    if line.count_bin_id is not null then
      select i.* into bin from bin_inventory i join bins b on b.id = i.bin_id and b.tenant_id = tid and b.location_id = doc.location_id
      where i.tenant_id = tid and i.bin_id = line.count_bin_id and i.lot_id = lot.id and i.product_id = lot.product_id
      for update of i;
      if not found and delta = 0 and line.system_quantity = 0 and line.count_bin_version is null
        and exists (select 1 from bins where id = line.count_bin_id and tenant_id = tid and location_id = doc.location_id) then
        continue;
      end if;
      if not found or bin.quantity <> line.system_quantity or bin.updated_at is distinct from line.count_bin_version then
        raise exception 'Bin inventory moved after the count snapshot. Refresh the balances and recount.';
      end if;
    else
      select coalesce(sum(quantity), 0) into binned from bin_inventory where tenant_id = tid and lot_id = lot.id and product_id = lot.product_id;
      if lot.location_id is distinct from doc.location_id or lot.updated_at is distinct from line.count_lot_version
        or lot.quantity_on_hand - binned <> line.system_quantity then
        raise exception 'Unbinned inventory moved after the count snapshot. Refresh the balances and recount.';
      end if;
    end if;

    if delta = 0 then continue; end if;
    if exists (select 1 from products where id = lot.product_id and tenant_id = tid and is_serial_tracked) then
      raise exception 'Reconcile individual serial numbers before posting a quantity variance';
    end if;
    if lot.quantity_on_hand + delta < 0 then raise exception 'Adjustment exceeds lot stock'; end if;
    if line.count_bin_id is not null then
      update bin_inventory set quantity = line.counted_quantity where id = bin.id;
    end if;
    update lots set quantity_on_hand = quantity_on_hand + delta where id = lot.id;
    insert into stock_movements(tenant_id, product_id, lot_id, user_id, quantity, movement_type, reason, reference_number, metadata)
    values (tid, lot.product_id, lot.id, auth.uid(), delta, 'adjust', 'Cycle count: ' || line.reason_code, doc.count_number,
      jsonb_build_object('cycle_count_id', doc.id, 'bin_id', line.count_bin_id, 'reason_code', line.reason_code,
        'unit_cost', lot.cost_at_receipt, 'value_change', delta * lot.cost_at_receipt));
  end loop;
  update cycle_counts set status = 'approved', approved_by = auth.uid(), approved_at = now(), completed_date = current_date where id = doc.id;
end $$;

create function public.refresh_cycle_count_document(p_count_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  tid uuid := public.require_warehouse_manager();
  doc cycle_counts;
begin
  select * into doc from cycle_counts where id = p_count_id and tenant_id = tid and plan_id is not null for update;
  if not found or doc.status not in ('planned', 'in_progress', 'pending_review') then
    raise exception 'Open coverage document not found';
  end if;
  if doc.planned_date > current_date then raise exception 'This document is scheduled for a later date'; end if;
  -- Preserve the original scope while replacing balances for a new physical count.
  with balances as (
    select line.id, l.updated_at as lot_version, i.updated_at as bin_version,
      case when line.count_bin_id is not null then coalesce(i.quantity, 0)
           else greatest(0, l.quantity_on_hand - coalesce((select sum(quantity) from bin_inventory where tenant_id = tid and lot_id = l.id), 0))::integer
      end as quantity
    from cycle_count_lines line
    join lots l on l.id = line.lot_id and l.tenant_id = tid and l.product_id = line.product_id
    left join bin_inventory i on i.tenant_id = tid and i.lot_id = l.id and i.product_id = l.product_id and i.bin_id = line.count_bin_id
    where line.tenant_id = tid and line.count_id = doc.id
  )
  update cycle_count_lines line set system_quantity = balances.quantity,
    count_bin_version = balances.bin_version, count_lot_version = balances.lot_version,
    counted_quantity = null, counted_by = null, counted_at = null, reason_code = null
  from balances where balances.id = line.id;
  update scan_tasks t set status = 'cancelled' from cycle_count_lines l
  where l.count_id = doc.id and l.tenant_id = tid and t.tenant_id = tid
    and t.cycle_count_line_id = l.id and t.status in ('pending','assigned','in_progress');
  update cycle_counts set status = 'in_progress' where id = doc.id;
end $$;

revoke all on function public.post_cycle_count(uuid), public.refresh_cycle_count_document(uuid) from public, anon, authenticated;
grant execute on function public.post_cycle_count(uuid), public.refresh_cycle_count_document(uuid) to authenticated;

create index cycle_count_line_lot_lookup on public.cycle_count_lines(tenant_id, lot_id, count_bin_id)
  where lot_id is not null;

create function public.analyze_cycle_count_abc(p_start date, p_end date, p_basis text, p_apply boolean)
returns table (product_id uuid, sku text, product_name text, period_value numeric, recommended_class text,
  current_class text, locked boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := public.require_warehouse_manager();
begin
  if p_start is null or p_end is null or p_start > p_end or p_end - p_start > 1095
     or p_basis is null or p_basis not in ('consumption','requirements') then
    raise exception 'Choose a valid analysis period and basis';
  end if;
  return query
    with activity as (
      select m.product_id as item, sum(abs(m.quantity::numeric) * coalesce(l.cost_at_receipt, p.cost, 0)) as amount
      from stock_movements m
      join products p on p.id = m.product_id and p.tenant_id = tid
      left join lots l on l.id = m.lot_id and l.tenant_id = tid
      where p_basis = 'consumption' and m.tenant_id = tid and m.movement_type = 'ship'
        and m.created_at >= p_start and m.created_at < p_end + 1
      group by m.product_id
      union all
      select l.product_id, sum(greatest(0, l.quantity_ordered - l.quantity_shipped)::numeric * coalesce(p.cost, 0))
      from sales_order_lines l
      join sales_orders o on o.id = l.order_id and o.tenant_id = tid and o.status in ('confirmed','picking')
      join products p on p.id = l.product_id and p.tenant_id = tid
      where p_basis = 'requirements' and l.tenant_id = tid and o.created_at >= p_start and o.created_at < p_end + 1
      group by l.product_id
    ), materials as (
      select p.id, p.sku, p.name, p.cycle_count_class, p.cycle_count_class_locked, greatest(0, coalesce(a.amount, 0)) as value
      from products p left join activity a on a.item = p.id
      where p.tenant_id = tid and not p.is_archived
    ), ranked as (
      select m.*, sum(m.value) over () as total, sum(m.value) over (order by m.value desc, m.id) - m.value as preceding
      from materials m
    ), recommendations as (
      select r.*, case when r.value = 0 then 'D' when r.preceding < r.total * 0.80 then 'A'
        when r.preceding < r.total * 0.95 then 'B' when r.preceding < r.total * 0.99 then 'C' else 'D' end as recommendation
      from ranked r
    ), updated as (
      update products p set cycle_count_class = r.recommendation
      from recommendations r
      where p_apply and p.id = r.id and p.tenant_id = tid and not p.cycle_count_class_locked
        and p.cycle_count_class is distinct from r.recommendation
      returning p.id
    )
    select r.id, r.sku, r.name, r.value, r.recommendation,
      case when u.id is not null then r.recommendation else r.cycle_count_class end, r.cycle_count_class_locked
    from recommendations r left join updated u on u.id = r.id
    order by r.value desc, r.id;
end $$;

revoke all on function public.analyze_cycle_count_abc(date,date,text,boolean) from public, anon, authenticated;
grant execute on function public.analyze_cycle_count_abc(date,date,text,boolean) to authenticated;

alter table public.scan_tasks add column cycle_count_line_id uuid references public.cycle_count_lines(id) on delete set null;
create unique index scan_task_open_count_line on public.scan_tasks(cycle_count_line_id)
  where cycle_count_line_id is not null and status in ('pending','assigned','in_progress');

create function public.assign_cycle_count_scanner(p_count uuid, p_assignee uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := public.require_warehouse_manager(); doc cycle_counts; assigned integer;
begin
  select * into doc from cycle_counts where id = p_count and tenant_id = tid for update;
  if not found or doc.plan_id is null or doc.status not in ('planned','in_progress')
    or doc.planned_date > current_date then raise exception 'Choose an open count document due today or earlier'; end if;
  if not exists (select 1 from users where id = p_assignee and tenant_id = tid and is_active) then
    raise exception 'Active team member not found';
  end if;
  insert into scan_tasks(tenant_id,task_type,status,title,instructions,assigned_to,assigned_by,assigned_at,
    location_id,bin_id,product_id,lot_id,cycle_count_line_id)
  select tid,'cycle_count','assigned',left('Count ' || p.sku || ' in ' || b.bin_code,250),
    'Scan bin, SKU, and lot, then enter the physical quantity.', p_assignee,auth.uid(),now(),
    doc.location_id,b.id,l.product_id,l.lot_id,l.id
  from cycle_count_lines l
  join bins b on b.id = l.count_bin_id and b.tenant_id = tid and b.location_id = doc.location_id and b.is_active
  join products p on p.id = l.product_id and p.tenant_id = tid
  where l.count_id = doc.id and l.tenant_id = tid and l.counted_quantity is null
  on conflict (cycle_count_line_id) where cycle_count_line_id is not null and status in ('pending','assigned','in_progress')
  do nothing;
  get diagnostics assigned = row_count;
  return assigned;
end $$;

create function public.submit_scanner_cycle_count(p_task uuid, p_bin text, p_sku text, p_lot text, p_quantity integer)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := public.require_inventory_access(); doc cycle_counts; task scan_tasks; line cycle_count_lines;
begin
  select c.* into doc from cycle_counts c
  join cycle_count_lines l on l.count_id = c.id and l.tenant_id = tid
  join scan_tasks t on t.cycle_count_line_id = l.id and t.tenant_id = tid
  where t.id = p_task and t.assigned_to = auth.uid() and c.tenant_id = tid and c.plan_id is not null
  for update of c;
  if not found then raise exception 'Count task is not assigned to you'; end if;
  select * into task from scan_tasks where id = p_task and tenant_id = tid and assigned_to = auth.uid() for update;
  if not found then raise exception 'Count task is not assigned to you'; end if;
  if task.status = 'completed' then return; end if;
  if task.status <> 'in_progress' or doc.status not in ('planned','in_progress') or doc.planned_date > current_date then
    raise exception 'Count task is not open';
  end if;
  select * into line from cycle_count_lines where id = task.cycle_count_line_id and tenant_id = tid and count_id = doc.id for update;
  if not found or line.counted_quantity is not null then raise exception 'This line already has a count'; end if;
  if p_quantity is null or p_quantity < 0 or line.count_bin_id is distinct from task.bin_id
    or line.product_id is distinct from task.product_id or line.lot_id is distinct from task.lot_id
    or not exists (select 1 from bins where id = line.count_bin_id and tenant_id = tid and location_id = doc.location_id and is_active and upper(bin_code) = upper(trim(p_bin)))
    or not exists (select 1 from products where id = line.product_id and tenant_id = tid and upper(sku) = upper(trim(p_sku)))
    or not exists (select 1 from lots where id = line.lot_id and tenant_id = tid and upper(lot_number) = upper(trim(p_lot)))
    then raise exception 'Scan the assigned bin, SKU, and lot, and enter a nonnegative quantity'; end if;

  update cycle_count_lines set counted_quantity = p_quantity, counted_by = auth.uid(), counted_at = now()
  where id = line.id;
  update cycle_counts set status = 'in_progress' where id = doc.id;
  update scan_tasks set status = 'completed', completed_by = auth.uid(), completed_at = now(), scanned_quantity = p_quantity
  where id = task.id;
  insert into scan_logs(tenant_id,task_id,scanned_by,scan_type,scanned_value)
  select tid,task.id,auth.uid(),'cycle_count',left(evidence,1000) from unnest(array[p_bin,p_sku,p_lot,p_quantity::text]) evidence;
end $$;

create function public.close_cycle_count_scanner_tasks() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update scan_tasks t set status = 'cancelled' from cycle_count_lines l
  where l.count_id = new.id and l.tenant_id = new.tenant_id and t.tenant_id = new.tenant_id
    and t.cycle_count_line_id = l.id and t.status in ('pending','assigned','in_progress');
  return null;
end $$;
create trigger close_cycle_count_scanner_tasks after update of status on public.cycle_counts
for each row when (new.plan_id is not null and new.status in ('approved','cancelled'))
execute function public.close_cycle_count_scanner_tasks();

revoke all on function public.assign_cycle_count_scanner(uuid,uuid), public.submit_scanner_cycle_count(uuid,text,text,text,integer),
  public.close_cycle_count_scanner_tasks() from public, anon, authenticated;
grant execute on function public.assign_cycle_count_scanner(uuid,uuid),
  public.submit_scanner_cycle_count(uuid,text,text,text,integer) to authenticated;
commit;
