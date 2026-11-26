-- Forward-only hardening. Apply to a backed-up database after staging validation.
begin;

create table tenant_billing (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  plan text check (plan in ('starter','professional','enterprise')),
  status text not null default 'trialing',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  trial_ends_at timestamptz not null default now() + interval '14 days',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  event_created bigint not null default 0,
  updated_at timestamptz not null default now()
);
-- Preserve previously recorded provider identifiers, without granting clients write access.
insert into tenant_billing(tenant_id,plan,status,stripe_customer_id,stripe_subscription_id,stripe_price_id)
select id,
  case when settings->'billing'->>'plan' in ('starter','professional','enterprise') then settings->'billing'->>'plan' end,
  coalesce(settings->'billing'->>'status','trialing'),
  settings->'billing'->>'stripe_customer_id',settings->'billing'->>'stripe_subscription_id',settings->'billing'->>'stripe_price_id'
from tenants;

create table webhook_events (
  provider text not null,
  event_id text not null,
  tenant_id uuid references tenants(id) on delete cascade,
  processed_at timestamptz not null default now(),
  primary key(provider,event_id)
);
create table gdpr_requests (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid references tenants(id) on delete set null,
  shop_domain text not null,
  request_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table integration_credentials (
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  shop_domain text,
  encrypted_token text,
  connected boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(tenant_id,provider), unique(provider,shop_domain)
);
create table shipping_quotes (
  shipment_id text primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  rates jsonb not null,
  purchased jsonb,
  created_at timestamptz not null default now()
);

create table service_items (
  id uuid primary key default uuid_generate_v4(), tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, description text, default_price numeric(12,4) not null default 0 check(default_price >= 0),
  estimated_minutes integer check(estimated_minutes >= 0), is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table work_orders (
  id uuid primary key default uuid_generate_v4(), tenant_id uuid not null references tenants(id) on delete cascade,
  order_number text not null, customer_id uuid references customers(id), customer_name text,
  status text not null default 'draft' check(status in ('draft','scheduled','in_progress','completed','invoiced','cancelled')),
  priority integer not null default 5, description text, asset_info text, assigned_to uuid references users(id),
  scheduled_date date, started_at timestamptz, completed_at timestamptz,
  parts_total numeric(12,4) not null default 0, labor_total numeric(12,4) not null default 0,
  tax numeric(12,4) not null default 0, grand_total numeric(12,4) not null default 0,
  notes text, created_by uuid references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,order_number)
);
create table work_order_lines (
  id uuid primary key default uuid_generate_v4(), tenant_id uuid not null references tenants(id) on delete cascade,
  work_order_id uuid not null references work_orders(id) on delete cascade,
  line_type text not null check(line_type in ('part','service')), product_id uuid references products(id), service_id uuid references service_items(id),
  description text not null, quantity integer not null check(quantity > 0), unit_price numeric(12,4) not null check(unit_price >= 0),
  line_total numeric(12,4) not null, created_at timestamptz not null default now()
);
create table promotions (
  id uuid primary key default uuid_generate_v4(), tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id), name text not null,
  sale_price numeric(12,4) not null check(sale_price >= 0), original_price numeric(12,4) not null check(original_price >= 0),
  start_date date not null, end_date date not null, status text not null default 'scheduled' check(status in ('scheduled','active','ended','cancelled')),
  notes text, created_by uuid references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(end_date >= start_date)
);
alter table users add column if not exists access_level text not null default 'full' check(access_level in ('full','scanner_only'));
alter table products add column if not exists image_url text;
alter table products add column if not exists aisle text;
alter table products add column if not exists section text;
alter table sales_orders add column if not exists ship_to_name text;
alter table sales_orders add column if not exists ship_to_address text;
alter table sales_orders add column if not exists tracking_number text;
alter table sales_orders add column if not exists carrier text;
alter table sales_orders add column if not exists shipping_label_url text;
alter table sales_orders add column if not exists shipping_rate numeric(12,4);
alter table sales_orders add column if not exists fulfillment_type text default 'warehouse';
alter table product_uom_conversions alter column conversion_factor type numeric(12,4);
-- Administrative audit entries are not inventory changes and need no product.
alter table stock_movements alter column product_id drop not null;
alter table stock_movements add constraint movement_product_required check(product_id is not null or quantity = 0) not valid;
alter table lots add constraint lot_quantity_nonnegative check(quantity_on_hand >= 0) not valid;
alter table bin_inventory add constraint bin_quantity_nonnegative check(quantity >= 0) not valid;

