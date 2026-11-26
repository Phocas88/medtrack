begin;
create table shopify_identity_links (
 shop_domain text not null, shopify_user_id text not null, tenant_id uuid not null references tenants(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade, primary key(shop_domain,shopify_user_id)
);
create table shopify_link_challenges (
 challenge_hash text primary key, shop_domain text not null, shopify_user_id text not null,
 expires_at timestamptz not null default now()+interval '5 minutes'
);
alter table shopify_identity_links enable row level security;
alter table shopify_link_challenges enable row level security;
revoke all on shopify_identity_links,shopify_link_challenges from public,anon,authenticated;
grant all on shopify_identity_links,shopify_link_challenges to service_role;
create function link_shopify_identity(p_challenge text) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare challenge shopify_link_challenges; tid uuid;
begin
 tid:=get_tenant_id();if tid is null or get_user_role() not in ('admin','manager') then raise exception 'Manager account required'; end if;
 select * into challenge from shopify_link_challenges where challenge_hash=p_challenge and expires_at>now() for update;
 if not found then raise exception 'Link expired. Return to Shopify and try again'; end if;
 if not exists(select 1 from integration_credentials where tenant_id=tid and provider='shopify' and shop_domain=challenge.shop_domain and connected) then raise exception 'This store belongs to another warehouse or is disconnected'; end if;
 if exists(select 1 from shopify_identity_links where shop_domain=challenge.shop_domain and shopify_user_id=challenge.shopify_user_id and (tenant_id<>tid or user_id<>auth.uid())) then raise exception 'This Shopify identity is already linked to another warehouse account'; end if;
 insert into shopify_identity_links values(challenge.shop_domain,challenge.shopify_user_id,tid,auth.uid()) on conflict do nothing;
 delete from shopify_link_challenges where challenge_hash=p_challenge;
 delete from shopify_link_challenges where expires_at<now();
 return challenge.shop_domain;
end $$;
revoke all on function link_shopify_identity(text) from public,anon;
grant execute on function link_shopify_identity(text) to authenticated;
-- Revocation removes embedded identities as well as API credentials.
create function cleanup_shopify_identity() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.provider='shopify' and (not new.connected or new.shop_domain is distinct from old.shop_domain) then
  delete from shopify_identity_links where tenant_id=old.tenant_id and shop_domain=old.shop_domain;
  delete from shopify_link_challenges where shop_domain=old.shop_domain;
 end if;return new;
end $$;
create trigger integration_identity_cleanup after update on integration_credentials for each row execute function cleanup_shopify_identity();
commit;
