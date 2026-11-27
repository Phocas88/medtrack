begin;

alter table public.prelaunch_registrations add column organization_profile jsonb not null default '{}'::jsonb;

create or replace function public.bootstrap_tenant(p_name text,p_full_name text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; identity_email text; pending public.prelaunch_registrations;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select tenant_id into tid from users where id=auth.uid();
  if tid is not null then return tid; end if;
  if (select signup_open from public.prelaunch_settings where singleton) is distinct from true then
    raise exception 'Warehouse access is paused until launch';
  end if;
  select * into pending from public.prelaunch_registrations where user_id=auth.uid();
  if found then
    p_name:=pending.company_name;
    p_full_name:=pending.full_name;
  end if;
  select email into identity_email from auth.users where id=auth.uid();
  if identity_email is null or length(trim(p_name))<2 or length(trim(p_full_name))<2 then raise exception 'Invalid signup'; end if;
  insert into tenants(name,slug,settings) values(left(trim(p_name),200),'tenant-'||uuid_generate_v4()::text,coalesce(pending.organization_profile,'{}'::jsonb)) returning id into tid;
  insert into users(id,tenant_id,email,full_name,role) values(auth.uid(),tid,identity_email,left(trim(p_full_name),200),'admin');
  insert into tenant_billing(tenant_id) values(tid);
  delete from public.prelaunch_registrations where user_id=auth.uid();
  return tid;
end $$;
create or replace function public.provision_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; company text; profile jsonb;
begin
  company:=nullif(trim(new.raw_user_meta_data->>'company_name'),'');
  if company is null then return new; end if;
  profile := jsonb_strip_nulls(jsonb_build_object(
    'address', nullif(left(trim(new.raw_user_meta_data#>>'{organization_profile,address}'),600),''),
    'business_phone', nullif(left(trim(new.raw_user_meta_data#>>'{organization_profile,business_phone}'),40),'')
  ));
  if (select signup_open from public.prelaunch_settings where singleton) is distinct from true then
    insert into public.prelaunch_registrations(user_id,company_name,full_name,organization_profile)
    values(new.id,left(company,200),left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),company),200),profile);
    return new;
  end if;
  insert into tenants(name,slug,settings) values(left(company,200),'tenant-'||new.id::text,profile) returning id into tid;
  insert into users(id,tenant_id,email,full_name,role) values(new.id,tid,new.email,left(coalesce(new.raw_user_meta_data->>'full_name',company),200),'admin');
  insert into tenant_billing(tenant_id) values(tid);
  return new;
end $$;

create or replace function protect_tenant_settings() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('authenticated','anon') then
    if new.id is distinct from old.id or new.slug is distinct from old.slug then raise exception 'Tenant identity is immutable'; end if;
    if (new.settings - array['logo_url','timezone','date_format','currency','industry','address','business_phone','enabled_modules','preset','onboarding_completed','sales_tax_rate'])
       is distinct from (old.settings - array['logo_url','timezone','date_format','currency','industry','address','business_phone','enabled_modules','preset','onboarding_completed','sales_tax_rate']) then
      raise exception 'Integration and billing settings require a server operation';
    end if;
  end if;
  return new;
end $$;

create or replace function update_tenant_settings(p_patch jsonb,p_name text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if public.get_user_role() is distinct from 'admin'::user_role then raise exception 'Administrator required'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in
    ('logo_url','timezone','date_format','currency','industry','address','business_phone','enabled_modules','preset','onboarding_completed','sales_tax_rate')) then
    raise exception 'Unsupported settings';
  end if;
  if (p_patch ? 'address' and (jsonb_typeof(p_patch->'address') is distinct from 'string' or length(p_patch->>'address')>600))
    or (p_patch ? 'business_phone' and (jsonb_typeof(p_patch->'business_phone') is distinct from 'string' or length(p_patch->>'business_phone')>40))
    then raise exception 'Invalid business contact details'; end if;
  if p_patch ? 'sales_tax_rate' and ((p_patch->>'sales_tax_rate')::numeric<0 or (p_patch->>'sales_tax_rate')::numeric>1) then raise exception 'Invalid tax rate'; end if;
  update tenants set name=coalesce(nullif(trim(p_name),''),name),settings=coalesce(settings,'{}')||p_patch where id=public.get_tenant_id();
end $$;


commit;
