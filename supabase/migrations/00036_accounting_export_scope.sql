begin;
create or replace function prepare_accounting_invoice(p_tenant uuid,p_order uuid,p_request text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o sales_orders; payload jsonb; customerref text; itemcount integer; items jsonb; existing accounting_exports;
begin
  select * into o from sales_orders where tenant_id=p_tenant and id=p_order for update;
  if not found or o.status<>'shipped' then raise exception 'Only shipped orders can be invoiced'; end if;
  if o.order_number like 'SHOPIFY-%' or coalesce(o.notes,'') like 'Cash POS sale:%' then raise exception 'Shopify and paid POS orders require payment, tax, discount and freight reconciliation before accounting export';end if;
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
commit;
