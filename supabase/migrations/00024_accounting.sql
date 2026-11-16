begin;
alter table integration_credentials add column refresh_lease uuid;
alter table integration_credentials add column refresh_until timestamptz;
create function claim_integration_refresh(p_tenant uuid,p_provider text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare token uuid;
begin
  token:=gen_random_uuid();
  update integration_credentials set refresh_lease=token,refresh_until=now()+interval '60 seconds'
    where tenant_id=p_tenant and provider=p_provider and connected and (refresh_until is null or refresh_until<now());
  if not found then return null; end if; return token;
end $$;
revoke all on function claim_integration_refresh(uuid,text) from public,anon,authenticated;
grant execute on function claim_integration_refresh(uuid,text) to service_role;
create table accounting_mappings (
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity_type text not null check(entity_type in ('customer','product')),
  entity_id uuid not null,
  remote_id text not null check(remote_id ~ '^[0-9]+$'),
  tax_code text,
  primary key(tenant_id,entity_type,entity_id)
);
create table accounting_exports (
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references sales_orders(id),
  request_id text not null,
  snapshot jsonb not null,
  invoice_id text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(tenant_id,order_id)
);
alter table accounting_mappings enable row level security;
alter table accounting_exports enable row level security;
revoke all on accounting_mappings,accounting_exports from public,anon,authenticated;
grant all on accounting_mappings,accounting_exports to service_role;
create function prepare_accounting_invoice(p_tenant uuid,p_order uuid,p_request text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o sales_orders; payload jsonb; customerref text; itemcount integer; items jsonb; existing accounting_exports;
begin
  select * into o from sales_orders where tenant_id=p_tenant and id=p_order for update;
  if not found or o.status<>'shipped' then raise exception 'Only shipped orders can be invoiced'; end if;
  select * into existing from accounting_exports where tenant_id=p_tenant and order_id=p_order;
  if found then return jsonb_build_object('request_id',existing.request_id,'snapshot',existing.snapshot,'invoice_id',existing.invoice_id,'created_at',existing.created_at); end if;
  select remote_id into customerref from accounting_mappings where tenant_id=p_tenant and entity_type='customer' and entity_id=o.customer_id;
  if customerref is null then raise exception 'Map the customer to QuickBooks first'; end if;
  select count(*) into itemcount from sales_order_lines where tenant_id=p_tenant and order_id=p_order;
  if itemcount=0 or exists(select 1 from sales_order_lines l where l.tenant_id=p_tenant and l.order_id=p_order and not exists(select 1 from accounting_mappings m where m.tenant_id=p_tenant and m.entity_type='product' and m.entity_id=l.product_id and nullif(m.tax_code,'') is not null)) then raise exception 'Map every product and tax code before exporting'; end if;
  select jsonb_agg(jsonb_build_object('Amount',l.quantity_shipped*l.unit_price,'DetailType','SalesItemLineDetail','SalesItemLineDetail',jsonb_build_object('ItemRef',jsonb_build_object('value',m.remote_id),'Qty',l.quantity_shipped,'UnitPrice',l.unit_price,'TaxCodeRef',jsonb_build_object('value',m.tax_code)))) into items
    from sales_order_lines l join accounting_mappings m on m.tenant_id=p_tenant and m.entity_type='product' and m.entity_id=l.product_id where l.tenant_id=p_tenant and l.order_id=p_order;
  payload:=jsonb_build_object('CustomerRef',jsonb_build_object('value',customerref),'CurrencyRef',jsonb_build_object('value','USD'),'TxnDate',coalesce(o.ship_date,current_date)::text,'DocNumber','STK-'||left(p_request,16),'PrivateNote','Stokora order '||o.order_number,'Line',items);
  insert into accounting_exports(tenant_id,order_id,request_id,snapshot) values(p_tenant,p_order,p_request,payload);
  return jsonb_build_object('request_id',p_request,'snapshot',payload,'invoice_id',null,'created_at',now());
end $$;
revoke all on function prepare_accounting_invoice(uuid,uuid,text) from public,anon,authenticated;
grant execute on function prepare_accounting_invoice(uuid,uuid,text) to service_role;
commit;
