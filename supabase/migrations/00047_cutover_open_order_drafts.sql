begin;

create function public.import_cutover_order_drafts(p_request uuid,p_kind text,p_rows jsonb) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; prior jsonb; order_row record; party_id uuid; new_order uuid; totals numeric; created integer:=0;
begin
  tid:=public.require_warehouse_manager();
  if p_request is null or p_kind is null or p_kind not in ('sales_orders','purchase_orders')
    or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Select an open-order import'; end if;
  if jsonb_array_length(p_rows) not between 1 and 250 then raise exception 'Import 1–250 order lines at a time'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request::text));
  select result into prior from inventory_operations where tenant_id=tid and request_id=p_request and operation='cutover-orders';
  if found then
    if prior->>'kind' is distinct from p_kind or prior->>'fingerprint' is distinct from md5(p_rows::text)
      then raise exception 'Import request has already been used'; end if;
    return (prior->>'count')::integer;
  end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||':cutover-orders:'||p_kind));
  if exists(select 1 from jsonb_to_recordset(p_rows) x(order_number text,party text,sku text,quantity integer,unit_amount numeric)
      left join products p on p.tenant_id=tid and p.sku=x.sku and not p.is_archived
      where p.id is null or nullif(trim(x.order_number),'') is null or length(x.order_number)>100
      or x.order_number ~* '^SHOPIFY-' or nullif(trim(x.party),'') is null or length(x.party)>200
      or x.quantity is null or x.quantity not between 1 and 1000000 or x.unit_amount is null
      or x.unit_amount not between 0 and 99999999.9999 or scale(x.unit_amount)>4)
    then raise exception 'A row has an invalid order number, party, active SKU, remaining quantity, or unit amount'; end if;
  if exists(select 1 from jsonb_to_recordset(p_rows) x(order_number text,sku text) group by lower(trim(x.order_number)),x.sku having count(*)>1)
    then raise exception 'Combine duplicate SKUs on the same order before importing'; end if;
  for order_row in
    select min(trim(x.order_number)) order_number,min(trim(x.party)) party,
      count(distinct lower(trim(x.party))) parties, count(distinct trim(x.order_number)) refs,
      jsonb_agg(jsonb_build_object('sku',x.sku,'quantity',x.quantity,'amount',x.unit_amount)) lines
    from jsonb_to_recordset(p_rows) x(order_number text,party text,sku text,quantity integer,unit_amount numeric)
    group by lower(trim(x.order_number)) order by lower(trim(x.order_number))
  loop
    if order_row.parties<>1 or order_row.refs<>1 then raise exception 'Use one exact order reference and party per order'; end if;
    if p_kind='sales_orders' then
      select (array_agg(c.id))[1] into party_id from customers c
        where c.tenant_id=tid and not c.is_archived and lower(trim(c.name))=lower(order_row.party) having count(*)=1;
      if not found then raise exception 'Order % requires one active matching customer',order_row.order_number; end if;
      if exists(select 1 from sales_orders where tenant_id=tid and lower(order_number)=lower(order_row.order_number)) then
        raise exception 'Order % already exists',order_row.order_number;
      end if;
      insert into sales_orders(tenant_id,order_number,customer_id,status,created_by)
      values(tid,order_row.order_number,party_id,'draft',auth.uid()) returning id into new_order;
      insert into sales_order_lines(tenant_id,order_id,product_id,quantity_ordered,unit_price)
      select tid,new_order,p.id,l.quantity,l.amount from jsonb_to_recordset(order_row.lines) l(sku text,quantity integer,amount numeric)
      join products p on p.tenant_id=tid and p.sku=l.sku and not p.is_archived;
    else
      select (array_agg(v.id))[1] into party_id from suppliers v
        where v.tenant_id=tid and not v.is_archived and lower(trim(v.name))=lower(order_row.party) having count(*)=1;
      if not found then raise exception 'Order % requires one active matching supplier',order_row.order_number; end if;
      if exists(select 1 from purchase_orders where tenant_id=tid and lower(po_number)=lower(order_row.order_number)) then
        raise exception 'Order % already exists',order_row.order_number;
      end if;
      select sum(l.quantity*l.amount) into totals from jsonb_to_recordset(order_row.lines) l(quantity integer,amount numeric);
      insert into purchase_orders(tenant_id,po_number,supplier_id,status,total_amount,created_by)
      values(tid,order_row.order_number,party_id,'draft',totals,auth.uid()) returning id into new_order;
      insert into po_lines(tenant_id,po_id,product_id,quantity_ordered,unit_cost)
      select tid,new_order,p.id,l.quantity,l.amount from jsonb_to_recordset(order_row.lines) l(sku text,quantity integer,amount numeric)
      join products p on p.tenant_id=tid and p.sku=l.sku and not p.is_archived;
    end if;
    created:=created+1;
  end loop;
  insert into inventory_operations values(tid,p_request,'cutover-orders',jsonb_build_object('count',created,'kind',p_kind,'fingerprint',md5(p_rows::text)),now());
  return created;
end $$;

revoke all on function public.import_cutover_order_drafts(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.import_cutover_order_drafts(uuid,text,jsonb) to authenticated;
commit;
