begin;

create function public.receive_pack_units(p_request uuid,p_receipt jsonb,p_bin uuid,p_conversion uuid,p_expected_factor numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; units numeric; factor numeric; pack_count integer; receipt jsonb;
begin
  tid:=public.require_warehouse_manager();
  if p_request is null or jsonb_typeof(p_receipt) is distinct from 'object' then raise exception 'Receipt information required'; end if;
  select conversion_factor into factor from product_uom_conversions
    where id=p_conversion and tenant_id=tid and product_id=(p_receipt->>'product_id')::uuid and is_orderable for share;
  if not found or factor<=0 or factor is distinct from p_expected_factor then
    raise exception 'The receiving unit has changed. Refresh and confirm the conversion';
  end if;
  pack_count:=(p_receipt->>'quantity')::integer;
  units:=pack_count*factor;
  if pack_count is null or pack_count<1 or units<>trunc(units) or units>2147483647 then
    raise exception 'The pack count must convert to a positive whole number of stock units';
  end if;
  receipt:=p_receipt||jsonb_build_object('quantity',units::integer,'package_quantity',pack_count,'conversion_id',p_conversion,'conversion_factor',factor);
  if p_bin is not null then
    return public.receive_inventory_to_bin(p_request,receipt,p_bin);
  end if;
  return public.receive_inventory(p_request,receipt);
end $$;

revoke all on function public.receive_pack_units(uuid,jsonb,uuid,uuid,numeric) from public,anon,authenticated;
grant execute on function public.receive_pack_units(uuid,jsonb,uuid,uuid,numeric) to authenticated;
commit;
