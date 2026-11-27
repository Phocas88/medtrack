begin;

-- Auth keeps the verified email and password. The workspace is created only after opening.
create table public.prelaunch_settings (
  singleton boolean primary key default true check (singleton),
  signup_open boolean not null default false
);
insert into public.prelaunch_settings default values;

create table public.prelaunch_registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_name text not null,
  full_name text not null,
  created_at timestamptz not null default now()
);
alter table public.prelaunch_settings enable row level security;
alter table public.prelaunch_registrations enable row level security;
revoke all on public.prelaunch_settings, public.prelaunch_registrations from public, anon, authenticated;

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
  insert into tenants(name,slug) values(left(trim(p_name),200),'tenant-'||uuid_generate_v4()::text) returning id into tid;
  insert into users(id,tenant_id,email,full_name,role) values(auth.uid(),tid,identity_email,left(trim(p_full_name),200),'admin');
  insert into tenant_billing(tenant_id) values(tid);
  delete from public.prelaunch_registrations where user_id=auth.uid();
  return tid;
end $$;
create or replace function public.provision_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; company text;
begin
  company:=nullif(trim(new.raw_user_meta_data->>'company_name'),'');
  if company is null then return new; end if;
  if (select signup_open from public.prelaunch_settings where singleton) is distinct from true then
    insert into public.prelaunch_registrations(user_id,company_name,full_name)
    values(new.id,left(company,200),left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),company),200));
    return new;
  end if;
  insert into tenants(name,slug) values(left(company,200),'tenant-'||new.id::text) returning id into tid;
  insert into users(id,tenant_id,email,full_name,role) values(new.id,tid,new.email,left(coalesce(new.raw_user_meta_data->>'full_name',company),200),'admin');
  insert into tenant_billing(tenant_id) values(tid);
  return new;
end $$;

create function public.prelaunch_status() returns text
language sql stable security definer set search_path=public,pg_temp as $$
  select case when exists(select 1 from public.prelaunch_registrations where user_id=auth.uid())
    then case when (select signup_open from public.prelaunch_settings where singleton) then 'open' else 'paused' end
    else 'none' end
$$;
revoke all on function public.prelaunch_status() from public,anon,authenticated;
grant execute on function public.prelaunch_status() to authenticated;

commit;
