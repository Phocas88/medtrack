begin;
create function process_return(p_request_id uuid,p_return jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; rid uuid; line jsonb; lot lots; prod products; qty integer; direction integer; disposition text;
  rtype return_type; credit numeric:=0; returned_number text; remaining integer; b bin_inventory;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where tenant_id=tid and request_id=p_request_id and operation='return';
  if result is not null then return result; end if;
  rtype:=(p_return->>'return_type')::return_type;
  if rtype='customer_return' and not exists(select 1 from customers where id=(p_return->>'customer_id')::uuid and tenant_id=tid) then raise exception 'Customer required'; end if;
  if rtype='supplier_rma' and not exists(select 1 from suppliers where id=(p_return->>'supplier_id')::uuid and tenant_id=tid) then raise exception 'Supplier required'; end if;
  if jsonb_typeof(p_return->'lines') is distinct from 'array' or jsonb_array_length(p_return->'lines')=0 then raise exception 'Return lines required'; end if;
  returned_number:='RET-'||p_request_id::text;
  insert into returns(tenant_id,return_number,return_type,status,customer_id,supplier_id,reason,created_by,inspected_by,inspected_at)
  values(tid,returned_number,rtype,'completed',case when rtype='customer_return' then (p_return->>'customer_id')::uuid end,
    case when rtype='supplier_rma' then (p_return->>'supplier_id')::uuid end,p_return->>'reason',auth.uid(),auth.uid(),now()) returning id into rid;
  for line in select value from jsonb_array_elements(p_return->'lines') order by value->>'lot_id' loop
    qty:=(line->>'quantity')::integer; disposition:=line->>'disposition';
    if qty is null or qty<=0 or disposition not in ('restock','quarantine','destroy','return_to_supplier') then raise exception 'Invalid return line'; end if;
    select * into lot from lots where id=nullif(line->>'lot_id','')::uuid and tenant_id=tid and product_id=(line->>'product_id')::uuid for update;
    if not found then raise exception 'Select the matching product lot'; end if;
    select * into prod from products where id=lot.product_id and tenant_id=tid;
    if prod.is_serial_tracked then raise exception 'Serial-tracked returns require individual serial inspection'; end if;
    if rtype='supplier_rma' and disposition not in ('return_to_supplier','destroy') then raise exception 'Choose supplier return or destruction for an RMA'; end if;
    if rtype='customer_return' and disposition='return_to_supplier' then raise exception 'Create a supplier RMA separately'; end if;
    credit:=credit+qty*case when rtype='supplier_rma' then lot.cost_at_receipt else prod.price end;
    direction:=case when rtype='supplier_rma' then -1 when disposition='destroy' then 0 else 1 end;
    if lot.quantity_on_hand+direction*qty<0 then raise exception 'Return exceeds available lot quantity'; end if;
    insert into return_lines(tenant_id,return_id,product_id,lot_id,quantity,disposition,reason)
    values(tid,rid,prod.id,lot.id,qty,disposition::return_disposition,line->>'reason');
    update lots set quantity_on_hand=quantity_on_hand+direction*qty,
      status=case when direction=1 and status='depleted' then case when expiration_date<current_date then 'expired'::lot_status else 'active'::lot_status end else status end where id=lot.id;
    if direction=-1 then
      remaining:=qty;
      for b in select * from bin_inventory where tenant_id=tid and lot_id=lot.id order by id for update loop
        exit when remaining=0;
        update bin_inventory set quantity=quantity-least(quantity,remaining) where id=b.id;
        remaining:=remaining-least(b.quantity,remaining);
      end loop;
    end if;
    if disposition='quarantine' then
      insert into quarantine_holds(tenant_id,lot_id,product_id,quantity,reason,held_by)
      values(tid,lot.id,prod.id,qty,coalesce(nullif(p_return->>'reason',''),'Return inspection'),auth.uid());
    end if;
    insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
    values(tid,prod.id,lot.id,auth.uid(),direction*qty,'return','Return: '||disposition,returned_number);
  end loop;
  update returns set credit_amount=credit where id=rid;
  result:=jsonb_build_object('return_id',rid,'return_number',returned_number,'credit_amount',credit);
  insert into inventory_operations values(tid,p_request_id,'return',result,now());
  return result;
end $$;
revoke all on function process_return(uuid,jsonb) from public,anon;
grant execute on function process_return(uuid,jsonb) to authenticated;
commit;
