begin;
create function assemble_kit(p_request_id uuid,p_kit_id uuid,p_quantity integer,p_notes text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; result jsonb; kit kits; comp kit_components; lot lots; qty integer; remaining integer; consumed integer; total_cost numeric:=0;
  expiry date; aid uuid; lotid uuid; lotnum text; b bin_inventory; bin_remaining integer;
begin
  tid:=require_inventory_access();
  if public.get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Positive assembly quantity required'; end if;
  perform pg_advisory_xact_lock(hashtext(tid::text||p_request_id::text));
  select o.result into result from inventory_operations o where tenant_id=tid and request_id=p_request_id and operation='assemble-kit';
  if result is not null then return result; end if;
  select * into kit from kits where id=p_kit_id and tenant_id=tid and is_active for update;
  if not found then raise exception 'Kit not found'; end if;
  if not exists(select 1 from kit_components where kit_id=kit.id and tenant_id=tid) then raise exception 'Kit needs components'; end if;
  if exists(select 1 from products where id=kit.product_id and is_serial_tracked) then raise exception 'Serialized kit output requires serial capture'; end if;
  lotnum:='KIT-'||p_request_id::text;
  insert into kit_assemblies(tenant_id,kit_id,quantity_assembled,assembled_by,lot_number,notes)
    values(tid,kit.id,p_quantity,auth.uid(),lotnum,p_notes) returning id into aid;
  for comp in select * from kit_components where kit_id=kit.id and tenant_id=tid order by component_product_id for update loop
    if comp.quantity<=0 or comp.component_product_id=kit.product_id then raise exception 'Invalid kit component'; end if;
    if exists(select 1 from products where id=comp.component_product_id and is_serial_tracked) then raise exception 'Serialized components require serial capture'; end if;
    remaining:=comp.quantity*p_quantity;
    for lot in select l.* from lots l where l.tenant_id=tid and l.product_id=comp.component_product_id and l.status='active' and l.quantity_on_hand>0
      and (l.expiration_date is null or l.expiration_date>=current_date)
      and not exists(select 1 from quarantine_holds h where h.lot_id=l.id and h.status in ('held','rejected'))
      order by l.expiration_date nulls last,l.received_date,l.id for update loop
      exit when remaining=0;
      consumed:=least(remaining,lot.quantity_on_hand);
      update lots set quantity_on_hand=quantity_on_hand-consumed,status=case when quantity_on_hand=consumed then 'depleted'::lot_status else status end where id=lot.id;
      total_cost:=total_cost+consumed*lot.cost_at_receipt;
      if lot.expiration_date is not null then expiry:=least(expiry,lot.expiration_date); end if;
      insert into kit_assembly_lots(tenant_id,assembly_id,component_product_id,lot_id,quantity_used) values(tid,aid,comp.component_product_id,lot.id,consumed);
      insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
      values(tid,comp.component_product_id,lot.id,auth.uid(),-consumed,'adjust','Kit component consumed',lotnum);
      bin_remaining:=consumed;
      for b in select * from bin_inventory where tenant_id=tid and lot_id=lot.id order by id for update loop
        exit when bin_remaining=0;
        update bin_inventory set quantity=quantity-least(quantity,bin_remaining) where id=b.id;
        bin_remaining:=bin_remaining-least(b.quantity,bin_remaining);
      end loop;
      remaining:=remaining-consumed;
    end loop;
    if remaining<>0 then raise exception 'Insufficient available component stock'; end if;
  end loop;
  insert into lots(tenant_id,product_id,lot_number,quantity_on_hand,cost_at_receipt,expiration_date)
    values(tid,kit.product_id,lotnum,p_quantity,total_cost/p_quantity,expiry) returning id into lotid;
  insert into stock_movements(tenant_id,product_id,lot_id,user_id,quantity,movement_type,reason,reference_number)
    values(tid,kit.product_id,lotid,auth.uid(),p_quantity,'adjust','Kit assembled',lotnum);
  result:=jsonb_build_object('assembly_id',aid,'lot_id',lotid,'lot_number',lotnum);
  insert into inventory_operations values(tid,p_request_id,'assemble-kit',result,now());
  return result;
end $$;
revoke all on function assemble_kit(uuid,uuid,integer,text) from public,anon;
grant execute on function assemble_kit(uuid,uuid,integer,text) to authenticated;
commit;
