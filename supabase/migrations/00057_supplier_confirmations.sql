begin;

create table public.supplier_confirmations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  revoked_at timestamptz,
  submitted_at timestamptz,
  reply jsonb
);
create index supplier_confirmations_po on public.supplier_confirmations(tenant_id,po_id,created_at desc);
alter table public.supplier_confirmations enable row level security;
revoke all on public.supplier_confirmations from public,anon,authenticated;

create function public.create_supplier_confirmation(p_po uuid,p_hash text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_warehouse_manager(); po purchase_orders; snapshot jsonb; items jsonb;
begin
  select * into po from purchase_orders where id=p_po and tenant_id=tid and status in ('approved','sent','partial') for update;
  if not found then raise exception 'Select an approved or sent purchase order'; end if;
  select jsonb_agg(jsonb_build_object('id',l.id,'sku',p.sku,'name',p.name,'open_quantity',
    l.quantity_ordered-coalesce(l.quantity_received,0)) order by l.created_at,l.id)
  into items from po_lines l join products p on p.id=l.product_id and p.tenant_id=tid
  where l.tenant_id=tid and l.po_id=po.id and l.quantity_ordered>coalesce(l.quantity_received,0);
  if items is null or jsonb_array_length(items)>200 then raise exception 'This link supports one to 200 open PO lines'; end if;
  snapshot:=jsonb_build_object('order_number',po.po_number,'company',(select name from tenants where id=tid),'items',items);
  update supplier_confirmations set revoked_at=now() where tenant_id=tid and po_id=po.id and submitted_at is null and revoked_at is null;
  insert into supplier_confirmations(tenant_id,po_id,token_hash,snapshot) values(tid,po.id,p_hash,snapshot);
end $$;

create function public.list_supplier_confirmations(p_po uuid)
returns table(id uuid,created_at timestamptz,expires_at timestamptz,revoked_at timestamptz,submitted_at timestamptz,snapshot jsonb,reply jsonb)
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid := public.require_warehouse_manager();
begin
  return query select c.id,c.created_at,c.expires_at,c.revoked_at,c.submitted_at,c.snapshot,c.reply
  from supplier_confirmations c where c.tenant_id=tid and c.po_id=p_po order by c.created_at desc limit 10;
end $$;

create function public.open_supplier_confirmation(p_hash text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select c.snapshot || jsonb_build_object('submitted',c.submitted_at is not null)
  from supplier_confirmations c join purchase_orders p on p.id=c.po_id and p.tenant_id=c.tenant_id
  where c.token_hash=p_hash and c.revoked_at is null and c.expires_at>now()
    and (c.submitted_at is not null or p.status in ('approved','sent','partial'))
$$;

create function public.submit_supplier_confirmation(p_hash text,p_reply jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c supplier_confirmations; line jsonb; item jsonb; Qty integer; ETA date;
begin
  select * into c from supplier_confirmations where token_hash=p_hash;
  if not found then return false; end if;
  perform 1 from purchase_orders where id=c.po_id and tenant_id=c.tenant_id and status in ('approved','sent','partial') for update;
  if not found then return false; end if;
  select * into c from supplier_confirmations where id=c.id for update;
  if c.revoked_at is not null or c.expires_at<=now() then return false; end if;
  if c.submitted_at is not null then return c.reply=p_reply; end if;
  if jsonb_typeof(p_reply->'lines') is distinct from 'array' or jsonb_array_length(p_reply->'lines')<>jsonb_array_length(c.snapshot->'items')
     or (select count(distinct value->>'id') from jsonb_array_elements(p_reply->'lines'))<>jsonb_array_length(c.snapshot->'items')
     or nullif(btrim(p_reply->>'name'),'') is null then raise exception 'A reply must include your name and every PO line'; end if;
  for line in select value from jsonb_array_elements(p_reply->'lines') loop
    select value into item from jsonb_array_elements(c.snapshot->'items') where value->>'id'=line->>'id';
    Qty := (line->>'quantity')::integer;
    ETA := nullif(line->>'delivery_date','')::date;
    if not found or Qty is null or Qty<0 or Qty>(item->>'open_quantity')::integer or (Qty>0 and ETA is null) then
      raise exception 'Check the confirmed quantities and delivery dates';
    end if;
  end loop;
  update supplier_confirmations set submitted_at=now(),reply=p_reply where id=c.id;
  return true;
end $$;

revoke all on function public.create_supplier_confirmation(uuid,text),public.list_supplier_confirmations(uuid),
  public.open_supplier_confirmation(text),public.submit_supplier_confirmation(text,jsonb) from public,anon,authenticated;
grant execute on function public.create_supplier_confirmation(uuid,text), public.list_supplier_confirmations(uuid) to authenticated;
grant execute on function public.open_supplier_confirmation(text),public.submit_supplier_confirmation(text,jsonb) to service_role;
commit;
