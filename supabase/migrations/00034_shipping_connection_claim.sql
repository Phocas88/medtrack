begin;
create function claim_shipping_connection(p_tenant uuid) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare token uuid; c integration_credentials;
begin
 perform 1 from tenants where id=p_tenant for update;if not found then raise exception 'Tenant not found';end if;
 insert into integration_credentials(tenant_id,provider,connected) values(p_tenant,'easypost',false) on conflict(tenant_id,provider) do nothing;
 select * into c from integration_credentials where tenant_id=p_tenant and provider='easypost' for update;
 if c.connected then raise exception 'Shipping account is already connected';end if;
 if c.refresh_until>now() then return null;end if;
 token:=gen_random_uuid();update integration_credentials set refresh_lease=token,refresh_until=now()+interval '90 seconds' where tenant_id=p_tenant and provider='easypost';return token;
end $$;
revoke all on function claim_shipping_connection(uuid) from public,anon,authenticated;
grant execute on function claim_shipping_connection(uuid) to service_role;
commit;
