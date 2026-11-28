begin;

create table public.purchase_approval_rules (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  admin_threshold numeric(14,4) check (admin_threshold>=0),
  separate_approver boolean not null default false
);
alter table public.purchase_approval_rules enable row level security;
revoke all on public.purchase_approval_rules from public,anon,authenticated;
grant select on public.purchase_approval_rules to authenticated;
create policy purchase_approval_rules_read on public.purchase_approval_rules for select to authenticated
  using (tenant_id=(select public.get_tenant_id()) and (select public.suite_has_access('purchasing')));

create table public.supplier_portal_memberships (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (auth_user_id,supplier_id)
);
create index supplier_memberships_supplier_idx on public.supplier_portal_memberships(tenant_id,supplier_id);
alter table public.supplier_portal_memberships enable row level security;
revoke all on public.supplier_portal_memberships from public,anon,authenticated;
grant select,insert,delete on public.supplier_portal_memberships to service_role;
create trigger enforce_tenant_relations before insert or update on public.supplier_portal_memberships
  for each row execute function public.enforce_tenant_relations();

create function public.set_purchase_approval_rules(p_threshold numeric,p_separate boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_suite_access('purchasing');
begin
  if public.get_user_role() is distinct from 'admin' then raise exception 'Administrator required'; end if;
  insert into purchase_approval_rules(tenant_id,admin_threshold,separate_approver)
    values(tid,p_threshold,p_separate)
    on conflict(tenant_id) do update set admin_threshold=excluded.admin_threshold,separate_approver=excluded.separate_approver;
end $$;

create function public.guard_purchase_approval() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare rules purchase_approval_rules; subtotal numeric;
begin
  if not public.suite_workspace_available(new.tenant_id,'purchasing') then return new; end if;
  if tg_op='INSERT' then
    if new.status is distinct from 'draft' then raise exception 'Create the purchase order as a draft first'; end if;
    if auth.uid() is not null then new.created_by:=auth.uid(); end if;
    return new;
  end if;
  if new.created_by is distinct from old.created_by then raise exception 'Purchase order creator is immutable'; end if;
  if new.status is null then raise exception 'Purchase order status is required'; end if;
  if old.status not in ('draft','cancelled') and
    row(new.supplier_id,new.total_amount,new.location_id) is distinct from row(old.supplier_id,old.total_amount,old.location_id) then
    raise exception 'Submitted purchase order terms are locked';
  end if;
  if new.status='approved' and old.status is distinct from 'approved' then
    if old.status is distinct from 'pending_approval' then raise exception 'Submit this purchase order for approval first'; end if;
    if not public.suite_has_access('purchasing') then raise exception 'A workspace manager must approve this purchase order'; end if;
    select sum(quantity_ordered*unit_cost) into subtotal from po_lines where tenant_id=new.tenant_id and po_id=new.id;
    if subtotal is null then raise exception 'Add purchase order lines before approving'; end if;
    select * into rules from purchase_approval_rules where tenant_id=new.tenant_id;
    if rules.separate_approver and (old.created_by is null or old.created_by=auth.uid()) then
      raise exception 'A different user must approve this purchase order';
    end if;
    if subtotal>=rules.admin_threshold and public.get_user_role() is distinct from 'admin' then
      raise exception 'An administrator must approve purchase orders at or above the configured amount';
    end if;
    new.approved_by:=auth.uid();
    new.approved_at:=now();
  elsif row(new.approved_by,new.approved_at) is distinct from row(old.approved_by,old.approved_at) then
    raise exception 'Purchase order approval is recorded by the system';
  end if;
  if new.status in ('sent','partial','received') and coalesce(old.status::text,'') not in ('approved','sent','partial','received') then
    raise exception 'Approve this purchase order before sending or receiving';
  end if;
  if new.status='draft' and old.status is distinct from 'draft' and old.status is distinct from 'pending_approval' then
    raise exception 'Only a pending purchase order can return to draft';
  end if;
  if new.status='pending_approval' and old.status is distinct from 'draft' and old.status is distinct from 'pending_approval' then
    raise exception 'Only a draft purchase order can be submitted';
  end if;
  return new;
end $$;
create trigger guard_purchase_approval before insert or update on public.purchase_orders
  for each row execute function public.guard_purchase_approval();

create function public.guard_purchase_terms() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare po purchase_orders; tid uuid; poid uuid;
begin
  if tg_op='UPDATE' and row(new.tenant_id,new.po_id) is distinct from row(old.tenant_id,old.po_id) then
    raise exception 'Purchase order line cannot move to a different order';
  end if;
  if tg_op='DELETE' then tid:=old.tenant_id; poid:=old.po_id;
  else tid:=new.tenant_id; poid:=new.po_id; end if;
  if public.suite_workspace_available(tid,'purchasing') then
    select * into po from purchase_orders where tenant_id=tid and id=poid for update;
    if found and po.status is distinct from 'draft' then
      if tg_op<>'UPDATE' then raise exception 'Submitted purchase order lines are locked'; end if;
      if row(new.product_id,new.quantity_ordered,new.unit_cost) is distinct from row(old.product_id,old.quantity_ordered,old.unit_cost) then
        raise exception 'Submitted purchase order lines are locked';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger guard_purchase_terms before insert or update or delete on public.po_lines
  for each row execute function public.guard_purchase_terms();

create function public.save_purchase_order(p_id uuid,p_number text,p_header jsonb,p_lines jsonb,p_submit boolean)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_warehouse_manager(); oid uuid; subtotal numeric;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 500 then
    raise exception 'Add between 1 and 500 lines';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_lines) l(product_id uuid,quantity_ordered integer,unit_cost numeric)
    where l.quantity_ordered is null or l.quantity_ordered<=0 or l.unit_cost is null or l.unit_cost<0
      or not exists(select 1 from products where id=l.product_id and tenant_id=tid and not is_archived)) then
    raise exception 'Each line needs an active product, quantity, and unit cost';
  end if;
  select sum(l.quantity_ordered*round(l.unit_cost,4)) into subtotal
    from jsonb_to_recordset(p_lines) l(quantity_ordered integer,unit_cost numeric);
  if p_id is null then
    insert into purchase_orders(tenant_id,po_number,supplier_id,expected_date,location_id,notes,total_amount,created_by,status)
      values(tid,p_number,(p_header->>'supplier_id')::uuid,(p_header->>'expected_date')::date,
        (p_header->>'location_id')::uuid,p_header->>'notes',subtotal,auth.uid(),'draft') returning id into oid;
  else
    update purchase_orders set supplier_id=(p_header->>'supplier_id')::uuid,expected_date=(p_header->>'expected_date')::date,
      location_id=(p_header->>'location_id')::uuid,notes=p_header->>'notes',total_amount=subtotal,updated_at=now()
      where id=p_id and tenant_id=tid and status='draft' returning id into oid;
    if oid is null then raise exception 'Only a draft purchase order can be edited'; end if;
    delete from po_lines where tenant_id=tid and po_id=oid;
  end if;
  insert into po_lines(tenant_id,po_id,product_id,quantity_ordered,unit_cost,notes)
    select tid,oid,product_id,quantity_ordered,unit_cost,notes from jsonb_to_recordset(p_lines)
      l(product_id uuid,quantity_ordered integer,unit_cost numeric,notes text);
  if p_submit then update purchase_orders set status='pending_approval' where id=oid; end if;
  return oid;
