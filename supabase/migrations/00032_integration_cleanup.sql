begin;
create or replace function cleanup_shopify_identity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.provider<>'shopify' then return null; end if;
 if tg_op='DELETE' then
  delete from shopify_identity_links where tenant_id=old.tenant_id and shop_domain=old.shop_domain;
  delete from shopify_link_challenges where shop_domain=old.shop_domain;
  delete from shopify_inventory_mappings where tenant_id=old.tenant_id;
  delete from integration_jobs where tenant_id=old.tenant_id and provider='shopify';
 elsif not new.connected or new.shop_domain is distinct from old.shop_domain then
  delete from shopify_identity_links where tenant_id=old.tenant_id and shop_domain=old.shop_domain;
  delete from shopify_link_challenges where shop_domain=old.shop_domain;
  delete from integration_jobs where tenant_id=old.tenant_id and provider='shopify';
  if new.shop_domain is distinct from old.shop_domain then delete from shopify_inventory_mappings where tenant_id=old.tenant_id;
  else update shopify_inventory_mappings set publish_enabled=false where tenant_id=old.tenant_id;end if;
 end if;return null;
end $$;
create trigger integration_identity_delete after delete on integration_credentials for each row execute function cleanup_shopify_identity();
create or replace function disconnect_shopify(p_tenant_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform 1 from tenants where id=p_tenant_id for update;
 update integration_credentials set connected=false,encrypted_token=null,updated_at=now() where tenant_id=p_tenant_id and provider='shopify';
 update tenants set settings=jsonb_set(coalesce(settings,'{}'),'{shopify}',coalesce(settings->'shopify','{}')||'{"connected":false,"auto_sync_orders":false,"auto_sync_inventory":false}'::jsonb) where id=p_tenant_id;
end $$;
commit;
