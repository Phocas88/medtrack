begin;

create function public.setup_first_warehouse(p_company text,p_warehouse text,p_timezone text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; warehouse_id uuid; already_done boolean;
begin
  tid := public.require_inventory_access();
  if public.get_user_role() is distinct from 'admin'::user_role then raise exception 'Administrator required'; end if;
  if p_company is null or length(trim(p_company)) not between 2 and 200
    or p_warehouse is null or length(trim(p_warehouse)) not between 2 and 100
    or not exists(select 1 from pg_timezone_names where name=p_timezone) then
    raise exception 'Enter a company name, warehouse name, and valid time zone';
  end if;
  select coalesce(settings->'onboarding_completed'='true'::jsonb,false) into already_done from tenants where id=tid for update;
  select id into warehouse_id from locations where tenant_id=tid and is_active
    order by (code='MAIN') desc,created_at,id limit 1;
  if already_done then return warehouse_id; end if;
  if warehouse_id is null then
    insert into locations(tenant_id,name,code,location_type)
    values(tid,trim(p_warehouse),case when exists(select 1 from locations where tenant_id=tid and code='MAIN') then
      'MAIN-'||left(gen_random_uuid()::text,8) else 'MAIN' end,'warehouse') returning id into warehouse_id;
  end if;
  insert into bins(tenant_id,location_id,bin_code,bin_type,description) values
    (tid,warehouse_id,'RECEIVING','staging','Receiving area'),
    (tid,warehouse_id,'STARTER','primary','Starter storage bin')
    on conflict(tenant_id,location_id,bin_code) do nothing;
  perform public.update_tenant_settings(jsonb_build_object('timezone',p_timezone,'onboarding_completed',true),p_company);
  return warehouse_id;
end $$;

create function public.import_setup_inventory(p_request uuid,p_location uuid,p_rows jsonb,p_kind text) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; item jsonb; prod products; destination bins; location_name text; lot_id uuid;
  qty integer; lot_no text; sku_value text; expires date; result jsonb;
begin
  tid := public.require_warehouse_manager();
  if p_request is null or p_kind is null or p_kind not in ('products','opening')
    or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid import'; end if;
  if jsonb_array_length(p_rows) not between 1 and 250 then raise exception 'Import 1–250 rows at a time'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request::text));
  select o.result into result from inventory_operations o
    where tenant_id=tid and request_id=p_request and operation='setup-import';
  if result is not null then
    if result->>'kind' is distinct from p_kind or result->'rows' is distinct from p_rows
      or result->>'location' is distinct from p_location::text then raise exception 'Import request has already been used'; end if;
    return (result->>'count')::integer;
  end if;
  if p_kind='opening' then
    select name into location_name from locations where tenant_id=tid and id=p_location and is_active;
    if not found then raise exception 'Select an active warehouse'; end if;
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    sku_value:=nullif(trim(item->>'sku'),'');
    if sku_value is null or length(sku_value)>100 then raise exception 'Every row needs a SKU of up to 100 characters'; end if;
    if p_kind='products' then
      if nullif(trim(item->>'name'),'') is null or length(trim(item->>'name'))>200 then
        raise exception 'SKU % requires a product name of up to 200 characters',sku_value;
      end if;
      if exists(select 1 from products where tenant_id=tid and sku=sku_value) then
        raise exception 'SKU % already exists or is repeated',sku_value;
      end if;
      insert into products(tenant_id,sku,name,is_lot_tracked,is_serial_tracked)
        values(tid,sku_value,trim(item->>'name'),coalesce((item->>'lot_tracked')::boolean,false),false);
    else
      select * into prod from products where tenant_id=tid and sku=sku_value and not is_archived;
      if not found then raise exception 'Active SKU % was not found',sku_value; end if;
      if prod.is_serial_tracked then raise exception 'Receive serialized SKU % with individual serials',sku_value; end if;
      select * into destination from bins where tenant_id=tid and location_id=p_location
        and bin_code=trim(item->>'bin') and is_active;
      if not found then raise exception 'SKU % needs an active bin in the selected warehouse',sku_value; end if;
      qty:=(item->>'quantity')::integer;
      if qty is null or qty<=0 then raise exception 'SKU % needs a positive whole quantity',sku_value; end if;
      lot_no:=nullif(trim(item->>'lot'),'');
      if prod.is_lot_tracked and lot_no is null then raise exception 'SKU % requires a lot number',sku_value; end if;
      lot_no:=coalesce(lot_no,'OPENING');
      expires:=nullif(item->>'expiration','')::date;
      if length(lot_no)>100 then raise exception 'Lot number is too long for SKU %',sku_value; end if;
      if exists(select 1 from lots where tenant_id=tid and product_id=prod.id and lot_number=lot_no
        and (location_id=p_location or location_id is null)) then
        raise exception 'SKU % lot % already exists or is repeated',sku_value,lot_no;
      end if;
      insert into lots(tenant_id,product_id,lot_number,quantity_on_hand,expiration_date,cost_at_receipt,location_id,location,status)
        values(tid,prod.id,lot_no,qty,expires,coalesce(prod.cost,0),p_location,location_name,
          case when expires<current_date then 'expired'::lot_status else 'active'::lot_status end) returning id into lot_id;
      insert into bin_inventory(tenant_id,bin_id,product_id,lot_id,quantity)
        values(tid,destination.id,prod.id,lot_id,qty);
      insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
        values(tid,prod.id,lot_id,auth.uid(),qty,'adjust','Opening balance import',p_request::text);
    end if;
  end loop;
  insert into inventory_operations values(tid,p_request,'setup-import',
    jsonb_build_object('count',jsonb_array_length(p_rows),'kind',p_kind,'rows',p_rows,'location',p_location),now());
  return jsonb_array_length(p_rows);