create or replace function public.get_tenant_id() returns uuid
language sql security definer stable set search_path = public, pg_temp as $$
  select tenant_id from public.users where id=auth.uid() and is_active=true
$$;
create or replace function public.get_user_role() returns user_role
language sql security definer stable set search_path = public, pg_temp as $$
  select role from public.users where id=auth.uid() and is_active=true
$$;

-- Remove role escalation through the old manager policy.
drop policy if exists admin_manage_users on users;
create policy admin_manage_users on users for all
using(tenant_id=public.get_tenant_id() and public.get_user_role()='admin')
with check(tenant_id=public.get_tenant_id() and public.get_user_role()='admin');
create policy profile_self_update on users for update using(id=auth.uid() and is_active=true) with check(id=auth.uid());
create function protect_user_privileges() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('authenticated','anon') then
    if new.tenant_id is distinct from old.tenant_id or new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception 'Identity changes require server administration';
    end if;
    if public.get_user_role() is distinct from 'admin'::user_role and
      (new.role is distinct from old.role or new.is_active is distinct from old.is_active or new.access_level is distinct from old.access_level) then
      raise exception 'Administrator required';
    end if;
    if old.id=auth.uid() and (not new.is_active or new.role is distinct from old.role) then
      raise exception 'Administrators cannot disable or demote themselves';
    end if;
  end if;
  return new;
end $$;
create trigger protect_user_privileges before update on users for each row execute function protect_user_privileges();

drop policy if exists tenant_isolation on tenants;
create policy tenant_read on tenants for select using(id=public.get_tenant_id());
create policy tenant_admin_update on tenants for update using(id=public.get_tenant_id() and public.get_user_role()='admin') with check(id=public.get_tenant_id());
create function protect_tenant_settings() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('authenticated','anon') then
    if new.id is distinct from old.id or new.slug is distinct from old.slug then raise exception 'Tenant identity is immutable'; end if;
    if (new.settings - array['logo_url','timezone','date_format','currency','industry','address','enabled_modules','preset','onboarding_completed','sales_tax_rate'])
       is distinct from (old.settings - array['logo_url','timezone','date_format','currency','industry','address','enabled_modules','preset','onboarding_completed','sales_tax_rate']) then
      raise exception 'Integration and billing settings require a server operation';
    end if;
  end if;
  return new;
end $$;
create trigger protect_tenant_settings before update on tenants for each row execute function protect_tenant_settings();

create function update_tenant_settings(p_patch jsonb,p_name text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if public.get_user_role() is distinct from 'admin'::user_role then raise exception 'Administrator required'; end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in
    ('logo_url','timezone','date_format','currency','industry','address','enabled_modules','preset','onboarding_completed','sales_tax_rate')) then
    raise exception 'Unsupported settings';
  end if;
  if p_patch ? 'sales_tax_rate' and ((p_patch->>'sales_tax_rate')::numeric<0 or (p_patch->>'sales_tax_rate')::numeric>1) then raise exception 'Invalid tax rate'; end if;
  update tenants set name=coalesce(nullif(trim(p_name),''),name),settings=coalesce(settings,'{}')||p_patch where id=public.get_tenant_id();
end $$;

