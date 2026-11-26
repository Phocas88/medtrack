begin;
create function post_lot_disposition(p_request uuid,p_lot uuid,p_quantity integer,p_kind text,p_reason text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; l lots; result jsonb; remain integer; b bin_inventory; bin_count integer;
begin
 tid:=require_inventory_access();if get_user_role() not in ('admin','manager') then raise exception 'Manager required';end if;
 if p_kind not in ('destroy','donate','consume','recall','convert') or nullif(trim(p_reason),'') is null or length(p_reason)>2000 then raise exception 'A valid action and reason are required';end if;
 if jsonb_typeof(p_metadata) is distinct from 'object' or length(p_metadata::text)>8000 then raise exception 'Invalid disposition details';end if;
 if p_kind='destroy' and (nullif(trim(p_metadata->>'method'),'') is null or nullif(trim(p_metadata->>'witness'),'') is null) then raise exception 'Destruction method and witness are required';end if;
 if p_kind='donate' and nullif(trim(p_metadata->>'recipient'),'') is null then raise exception 'Donation recipient required';end if;
 if p_metadata ? 'date' and (p_metadata->>'date')::date>current_date then raise exception 'A physical disposition cannot be posted in advance';end if;
 perform pg_advisory_xact_lock(hashtext(tid::text||p_request::text));
 select o.result into result from inventory_operations o where o.tenant_id=tid and o.request_id=p_request and o.operation='lot_disposition';if result is not null then return result;end if;
 select * into l from lots where id=p_lot and tenant_id=tid for update;if not found then raise exception 'Lot not found';end if;
 if p_kind in ('convert','recall') then
  if p_quantity<>0 then raise exception 'Status changes do not move physical stock';end if;
  if p_kind='convert' then update lots set notes=trim(regexp_replace(coalesce(notes,''),'consignment','','gi'))||' | Ownership converted' where id=l.id;
  else update lots set status='recalled' where id=l.id;end if;
 else
  if p_quantity is null or p_quantity<=0 or p_quantity>l.quantity_on_hand then raise exception 'Quantity exceeds current stock or is invalid';end if;
  if exists(select 1 from products where id=l.product_id and is_serial_tracked) then raise exception 'This disposition requires individual serial capture';end if;
  if p_kind in ('donate','consume') and (l.status<>'active' or l.expiration_date<current_date or exists(select 1 from quarantine_holds where lot_id=l.id and status in ('held','rejected'))) then raise exception 'Held, recalled or expired stock cannot be consumed or donated';end if;
  if (select coalesce(sum(quantity),0) from bin_inventory where tenant_id=tid and lot_id=l.id)>l.quantity_on_hand then raise exception 'Reconcile bin balances before adjusting this lot';end if;
  select count(*) into bin_count from bin_inventory where tenant_id=tid and lot_id=l.id and quantity>0;
  if bin_count>1 and p_quantity<l.quantity_on_hand then raise exception 'Consolidate the lot into one bin before a partial disposition';end if;
  remain:=p_quantity;
  for b in select * from bin_inventory where tenant_id=tid and lot_id=l.id and quantity>0 order by id for update loop
   exit when remain=0;update bin_inventory set quantity=quantity-least(remain,b.quantity) where id=b.id;remain:=remain-least(remain,b.quantity);
  end loop;
  update lots set quantity_on_hand=quantity_on_hand-p_quantity,status=case when quantity_on_hand=p_quantity then 'depleted'::lot_status else status end where id=l.id;
 end if;
 insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number,metadata)
 values(tid,l.product_id,l.id,auth.uid(),-p_quantity,case when p_kind='recall' then 'recall'::movement_type else 'adjust'::movement_type end,p_reason,(case p_kind when 'destroy' then 'destruction' when 'donate' then 'donation' when 'consume' then 'consignment-consume' when 'convert' then 'consignment-convert' else p_kind end)||'-'||p_request::text,p_metadata||jsonb_build_object('action',p_kind));
 result:=jsonb_build_object('lot_id',l.id,'quantity_removed',p_quantity);
 insert into inventory_operations values(tid,p_request,'lot_disposition',result,now());return result;
end $$;
revoke all on function post_lot_disposition(uuid,uuid,integer,text,text,jsonb) from public,anon;
grant execute on function post_lot_disposition(uuid,uuid,integer,text,text,jsonb) to authenticated;
commit;
