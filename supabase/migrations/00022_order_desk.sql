begin;
create function list_order_desk(p_query text default '',p_status text default 'all',p_page integer default 0)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; total integer;
begin
  tid:=get_tenant_id();
  if tid is null or get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  if p_status not in ('all','draft','confirmed','picking','shipped','cancelled') or p_page<0 or p_page>100000 or length(p_query)>200 then raise exception 'Invalid filters'; end if;
  select count(*) into total from sales_orders o join customers c on c.id=o.customer_id and c.tenant_id=tid where o.tenant_id=tid
    and (p_status='all' or o.status::text=p_status) and (p_query='' or o.order_number ilike '%'||p_query||'%' or c.name ilike '%'||p_query||'%');
  select coalesce(jsonb_agg(row_to_json(r)),'[]'::jsonb) into result from (
    select o.id,o.order_number,o.status,o.created_at,o.tracking_number,o.carrier,o.notes,c.name as customer,
      coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'product_id',l.product_id,'product',p.name,'sku',p.sku,'ordered',l.quantity_ordered,'shipped',l.quantity_shipped))
        from sales_order_lines l join products p on p.id=l.product_id and p.tenant_id=tid where l.order_id=o.id and l.tenant_id=tid),'[]'::jsonb) as lines
    from sales_orders o join customers c on c.id=o.customer_id and c.tenant_id=tid where o.tenant_id=tid
      and (p_status='all' or o.status::text=p_status) and (p_query='' or o.order_number ilike '%'||p_query||'%' or c.name ilike '%'||p_query||'%')
    order by o.created_at desc,o.id limit 50 offset p_page*50
  ) r;
  return jsonb_build_object('orders',result,'total',total,'page',p_page);
end $$;
revoke all on function list_order_desk(text,text,integer) from public,anon;
grant execute on function list_order_desk(text,text,integer) to authenticated;
commit;