create function bootstrap_tenant(p_name text,p_full_name text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; identity_email text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  select tenant_id into tid from users where id=auth.uid();
  if tid is not null then return tid; end if;
  select email into identity_email from auth.users where id=auth.uid();
  if identity_email is null or length(trim(p_name))<2 or length(trim(p_full_name))<2 then raise exception 'Invalid signup'; end if;
  insert into tenants(name,slug) values(left(trim(p_name),200),'tenant-'||uuid_generate_v4()::text) returning id into tid;
  insert into users(id,tenant_id,email,full_name,role) values(auth.uid(),tid,identity_email,left(trim(p_full_name),200),'admin');
  insert into tenant_billing(tenant_id) values(tid);
  return tid;
end $$;
create function provision_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; company text;
begin
  company:=nullif(trim(new.raw_user_meta_data->>'company_name'),'');
  if company is null then return new; end if;
  insert into tenants(name,slug) values(left(company,200),'tenant-'||new.id::text) returning id into tid;
  insert into users(id,tenant_id,email,full_name,role) values(new.id,tid,new.email,left(coalesce(new.raw_user_meta_data->>'full_name',company),200),'admin');
  insert into tenant_billing(tenant_id) values(tid);
  return new;
end $$;
create trigger provision_signup after insert on auth.users for each row execute function provision_signup();

-- Reject cross-tenant references even on writes using a service role.
create function enforce_tenant_relations() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare ref record; key_value text; parent_tenant uuid;
begin
  for ref in select a.attname child_column,c.confrelid::regclass parent,b.attname parent_column
    from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
    join pg_attribute b on b.attrelid=c.confrelid and b.attnum=c.confkey[1]
    where c.conrelid=TG_RELID and c.contype='f' and array_length(c.conkey,1)=1
      and exists(select 1 from pg_attribute t where t.attrelid=c.confrelid and t.attname='tenant_id' and not t.attisdropped)
  loop
    key_value:=to_jsonb(new)->>ref.child_column;
    if key_value is null then continue; end if;
    execute format('select tenant_id from %s where %I=$1::uuid',ref.parent,ref.parent_column) into parent_tenant using key_value;
    if parent_tenant is distinct from new.tenant_id then raise exception 'Related record belongs to another tenant'; end if;
  end loop;
  if TG_OP='UPDATE' and new.tenant_id is distinct from old.tenant_id then raise exception 'Tenant is immutable'; end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['tenant_billing','webhook_events','gdpr_requests','integration_credentials','shipping_quotes','service_items','work_orders','work_order_lines','promotions'] loop
    execute format('alter table %I enable row level security',t);
  end loop;
  foreach t in array array['service_items','work_orders','work_order_lines','promotions'] loop
    execute format('create policy tenant_read on %I for select using(tenant_id=public.get_tenant_id())',t);
    execute format('create policy manager_write on %I for all using(tenant_id=public.get_tenant_id() and public.get_user_role() in (''admin'',''manager'')) with check(tenant_id=public.get_tenant_id() and public.get_user_role() in (''admin'',''manager''))',t);
  end loop;
  for t in select table_name from information_schema.columns where table_schema='public' and column_name='tenant_id' and table_name not in ('product_stock_summary','expiring_lots') loop
    if exists(select 1 from pg_class where oid=('public.'||t)::regclass and relkind='r') then
      execute format('create trigger enforce_tenant_relations before insert or update on %I for each row execute function enforce_tenant_relations()',t);
    end if;
  end loop;
end $$;
create policy billing_read on tenant_billing for select using(tenant_id=public.get_tenant_id() and public.get_user_role()='admin');

-- Subscription processing and deduplication commit together. A failed transaction can be retried.
create function apply_billing_event(p_event_id text,p_created bigint,p_tenant_id uuid,p_billing jsonb) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from webhook_events where provider='stripe' and event_id=p_event_id) then return false; end if;
  perform 1 from tenants where id=p_tenant_id for update;
  if not found then raise exception 'Unknown billing tenant'; end if;
  if exists(select 1 from tenant_billing where tenant_id=p_tenant_id and stripe_customer_id is not null and stripe_customer_id is distinct from p_billing->>'stripe_customer_id') then
    raise exception 'Billing customer mismatch';
  end if;
  insert into tenant_billing(tenant_id,plan,status,stripe_customer_id,stripe_subscription_id,stripe_price_id,event_created,cancel_at_period_end,current_period_end)
  values(p_tenant_id,p_billing->>'plan',p_billing->>'status',p_billing->>'stripe_customer_id',p_billing->>'stripe_subscription_id',p_billing->>'stripe_price_id',p_created,coalesce((p_billing->>'cancel_at_period_end')::boolean,false),(p_billing->>'current_period_end')::timestamptz)
  on conflict(tenant_id) do update set plan=excluded.plan,status=excluded.status,stripe_customer_id=excluded.stripe_customer_id,
    stripe_subscription_id=excluded.stripe_subscription_id,stripe_price_id=excluded.stripe_price_id,event_created=excluded.event_created,
    cancel_at_period_end=excluded.cancel_at_period_end,current_period_end=excluded.current_period_end,updated_at=now()
    where tenant_billing.event_created<=excluded.event_created;
  insert into webhook_events(provider,event_id,tenant_id) values('stripe',p_event_id,p_tenant_id);
  return true;
end $$;

revoke all on function apply_billing_event(text,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function apply_billing_event(text,bigint,uuid,jsonb) to service_role;
revoke all on function bootstrap_tenant(text,text),update_tenant_settings(jsonb,text) from public,anon;
grant execute on function bootstrap_tenant(text,text),update_tenant_settings(jsonb,text) to authenticated;
revoke all on tenant_billing,webhook_events,gdpr_requests,integration_credentials,shipping_quotes from anon,authenticated;
grant select on tenant_billing to authenticated;
grant all on tenant_billing,webhook_events,gdpr_requests,integration_credentials,shipping_quotes to service_role;
alter view product_stock_summary set(security_invoker=true);
alter view expiring_lots set(security_invoker=true);
commit;
