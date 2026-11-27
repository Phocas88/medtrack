begin;

create function public.import_setup_contacts(p_request uuid, p_kind text, p_rows jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; prior jsonb; row_data jsonb; contact_name_value text; name_value text; email_value text; total integer;
begin
  tid := public.require_warehouse_manager();
  if p_request is null or p_kind is null or p_kind not in ('customers','suppliers') or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Select a valid contact import';
  end if;
  total := jsonb_array_length(p_rows);
  if total not between 1 and 250 then raise exception 'Import 1–250 contacts at a time'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request::text));
  select result into prior from inventory_operations where tenant_id=tid and request_id=p_request and operation='setup-contacts';
  if found then
    if prior->>'kind' is distinct from p_kind or prior->>'fingerprint' is distinct from md5(p_rows::text) then raise exception 'Import request has already been used'; end if;
    return (prior->>'count')::integer;
  end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||':setup-contacts:'||p_kind));
  for row_data in select value from jsonb_array_elements(p_rows) loop
    name_value := nullif(trim(row_data->>'name'),'');
    contact_name_value := nullif(trim(row_data->>'contact_name'),'');
    email_value := nullif(trim(row_data->>'email'),'');
    if name_value is null or length(name_value)>200 or length(contact_name_value)>200 or length(email_value)>254
      or length(row_data->>'phone')>50 or length(row_data->>'address')>600
      then raise exception 'Invalid contact details'; end if;
    if p_kind='customers' then
      if exists(select 1 from customers where tenant_id=tid and lower(trim(name))=lower(name_value)) then
        raise exception 'Customer % already exists or is repeated',name_value;
      end if;
      insert into customers(tenant_id,name,contact_name,email,phone,ship_to_address)
        values(tid,name_value,contact_name_value,email_value,nullif(trim(row_data->>'phone'),''),nullif(trim(row_data->>'address'),''));
    else
      if exists(select 1 from suppliers where tenant_id=tid and lower(trim(name))=lower(name_value)) then
        raise exception 'Supplier % already exists or is repeated',name_value;
      end if;
      insert into suppliers(tenant_id,name,contact_name,email,phone,address)
        values(tid,name_value,contact_name_value,email_value,nullif(trim(row_data->>'phone'),''),nullif(trim(row_data->>'address'),''));
    end if;
  end loop;
  -- A fingerprint verifies retries without retaining a second copy of the contact data.
  insert into inventory_operations values(tid,p_request,'setup-contacts',
    jsonb_build_object('kind',p_kind,'fingerprint',md5(p_rows::text),'count',total),now());
  return total;
end $$;

create function public.purchase_projection() returns table (
  product_id uuid, eligible_stock bigint, open_demand bigint, due_inbound bigint, daily_sales numeric, lead_days integer
)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare tid uuid;
begin
  tid := public.require_warehouse_manager();
  return query
  with stock as (
    select l.product_id,sum(l.quantity_on_hand)::bigint qty
    from lots l where l.tenant_id=tid and l.status='active' and l.quantity_on_hand>0
      and (l.expiration_date is null or l.expiration_date>=current_date)
      and not exists(select 1 from quarantine_holds h where h.lot_id=l.id and h.tenant_id=tid and h.status in ('held','rejected'))
    group by l.product_id
  ), outbound as (
    select sl.product_id,sum(greatest(sl.quantity_ordered-coalesce(sl.quantity_shipped,0),0))::bigint qty
    from sales_order_lines sl join sales_orders o on o.id=sl.order_id and o.tenant_id=sl.tenant_id
    where sl.tenant_id=tid and o.status in ('confirmed','picking')
    group by sl.product_id
  ), inbound as (
    select pl.product_id,sum(greatest(pl.quantity_ordered-coalesce(pl.quantity_received,0),0))::bigint qty
    from po_lines pl join purchase_orders po on po.id=pl.po_id and po.tenant_id=pl.tenant_id
    join products p on p.id=pl.product_id and p.tenant_id=pl.tenant_id
    where pl.tenant_id=tid and po.status in ('sent','partial')
      and po.expected_date between current_date and current_date+greatest(coalesce(p.lead_time_days,0),0)
    group by pl.product_id
  ), velocity as (
    select m.product_id,sum(-m.quantity)::numeric/90 per_day from stock_movements m
    where m.tenant_id=tid and m.movement_type='ship' and m.quantity<0 and m.created_at>=now()-interval '90 days'
    group by m.product_id
  )
  select p.id,coalesce(stock.qty,0),coalesce(outbound.qty,0),coalesce(inbound.qty,0),
    coalesce(velocity.per_day,0),greatest(coalesce(p.lead_time_days,0),0)
  from products p left join stock on stock.product_id=p.id left join outbound on outbound.product_id=p.id
  left join inbound on inbound.product_id=p.id left join velocity on velocity.product_id=p.id
  where p.tenant_id=tid and not p.is_archived;
