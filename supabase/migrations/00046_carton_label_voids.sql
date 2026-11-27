begin;
alter table public.shipping_quotes
  add column void_state text check (void_state in ('checking','submitted','refunded','rejected','not_applicable')),
  add column void_requested_at timestamptz,
  add column void_lease_until timestamptz,
  add column void_lease_token uuid;
alter table public.shipping_quotes drop constraint shipping_quotes_purchase_state_check;
alter table public.shipping_quotes add constraint shipping_quotes_purchase_state_check
  check (purchase_state in ('quoted','buying','uncertain','purchased','voided'));

create function public.claim_carton_void(p_tenant uuid, p_shipment text, p_submit boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes; token uuid; should_submit boolean;
begin
  select * into q from shipping_quotes where tenant_id=p_tenant and shipment_id=p_shipment
    and carton_id is not null for update;
  if not found or q.purchase_state not in ('purchased','voided') then raise exception 'Carton label not found'; end if;
  if q.void_state in ('refunded','rejected','not_applicable') then return jsonb_build_object('status',q.void_state); end if;
  if q.void_lease_until>now() then return jsonb_build_object('status','busy'); end if;
  should_submit := coalesce(p_submit,false) and q.void_requested_at is null;
  if q.void_requested_at is null and not should_submit then raise exception 'No void request exists'; end if;
  token := gen_random_uuid();
  update shipping_quotes set void_state=coalesce(void_state,'checking'),
    void_requested_at=coalesce(void_requested_at,now()), void_lease_until=now()+interval '90 seconds',void_lease_token=token
    where shipment_id=p_shipment and tenant_id=p_tenant;
  return jsonb_build_object('submit',should_submit,'token',token);
end $$;

create function public.finish_carton_void(p_tenant uuid,p_shipment text,p_token uuid,p_status text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare q shipping_quotes;
begin
  if p_status is null or p_status not in ('checking','submitted','refunded','rejected','not_applicable') then raise exception 'Unknown provider status'; end if;
  select * into q from shipping_quotes where tenant_id=p_tenant and shipment_id=p_shipment
    and carton_id is not null and purchase_state='purchased' for update;
  if not found or p_token is null or q.void_lease_token is distinct from p_token then raise exception 'Void request lease expired'; end if;
  if p_status='refunded' then
    update shipment_cartons set tracking_number='',delivery_status=null,tracking_updated_at=null
      where id=q.carton_id and tenant_id=p_tenant and tracking_number=q.purchased->>'tracking_code';
    if not found then raise exception 'Carton tracking changed; reconcile this label'; end if;
  end if;
  update shipping_quotes set void_state=p_status, void_lease_until=null, void_lease_token=null,
    purchase_state=case when p_status='refunded' then 'voided' else purchase_state end
    where shipment_id=p_shipment and tenant_id=p_tenant;
end $$;

revoke all on function public.claim_carton_void(uuid,text,boolean),public.finish_carton_void(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_carton_void(uuid,text,boolean),public.finish_carton_void(uuid,text,uuid,text) to service_role;
commit;
