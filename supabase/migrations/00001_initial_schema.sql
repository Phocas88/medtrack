-- MedTrack Inventory Management System
-- Initial Schema Migration
-- All tables include tenant_id for multi-tenancy with RLS

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('admin', 'manager', 'staff');
create type storage_requirement as enum ('room_temp', 'refrigerated', 'frozen');
create type movement_type as enum ('receive', 'ship', 'adjust', 'return', 'expire', 'recall');
create type order_status as enum ('draft', 'confirmed', 'picking', 'shipped', 'cancelled');
create type lot_status as enum ('active', 'expired', 'recalled', 'depleted');

-- ============================================================
-- TENANTS
-- ============================================================
create table tenants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- USERS (extends Supabase Auth)
-- ============================================================
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  full_name text not null,
  role user_role not null default 'staff',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_users_tenant on users(tenant_id);

-- ============================================================
-- PRODUCTS
-- ============================================================
create table products (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sku text not null,
  manufacturer text,
  category text,
  supplier_id uuid, -- references suppliers, added after suppliers table
  unit_of_measure text not null default 'each',
  cost numeric(12,4) default 0,
  price numeric(12,4) default 0,
  low_stock_threshold integer default 10,
  storage_requirement storage_requirement default 'room_temp',
  is_lot_tracked boolean default true,
  is_serial_tracked boolean default false,
  expiry_alert_days integer default 90,
  notes text,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, sku)
);

create index idx_products_tenant on products(tenant_id);
create index idx_products_sku on products(tenant_id, sku);
create index idx_products_category on products(tenant_id, category);

-- ============================================================
-- SUPPLIERS
-- ============================================================
create table suppliers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  account_number text,
  notes text,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_suppliers_tenant on suppliers(tenant_id);

-- Add FK from products to suppliers
alter table products
  add constraint fk_products_supplier
  foreign key (supplier_id) references suppliers(id) on delete set null;

-- ============================================================
-- CUSTOMERS
-- ============================================================
create table customers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  contact_name text,
  email text,
  phone text,
  ship_to_address text,
  license_type text,
  license_number text,
  license_expiration date,
  notes text,
  is_archived boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_customers_tenant on customers(tenant_id);
create index idx_customers_license_exp on customers(tenant_id, license_expiration);

-- ============================================================
-- LOTS
-- ============================================================
create table lots (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  lot_number text not null,
  expiration_date date,
  quantity_on_hand integer not null default 0,
  received_date date not null default current_date,
  supplier_id uuid references suppliers(id) on delete set null,
  cost_at_receipt numeric(12,4) default 0,
  location text, -- bin/shelf location
  status lot_status default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, product_id, lot_number)
);

create index idx_lots_tenant on lots(tenant_id);
create index idx_lots_product on lots(tenant_id, product_id);
create index idx_lots_expiration on lots(tenant_id, expiration_date);
create index idx_lots_status on lots(tenant_id, status);

-- ============================================================
-- SERIAL NUMBERS
-- ============================================================
create table serial_numbers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lot_id uuid not null references lots(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  serial_number text not null,
  is_shipped boolean default false,
  shipped_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  unique(tenant_id, product_id, serial_number)
);

create index idx_serial_numbers_lot on serial_numbers(lot_id);
create index idx_serial_numbers_product on serial_numbers(tenant_id, product_id);

-- ============================================================
-- STOCK MOVEMENTS (append-only audit trail)
-- ============================================================
create table stock_movements (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  lot_id uuid references lots(id) on delete set null,
  user_id uuid not null references users(id),
  quantity integer not null, -- positive for inbound, negative for outbound
  movement_type movement_type not null,
  reason text,
  reference_number text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_movements_tenant on stock_movements(tenant_id);
create index idx_movements_product on stock_movements(tenant_id, product_id);
create index idx_movements_lot on stock_movements(lot_id);
create index idx_movements_user on stock_movements(user_id);
create index idx_movements_type on stock_movements(tenant_id, movement_type);
create index idx_movements_created on stock_movements(tenant_id, created_at desc);

-- Prevent updates and deletes on stock_movements
create or replace function prevent_movement_mutation()
returns trigger as $$
begin
  raise exception 'Stock movements are immutable. Cannot % records.', TG_OP;
  return null;
end;
$$ language plpgsql;

create trigger trg_prevent_movement_update
  before update on stock_movements
  for each row execute function prevent_movement_mutation();

create trigger trg_prevent_movement_delete
  before delete on stock_movements
  for each row execute function prevent_movement_mutation();

-- ============================================================
-- SALES ORDERS
-- ============================================================
create table sales_orders (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_number text not null,
  customer_id uuid not null references customers(id) on delete cascade,
  status order_status default 'draft',
  ship_date date,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, order_number)
);

create index idx_orders_tenant on sales_orders(tenant_id);
create index idx_orders_customer on sales_orders(tenant_id, customer_id);
create index idx_orders_status on sales_orders(tenant_id, status);