end $$;

create function public.create_projected_draft_pos(p_request uuid,p_rows jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; prior jsonb; groups record; po_id_value uuid; created integer := 0;
begin
  tid:=public.require_warehouse_manager();
  if p_request is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Choose products for a draft'; end if;
  if jsonb_array_length(p_rows) not between 1 and 250 then raise exception 'Choose 1–250 products'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request::text));
  select result into prior from inventory_operations where tenant_id=tid and request_id=p_request and operation='projected-draft-po';
  if found then
    if prior->'rows' is distinct from p_rows then raise exception 'Draft request already used'; end if;
    return (prior->>'count')::integer;
  end if;
  if (select count(distinct product_id) from jsonb_to_recordset(p_rows) as r(product_id uuid,quantity integer))<>jsonb_array_length(p_rows)
    then raise exception 'Choose each product once'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rows) as r(product_id uuid,quantity integer)
    left join products p on p.id=r.product_id and p.tenant_id=tid and not p.is_archived
    left join suppliers v on v.id=p.supplier_id and v.tenant_id=tid and not v.is_archived
    where v.id is null or r.quantity is null or r.quantity<=0 or r.quantity>1000000
  ) then raise exception 'Each product needs an active supplier and a valid quantity'; end if;
  for groups in
    select p.supplier_id, sum(r.quantity*coalesce(p.cost,0)) amount,
      max(greatest(coalesce(p.lead_time_days,0),0)) lead_days,
      jsonb_agg(jsonb_build_object('product_id',p.id,'quantity',r.quantity,'cost',coalesce(p.cost,0))) lines
    from jsonb_to_recordset(p_rows) as r(product_id uuid,quantity integer)
    join products p on p.id=r.product_id and p.tenant_id=tid
    group by p.supplier_id order by p.supplier_id
  loop
    created:=created+1;
    insert into purchase_orders(tenant_id,po_number,supplier_id,status,expected_date,total_amount,created_by)
      values(tid,'PO-'||p_request::text||'-'||created,groups.supplier_id,'draft',current_date+groups.lead_days,groups.amount,auth.uid())
      returning id into po_id_value;
    insert into po_lines(tenant_id,po_id,product_id,quantity_ordered,unit_cost)
      select tid,po_id_value,line.product_id,line.quantity,line.cost
      from jsonb_to_recordset(groups.lines) as line(product_id uuid,quantity integer,cost numeric);
  end loop;
  insert into inventory_operations values(tid,p_request,'projected-draft-po',jsonb_build_object('rows',p_rows,'count',created),now());
  return created;
end $$;

revoke all on function public.import_setup_contacts(uuid,text,jsonb),public.purchase_projection(),public.create_projected_draft_pos(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_setup_contacts(uuid,text,jsonb),public.purchase_projection(),public.create_projected_draft_pos(uuid,jsonb) to authenticated;
commit;
