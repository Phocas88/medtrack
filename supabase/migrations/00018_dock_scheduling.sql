begin;
create table dock_appointments (
  id uuid primary key default uuid_generate_v4(),tenant_id uuid not null references tenants(id) on delete cascade,
  date date not null,time_slot text not null check(time_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),dock_door text not null,
  type text not null check(type in ('inbound','outbound')),carrier_name text not null,reference text not null default '',notes text not null default '',
  status text not null default 'scheduled' check(status in ('scheduled','arrived','in_progress','completed','cancelled')),
  created_at timestamptz not null default now()
);
create unique index dock_slot_unique on dock_appointments(tenant_id,date,time_slot,dock_door) where status<>'cancelled';
alter table dock_appointments enable row level security;
create policy dock_manager on dock_appointments for all using(tenant_id=public.get_tenant_id() and public.get_user_role() in ('admin','manager')) with check(tenant_id=public.get_tenant_id() and public.get_user_role() in ('admin','manager'));
create trigger enforce_subscription_write before insert or update or delete on dock_appointments for each row execute function enforce_subscription_write();
create trigger enforce_tenant_relations before insert or update on dock_appointments for each row execute function enforce_tenant_relations();
commit;
