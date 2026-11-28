begin;

create table public.production_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_number bigint generated always as identity,
  kit_id uuid not null references public.kits(id),
  quantity integer not null check (quantity between 1 and 1000000),
  due_date date not null,
  status text not null default 'planned' check (status in ('planned','in_progress','completed','cancelled')),
  bom jsonb not null,
  notes text check (length(notes)<=1000),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  assembly_id uuid unique references public.kit_assemblies(id),
  output_lot_id uuid references public.lots(id),
  material_cost numeric(18,4),
  labor_cost numeric(14,4),
  overhead_cost numeric(14,4),
  unique(tenant_id,job_number)
);
create index production_jobs_planning_idx on public.production_jobs(tenant_id,due_date,id)
  where status in ('planned','in_progress');
alter table public.production_jobs enable row level security;
revoke all on public.production_jobs from public,anon,authenticated;
grant select on public.production_jobs to authenticated;
create policy production_jobs_read on public.production_jobs for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('manufacturing')));
create trigger enforce_tenant_relations before insert or update on public.production_jobs
  for each row execute function public.enforce_tenant_relations();

create function public.production_bom(p_tenant uuid,p_kit uuid) returns jsonb
language sql stable set search_path=public,pg_temp as $$
  select jsonb_agg(jsonb_build_object('product_id',c.component_product_id,'sku',p.sku,'name',p.name,'quantity',c.quantity)
    order by c.component_product_id,c.id)
  from kit_components c join products p on p.id=c.component_product_id and p.tenant_id=c.tenant_id
  where c.tenant_id=p_tenant and c.kit_id=p_kit
$$;

