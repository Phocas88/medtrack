begin;

alter table public.inbound_notices add column supplier_confirmation_id uuid references public.supplier_confirmations(id) on delete set null;
create index inbound_notice_supplier_confirmation on public.inbound_notices(supplier_confirmation_id) where supplier_confirmation_id is not null;

create function public.record_inbound_notice(tid uuid, p_po uuid, p_reference text, p_arrival date, p_tracking text, p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare notice uuid; line jsonb; po_line po_lines; quantity integer; outstanding bigint;
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

create or replace function public.create_inbound_notice(p_po uuid, p_reference text, p_arrival date, p_tracking text, p_lines jsonb)
returns uuid language sql security definer set search_path = public, pg_temp as $$
  select public.record_inbound_notice(public.require_warehouse_manager(),p_po,p_reference,p_arrival,p_tracking,p_lines)
$$;

create function public.supplier_notice_available(p_confirmation uuid)
returns table (line_id uuid, available bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select pol.id, greatest(0, least(
    (reply_line->>'quantity')::integer - coalesce(sent.quantity,0),
    pol.quantity_ordered - coalesce(pol.quantity_received,0) - coalesce(reserved.quantity,0)
  ))
  from supplier_confirmations c
  cross join lateral jsonb_array_elements(c.reply->'lines') reply_line
  join po_lines pol on pol.id=(reply_line->>'id')::uuid and pol.tenant_id=c.tenant_id and pol.po_id=c.po_id
  left join lateral (
    select sum(case when n.cancelled_at is null then l.expected_quantity else l.delivered_quantity end) quantity
    from inbound_notice_lines l join inbound_notices n on n.id=l.notice_id and n.tenant_id=l.tenant_id
    where l.tenant_id=c.tenant_id and n.supplier_confirmation_id=c.id and l.po_line_id=pol.id
  ) sent on true
  left join lateral (
    select sum(l.expected_quantity-l.delivered_quantity) quantity
    from inbound_notice_lines l join inbound_notices n on n.id=l.notice_id and n.tenant_id=l.tenant_id
    where l.tenant_id=c.tenant_id and n.cancelled_at is null and l.po_line_id=pol.id
  ) reserved on true
  where c.id=p_confirmation;
$$;

create or replace function public.open_supplier_confirmation(p_hash text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select c.snapshot || jsonb_build_object(
    'submitted',c.submitted_at is not null,
    'shipment_items',case when p.status in ('approved','sent','partial') and c.submitted_at is not null then
      coalesce((select jsonb_agg(jsonb_build_object('id',a.line_id,'available',a.available))
        from public.supplier_notice_available(c.id) a where a.available>0),'[]'::jsonb)
      else '[]'::jsonb end
  )
  from supplier_confirmations c join purchase_orders p on p.id=c.po_id and p.tenant_id=c.tenant_id
  where c.token_hash=p_hash and c.revoked_at is null and c.expires_at>now()
    and (c.submitted_at is not null or p.status in ('approved','sent','partial'))
$$;

create function public.submit_supplier_shipment_notice(p_hash text,p_reference text,p_arrival date,p_tracking text,p_lines jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare c supplier_confirmations; notice uuid; line jsonb; available bigint; amount integer; existing inbound_notices; previous_lines jsonb;
begin
  select * into c from supplier_confirmations where token_hash=p_hash;
  if not found then return null; end if;
  perform 1 from purchase_orders where id=c.po_id and tenant_id=c.tenant_id and status in ('approved','sent','partial') for update;
  if not found then return null; end if;
  select * into c from supplier_confirmations where id=c.id for update;
  if c.revoked_at is not null or c.expires_at<=now() or c.submitted_at is null then return null; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 200
     or (select count(distinct value->>'po_line_id') from jsonb_array_elements(p_lines))<>jsonb_array_length(p_lines) then
    raise exception 'Enter at least one unique PO line';
  end if;
  select * into existing from inbound_notices where tenant_id=c.tenant_id and po_id=c.po_id and reference=upper(btrim(p_reference));
  if found then
    if existing.supplier_confirmation_id is distinct from c.id or existing.cancelled_at is not null then
      raise exception 'This shipment reference is already in use';
    end if;
    select jsonb_agg(jsonb_build_object('po_line_id',l.po_line_id,'quantity',l.expected_quantity) order by l.po_line_id) into previous_lines
    from inbound_notice_lines l where l.notice_id=existing.id and l.tenant_id=c.tenant_id;
    if existing.expected_date=p_arrival and existing.tracking is not distinct from nullif(btrim(p_tracking),'')
      and previous_lines=(select jsonb_agg(value order by value->>'po_line_id') from jsonb_array_elements(p_lines)) then
      return existing.id;
    end if;
    raise exception 'This shipment reference is already in use';
  end if;
  for line in select value from jsonb_array_elements(p_lines) loop
    amount := (line->>'quantity')::integer;
    select a.available into available from public.supplier_notice_available(c.id) a where a.line_id=(line->>'po_line_id')::uuid;
    if not found or amount is null or amount<=0 or amount>available then raise exception 'Shipment quantity exceeds the confirmed balance'; end if;
  end loop;
  notice := public.record_inbound_notice(c.tenant_id,c.po_id,p_reference,p_arrival,p_tracking,p_lines);
  update inbound_notices set supplier_confirmation_id=c.id where id=notice;
  return notice;
end $$;

revoke all on function public.record_inbound_notice(uuid,uuid,text,date,text,jsonb),public.supplier_notice_available(uuid),
  public.submit_supplier_shipment_notice(text,text,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_supplier_shipment_notice(text,text,date,text,jsonb) to service_role;
commit;