end $$;

create function public.grant_supplier_portal_access(p_tenant uuid,p_supplier uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare identity uuid;
begin
  if not public.suite_workspace_available(p_tenant,'purchasing') then raise exception 'Purchasing add-on required'; end if;
  select u.id into identity from auth.users u join suppliers s on lower(s.email)=lower(u.email)
    where s.tenant_id=p_tenant and s.id=p_supplier and not s.is_archived;
  if identity is null then raise exception 'Supplier identity unavailable'; end if;
  insert into supplier_portal_memberships(auth_user_id,tenant_id,supplier_id)
    values(identity,p_tenant,p_supplier) on conflict do nothing;
end $$;

revoke all on function public.grant_supplier_portal_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.grant_supplier_portal_access(uuid,uuid) to service_role;

create function public.supplier_purchase_history()
returns table (supplier_id uuid,supplier_name text,workspace text,po_number text,status text,
  order_date date,expected_date date,lines jsonb)
language sql stable security definer set search_path=public,pg_temp as $$
  select s.id,s.name,t.name,po.po_number,po.status::text,po.order_date,po.expected_date,
    coalesce((select jsonb_agg(jsonb_build_object('sku',p.sku,'name',p.name,'ordered',l.quantity_ordered,
      'received',l.quantity_received,'unit_cost',l.unit_cost) order by p.sku,l.id)
      from po_lines l join products p on p.id=l.product_id and p.tenant_id=l.tenant_id
      where l.tenant_id=m.tenant_id and l.po_id=po.id),'[]'::jsonb)
  from supplier_portal_memberships m
  join auth.users u on u.id=m.auth_user_id
  join suppliers s on s.id=m.supplier_id and s.tenant_id=m.tenant_id
  join tenants t on t.id=m.tenant_id
  left join lateral (
    select p.* from purchase_orders p where p.tenant_id=m.tenant_id and p.supplier_id=m.supplier_id
      and p.status in ('sent','partial','received')
    order by p.order_date desc,p.id limit 100
  ) po on true
  where m.auth_user_id=auth.uid() and not s.is_archived and lower(s.email)=lower(u.email)
    and public.suite_workspace_available(m.tenant_id,'purchasing')
  order by t.name,s.name,po.order_date desc,po.id
$$;

revoke all on function public.set_purchase_approval_rules(numeric,boolean),public.guard_purchase_approval(),
  public.guard_purchase_terms(),public.save_purchase_order(uuid,text,jsonb,jsonb,boolean),
  public.supplier_purchase_history() from public,anon,authenticated;
grant execute on function public.set_purchase_approval_rules(numeric,boolean),
  public.save_purchase_order(uuid,text,jsonb,jsonb,boolean),public.supplier_purchase_history() to authenticated;
commit;
