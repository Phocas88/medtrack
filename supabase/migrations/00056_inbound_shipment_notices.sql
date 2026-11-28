begin;

create table public.inbound_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id),
  reference text not null check (char_length(reference) between 1 and 120),
  expected_date date not null,
  tracking text check (char_length(tracking) <= 200),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (tenant_id, po_id, reference)
);
create table public.inbound_notice_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  notice_id uuid not null references public.inbound_notices(id) on delete cascade,
  po_line_id uuid not null references public.po_lines(id),
  expected_quantity integer not null check (expected_quantity > 0),
  delivered_quantity integer not null default 0 check (delivered_quantity between 0 and expected_quantity),
  unique (notice_id, po_line_id)
);
alter table public.inbound_notices enable row level security;
alter table public.inbound_notice_lines enable row level security;
revoke all on public.inbound_notices, public.inbound_notice_lines from public, anon, authenticated;
grant select on public.inbound_notices, public.inbound_notice_lines to authenticated;
create policy inbound_notice_read on public.inbound_notices for select to authenticated
using (tenant_id = public.get_tenant_id() and public.get_user_role() in ('admin','manager'));
create policy inbound_notice_line_read on public.inbound_notice_lines for select to authenticated
using (tenant_id = public.get_tenant_id() and public.get_user_role() in ('admin','manager'));

create function public.create_inbound_notice(p_po uuid, p_reference text, p_arrival date, p_tracking text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := public.require_warehouse_manager(); notice uuid; line jsonb; po_line po_lines; quantity integer; outstanding bigint;
begin
  perform 1 from purchase_orders where id = p_po and tenant_id = tid and status in ('approved','sent','partial') for update;
  if not found then raise exception 'Open purchase order not found'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 200 then
    raise exception 'Enter one to 200 PO lines for the shipment';
  end if;
  insert into inbound_notices(tenant_id,po_id,reference,expected_date,tracking)
  values (tid,p_po,upper(btrim(p_reference)),p_arrival,nullif(btrim(p_tracking),'')) returning id into notice;
  for line in select value from jsonb_array_elements(p_lines) order by value->>'po_line_id' loop
    select * into po_line from po_lines where id = (line->>'po_line_id')::uuid and tenant_id = tid and po_id = p_po;
    if not found then raise exception 'Notice line does not belong to this purchase order'; end if;
    quantity := (line->>'quantity')::integer;
    select coalesce(sum(n.expected_quantity - n.delivered_quantity), 0) into outstanding
    from inbound_notice_lines n join inbound_notices h on h.id = n.notice_id and h.tenant_id = tid
    where n.tenant_id = tid and n.po_line_id = po_line.id and h.cancelled_at is null;
    if quantity is null or quantity <= 0 or quantity + outstanding > po_line.quantity_ordered - coalesce(po_line.quantity_received, 0) then
      raise exception 'Expected quantity exceeds the PO balance available to schedule';
    end if;
    insert into inbound_notice_lines(tenant_id,notice_id,po_line_id,expected_quantity)
    values (tid,notice,po_line.id,quantity);
  end loop;
  return notice;
end $$;

create function public.receive_inbound_notice(p_request uuid, p_notice uuid, p_po uuid, p_location uuid, p_lines jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := public.require_warehouse_manager(); line jsonb; planned inbound_notice_lines; delivered integer; receipt jsonb;
begin
  if p_request is null then raise exception 'Receipt request ID required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text || p_request::text));
  select o.result into receipt from inventory_operations o where o.tenant_id = tid and o.request_id = p_request and o.operation = 'receive-po';
  if found then
    if receipt->>'notice_id' is distinct from p_notice::text or receipt->>'po_id' is distinct from p_po::text then
      raise exception 'Receipt request belongs to another shipment';
    end if;
    return receipt;
  end if;
  perform 1 from purchase_orders where id = p_po and tenant_id = tid for update;
  if not found then raise exception 'Purchase order not found'; end if;
  perform 1 from inbound_notices where id = p_notice and tenant_id = tid and po_id = p_po and cancelled_at is null for update;
  if not found then raise exception 'Shipment notice is not linked to this purchase order'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Receipt lines required';
  end if;

  for line in select value from jsonb_array_elements(p_lines) order by value->>'po_line_id' loop
    delivered := (line->>'quantity_to_receive')::integer + coalesce((line->>'damaged_quantity')::integer,0);
    select * into planned from inbound_notice_lines
    where tenant_id = tid and notice_id = p_notice and po_line_id = (line->>'po_line_id')::uuid for update;
    if not found or delivered is null or delivered < 0 or delivered > planned.expected_quantity - planned.delivered_quantity then
      raise exception 'Receipt exceeds or does not match the shipment notice';
    end if;
    update inbound_notice_lines set delivered_quantity = delivered_quantity + delivered where id = planned.id;
  end loop;
  receipt := public.receive_purchase_order(p_request,p_po,p_location,p_lines) || jsonb_build_object('notice_id',p_notice);
  update inventory_operations set result = receipt
  where tenant_id = tid and request_id = p_request and operation = 'receive-po';
  return receipt;
end $$;

create function public.cancel_inbound_notice(p_notice uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare tid uuid := public.require_warehouse_manager();
begin
  perform 1 from purchase_orders po join inbound_notices n on n.po_id = po.id and n.tenant_id = tid
  where n.id = p_notice and po.tenant_id = tid for update of po;
  if not found then raise exception 'Shipment notice not found'; end if;
  update inbound_notices set cancelled_at = coalesce(cancelled_at, now())
  where id = p_notice and tenant_id = tid;
end $$;
revoke all on function public.cancel_inbound_notice(uuid) from public, anon, authenticated;
grant execute on function public.cancel_inbound_notice(uuid) to authenticated;

revoke all on function public.create_inbound_notice(uuid,text,date,text,jsonb),
  public.receive_inbound_notice(uuid,uuid,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.create_inbound_notice(uuid,text,date,text,jsonb),
  public.receive_inbound_notice(uuid,uuid,uuid,uuid,jsonb) to authenticated;
commit;
