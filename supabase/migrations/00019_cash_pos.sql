begin;
create table pos_sales (
  id uuid primary key default uuid_generate_v4(),tenant_id uuid not null references tenants(id),request_id uuid not null,
  order_id uuid not null references sales_orders(id),items jsonb not null,total numeric(12,2) not null,tax numeric(12,2) not null,
  tendered numeric(12,2) not null,change numeric(12,2) not null,created_by uuid not null references users(id),created_at timestamptz not null default now(),
  unique(tenant_id,request_id)
);
alter table pos_sales enable row level security;
create policy pos_manager on pos_sales for select using(tenant_id=public.get_tenant_id() and public.get_user_role() in ('admin','manager'));
revoke insert,update,delete on pos_sales from authenticated,anon;
create function post_cash_sale(p_request_id uuid,p_items jsonb,p_customer_name text,p_order_discount numeric,p_tendered numeric) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; sale pos_sales; item jsonb; prod products; qty integer; price numeric; discount numeric; subtotal numeric:=0; total numeric; tax numeric; tax_rate numeric;
  items jsonb:='[]'; ship_lines jsonb:='[]'; customerid uuid; shipped jsonb; result jsonb;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select * into sale from pos_sales where tenant_id=tid and request_id=p_request_id;
  if found then return jsonb_build_object('items',sale.items,'total',sale.total,'tax',sale.tax,'change',sale.change,'ref','POS-'||p_request_id::text); end if;
  if p_order_discount is null or p_order_discount<0 or p_order_discount>100 then raise exception 'Invalid discount'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then raise exception 'Sale items required'; end if;
  select coalesce((settings->>'sales_tax_rate')::numeric,0) into tax_rate from tenants where id=tid;
  if tax_rate<0 or tax_rate>1 then raise exception 'Configure a valid sales tax rate'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'lineType'<>'product' then raise exception 'Service checkout requires a linked service record'; end if;
    qty:=(item->>'quantity')::integer;
    select * into prod from products where id=(item->>'productId')::uuid and tenant_id=tid and not is_archived;
    if not found or qty is null or qty<=0 then raise exception 'Invalid sale item'; end if;
    select sale_price into price from promotions where tenant_id=tid and product_id=prod.id and status='active' and start_date<=current_date and end_date>=current_date order by sale_price limit 1;
    price:=coalesce(price,prod.price); discount:=coalesce((item->>'discount')::numeric,0);
    if discount<0 or discount>price then raise exception 'Invalid line discount'; end if;
    subtotal:=subtotal+(price-discount)*qty;
    items:=items||jsonb_build_array(jsonb_build_object('product',null,'productId',prod.id,'label',prod.name,'sku',prod.sku,'lineType','product','quantity',qty,'unitPrice',price,'originalPrice',prod.price,'discount',discount));
    ship_lines:=ship_lines||jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',qty,'unit_price',(price-discount)*(1-p_order_discount/100)));
  end loop;
  subtotal:=round(subtotal*(1-p_order_discount/100),2);tax:=round(subtotal*tax_rate,2);total:=subtotal+tax;
  if p_tendered is null or p_tendered<total then raise exception 'Insufficient cash tendered'; end if;
  select id into customerid from customers where tenant_id=tid and name='POS walk-in' order by created_at limit 1;
  if customerid is null then insert into customers(tenant_id,name) values(tid,'POS walk-in') returning id into customerid; end if;
  shipped:=ship_inventory(p_request_id,jsonb_build_object('customer_id',customerid,'lines',ship_lines,'notes','Cash POS sale: '||left(coalesce(p_customer_name,'Walk-in'),200)));
  insert into pos_sales(tenant_id,request_id,order_id,items,total,tax,tendered,change,created_by)
    values(tid,p_request_id,(shipped->>'order_id')::uuid,items,total,tax,p_tendered,p_tendered-total,auth.uid());
  return jsonb_build_object('items',items,'total',total,'tax',tax,'change',p_tendered-total,'ref','POS-'||p_request_id::text);
end $$;
revoke all on function post_cash_sale(uuid,jsonb,text,numeric,numeric) from public,anon;
grant execute on function post_cash_sale(uuid,jsonb,text,numeric,numeric) to authenticated;
commit;