-- ============================================================
-- SALES ORDER LINES
-- ============================================================
create table sales_order_lines (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  quantity_ordered integer not null,
  quantity_shipped integer default 0,
  unit_price numeric(12,4) default 0,
  created_at timestamptz default now()
);

create index idx_order_lines_order on sales_order_lines(order_id);

-- ============================================================
-- SHIPMENTS
-- ============================================================
create table shipments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  order_id uuid not null references sales_orders(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  shipped_by uuid references users(id),
  shipped_at timestamptz default now(),
  tracking_number text,
  notes text,
  created_at timestamptz default now()
);

create index idx_shipments_tenant on shipments(tenant_id);
create index idx_shipments_order on shipments(order_id);
create index idx_shipments_customer on shipments(tenant_id, customer_id);

-- ============================================================
-- SHIPMENT LINES (links shipment to specific lots/serials)
-- ============================================================
create table shipment_lines (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  shipment_id uuid not null references shipments(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  lot_id uuid references lots(id) on delete set null,
  serial_number_id uuid references serial_numbers(id) on delete set null,
  quantity integer not null,
  created_at timestamptz default now()
);

create index idx_shipment_lines_shipment on shipment_lines(shipment_id);
create index idx_shipment_lines_lot on shipment_lines(lot_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Helper function: get current user's tenant_id
create or replace function public.get_tenant_id()
returns uuid as $$
  select tenant_id from public.users where id = auth.uid()
$$ language sql security definer stable;

-- Helper function: get current user's role
create or replace function public.get_user_role()
returns user_role as $$
  select role from public.users where id = auth.uid()
$$ language sql security definer stable;

-- Enable RLS on all tables
alter table tenants enable row level security;
alter table users enable row level security;
alter table products enable row level security;
alter table suppliers enable row level security;
alter table customers enable row level security;
alter table lots enable row level security;
alter table serial_numbers enable row level security;
alter table stock_movements enable row level security;
alter table sales_orders enable row level security;
alter table sales_order_lines enable row level security;
alter table shipments enable row level security;
alter table shipment_lines enable row level security;

-- TENANTS: users can only see their own tenant
create policy "tenant_isolation" on tenants
  for all using (id = public.get_tenant_id());

-- USERS: users can see others in their tenant
create policy "tenant_isolation" on users
  for select using (tenant_id = public.get_tenant_id());

create policy "admin_manage_users" on users
  for all using (
    tenant_id = public.get_tenant_id()
    and public.get_user_role() in ('admin', 'manager')
  );

-- Generic tenant isolation policies for all data tables
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'products', 'suppliers', 'customers', 'lots', 'serial_numbers',
    'stock_movements', 'sales_orders', 'sales_order_lines',
    'shipments', 'shipment_lines'
  ]) loop
    execute format(
      'create policy "tenant_select" on %I for select using (tenant_id = public.get_tenant_id())',
      tbl
    );
    execute format(
      'create policy "tenant_insert" on %I for insert with check (tenant_id = public.get_tenant_id())',
      tbl
    );
    execute format(
      'create policy "tenant_update" on %I for update using (tenant_id = public.get_tenant_id())',
      tbl
    );
    execute format(
      'create policy "tenant_delete" on %I for delete using (tenant_id = public.get_tenant_id())',
      tbl
    );
  end loop;
end $$;

-- Override: stock_movements cannot be updated/deleted (trigger handles this,
-- but belt-and-suspenders with RLS too)
drop policy if exists "tenant_update" on stock_movements;
drop policy if exists "tenant_delete" on stock_movements;

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply updated_at trigger to all mutable tables
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'tenants', 'users', 'products', 'suppliers', 'customers',
    'lots', 'sales_orders'
  ]) loop
    execute format(
      'create trigger trg_updated_at before update on %I for each row execute function update_updated_at()',
      tbl
    );
  end loop;
end $$;

-- ============================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================

-- Product stock summary (sum of all active lots)
create or replace view product_stock_summary as
select
  p.id as product_id,
  p.tenant_id,
  p.name,
  p.sku,
  p.low_stock_threshold,
  coalesce(sum(l.quantity_on_hand) filter (where l.status = 'active'), 0) as total_on_hand,
  count(l.id) filter (where l.status = 'active') as active_lot_count,
  min(l.expiration_date) filter (where l.status = 'active' and l.quantity_on_hand > 0) as nearest_expiration
from products p
left join lots l on l.product_id = p.id
where p.is_archived = false
group by p.id, p.tenant_id, p.name, p.sku, p.low_stock_threshold;

-- Expiring lots view
create or replace view expiring_lots as
select
  l.*,
  p.name as product_name,
  p.sku as product_sku,
  p.expiry_alert_days,
  l.expiration_date - current_date as days_until_expiry
from lots l
join products p on p.id = l.product_id
where l.status = 'active'
  and l.quantity_on_hand > 0
  and l.expiration_date is not null
  and l.expiration_date <= current_date + interval '90 days'
order by l.expiration_date asc;