end $$;

create function public.receive_inventory_to_bin(p_request_id uuid,p_receipt jsonb,p_bin uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; target bins; posted jsonb; lot_row lots; warehouse_name text;
begin
  tid:=public.require_warehouse_manager();
  if p_request_id is null or p_receipt is null then raise exception 'Receipt request required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select result into posted from inventory_operations
    where tenant_id=tid and request_id=p_request_id and operation='receive-to-bin';
  if found then
    if posted->>'bin' is distinct from p_bin::text or posted->'receipt' is distinct from p_receipt
      then raise exception 'Receipt request has already been used'; end if;
    return jsonb_build_object('lot_id',posted->>'lot_id');
  end if;
  if exists(select 1 from inventory_operations where tenant_id=tid and request_id=p_request_id)
    then raise exception 'Receipt request has already been used'; end if;
  select b.* into target from bins b join locations l on l.id=b.location_id and l.tenant_id=b.tenant_id
    where b.id=p_bin and b.tenant_id=tid and b.is_active and l.is_active;
  if not found then raise exception 'Select an active receiving bin'; end if;
  select name into warehouse_name from locations where id=target.location_id and tenant_id=tid;
  posted:=public.receive_inventory(p_request_id,p_receipt);
  select * into strict lot_row from lots where id=(posted->>'lot_id')::uuid and tenant_id=tid for update;
  update lots set location_id=target.location_id,location=warehouse_name where id=lot_row.id;
  insert into bin_inventory(tenant_id,bin_id,product_id,lot_id,quantity)
    values(tid,target.id,lot_row.product_id,lot_row.id,lot_row.quantity_on_hand);
  update inventory_operations set operation='receive-to-bin',
    result=posted||jsonb_build_object('bin',p_bin,'receipt',p_receipt)
    where tenant_id=tid and request_id=p_request_id;
  return posted;
end $$;

revoke all on function public.setup_first_warehouse(text,text,text),public.import_setup_inventory(uuid,uuid,jsonb,text),
  public.receive_inventory_to_bin(uuid,jsonb,uuid) from public,anon;
grant execute on function public.setup_first_warehouse(text,text,text),public.import_setup_inventory(uuid,uuid,jsonb,text),
  public.receive_inventory_to_bin(uuid,jsonb,uuid) to authenticated;

commit;