create function public.create_production_job(p_id uuid,p_kit uuid,p_quantity integer,p_due_date date,p_notes text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('manufacturing'); materials jsonb;
begin
  if p_id is null then raise exception 'A request ID is required'; end if;
  if exists (select 1 from production_jobs where tenant_id=tid and id=p_id) then return p_id; end if;
  perform 1 from kits k join products p on p.id=k.product_id and p.tenant_id=k.tenant_id
    where k.id=p_kit and k.tenant_id=tid and k.is_active and not p.is_archived and not p.is_serial_tracked for update of k;
  if not found then raise exception 'Choose an active bill of materials with non-serialized output'; end if;
  materials:=public.production_bom(tid,p_kit);
  if materials is null then raise exception 'Add components to this bill of materials first'; end if;
  if exists(select 1 from kit_components c join products p on p.id=c.component_product_id and p.tenant_id=c.tenant_id
    where c.tenant_id=tid and c.kit_id=p_kit and (c.quantity<=0 or p.is_archived or p.is_serial_tracked
      or c.component_product_id=(select product_id from kits where id=p_kit)
      or c.quantity::bigint*p_quantity>2147483647)) then
    raise exception 'Bill of materials contains unavailable or invalid components';
  end if;
  insert into production_jobs(id,tenant_id,kit_id,quantity,due_date,bom,notes,created_by)
    values(p_id,tid,p_kit,p_quantity,p_due_date,materials,nullif(trim(p_notes),''),auth.uid())
    on conflict(id) do nothing;
  if not exists(select 1 from production_jobs where tenant_id=tid and id=p_id) then raise exception 'Request unavailable'; end if;
  return p_id;
end $$;

create function public.production_material_plan()
returns table(product_id uuid,sku text,name text,required bigint,available bigint,shortage bigint,first_due date)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('manufacturing');
begin
  return query
    with demand as (
      select m.product_id,min(m.sku) sku,min(m.name) name,sum(m.quantity::bigint*j.quantity) required,min(j.due_date) first_due
      from production_jobs j cross join lateral jsonb_to_recordset(j.bom) m(product_id uuid,sku text,name text,quantity integer)
      where j.tenant_id=tid and j.status in ('planned','in_progress') group by m.product_id
    )
    select d.product_id,d.sku,d.name,d.required::bigint,stock.available,
      greatest(d.required-stock.available,0)::bigint,d.first_due
    from demand d cross join lateral (
      select greatest(b.on_hand-b.reserved_other,0) available from public.product_shipping_balance(tid,d.product_id,null) b
    ) stock
    order by shortage desc,d.first_due,d.sku;
end $$;

create function public.update_production_job(p_id uuid,p_action text,p_labor numeric default 0,p_overhead numeric default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('manufacturing'); job production_jobs; posted jsonb; component record;
  kit kits; materials numeric; outputlot uuid; output_assembly uuid;
begin
  select * into job from production_jobs where id=p_id and tenant_id=tid for update;
  if not found then raise exception 'Production job not found'; end if;
  if p_action='start' and job.status='planned' then
    update production_jobs set status='in_progress',started_at=now() where id=job.id returning * into job;
  elsif p_action='cancel' and job.status in ('planned','in_progress') then
    update production_jobs set status='cancelled' where id=job.id returning * into job;
  elsif p_action='complete' and job.status='in_progress' then
    if p_labor is null or p_labor<0 or p_overhead is null or p_overhead<0 then
      raise exception 'Costs must be zero or greater';
    end if;
    select * into kit from kits where id=job.kit_id and tenant_id=tid and is_active for update;
    if not found then raise exception 'This bill of materials is no longer active'; end if;
    perform 1 from kit_components where tenant_id=tid and kit_id=kit.id order by component_product_id,id for update;
    if (select jsonb_agg(jsonb_build_array(m.product_id,m.quantity) order by m.product_id,m.quantity)
      from jsonb_to_recordset(job.bom) m(product_id uuid,quantity integer)) is distinct from
      (select jsonb_agg(jsonb_build_array(c.component_product_id,c.quantity) order by c.component_product_id,c.quantity)
      from kit_components c where c.tenant_id=tid and c.kit_id=kit.id) then
      raise exception 'The bill of materials changed. Cancel this job and create a new one with the current components';
    end if;
    if not exists(select 1 from products where id=kit.product_id and tenant_id=tid and not is_archived) then
      raise exception 'The output product is archived';
    end if;
    for component in select m.product_id,sum(m.quantity::bigint*job.quantity) quantity
      from jsonb_to_recordset(job.bom) m(product_id uuid,quantity integer) group by m.product_id order by m.product_id loop
      perform pg_advisory_xact_lock(hashtext(tid::text||component.product_id::text));
      if not exists(select 1 from public.product_shipping_balance(tid,component.product_id,null) b
        where b.on_hand-b.reserved_other>=component.quantity) then
        raise exception 'Insufficient available components. Review the material plan';
      end if;
    end loop;
    posted:=public.assemble_kit(gen_random_uuid(),kit.id,job.quantity,format('Production job WO-%s',job.job_number));
    outputlot:=(posted->>'lot_id')::uuid;
    output_assembly:=(posted->>'assembly_id')::uuid;
    select coalesce(sum(c.quantity_used*l.cost_at_receipt),0) into materials
      from kit_assembly_lots c join lots l on l.id=c.lot_id and l.tenant_id=c.tenant_id
      where c.tenant_id=tid and c.assembly_id=output_assembly;
    update lots set cost_at_receipt=(materials+round(p_labor,4)+round(p_overhead,4))/job.quantity
      where tenant_id=tid and id=outputlot;
    update production_jobs set status='completed',completed_at=now(),assembly_id=output_assembly,output_lot_id=outputlot,
      material_cost=materials,labor_cost=p_labor,overhead_cost=p_overhead where id=job.id returning * into job;
  elsif not ((p_action='complete' and job.status='completed') or (p_action='start' and job.status='in_progress')
    or (p_action='cancel' and job.status='cancelled')) then raise exception 'Invalid production job transition';
  end if;
  return to_jsonb(job);
end $$;

revoke all on function public.production_bom(uuid,uuid),public.create_production_job(uuid,uuid,integer,date,text),
  public.production_material_plan(),public.update_production_job(uuid,text,numeric,numeric) from public,anon,authenticated;
grant execute on function public.create_production_job(uuid,uuid,integer,date,text),
  public.production_material_plan(),public.update_production_job(uuid,text,numeric,numeric) to authenticated;
commit;
