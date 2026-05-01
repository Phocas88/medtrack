-- MedTrack v2-v4 Feature Migration
-- Purchase Orders, Returns, Locations, Cycle Counts, Quarantine,
-- Documents, Notifications, Customer Pricing, Kitting, Custom Fields

-- ============================================================
-- ENUMS
-- ============================================================
create type po_status as enum ('draft', 'pending_approval', 'approved', 'sent', 'partial', 'received', 'cancelled');
create type return_type as enum ('customer_return', 'supplier_rma');
create type return_disposition as enum ('restock', 'quarantine', 'destroy', 'return_to_supplier');
create type return_status as enum ('pending', 'inspecting', 'completed', 'cancelled');
create type count_status as enum ('planned', 'in_progress', 'pending_review', 'approved', 'cancelled');
create type quarantine_status as enum ('held', 'released', 'rejected', 'destroyed');
create type notification_type as enum ('low_stock', 'expiring_lot', 'expiring_license', 'po_overdue', 'temp_excursion', 'reorder', 'quarantine', 'recall', 'document_expiring', 'general');
create type notification_priority as enum ('low', 'medium', 'high', 'critical');
create type transfer_status as enum ('pending', 'in_transit', 'received', 'cancelled');
create type doc_type as enum ('coa', 'sds', 'license', 'dea_registration', 'inspection', 'invoice', 'photo', 'other');

-- ============================================================
-- LOCATIONS / WAREHOUSES
-- ============================================================
create table locations (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  location_type text default 'warehouse', -- warehouse, clinic, office
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, code)
);

create index idx_locations_tenant on locations(tenant_id);

create table zones (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  name text not null,
  code text not null,
  storage_requirement storage_requirement default 'room_temp',
  temperature_min numeric(5,1),
  temperature_max numeric(5,1),
  notes text,
  created_at timestamptz default now(),
  unique(tenant_id, location_id, code)
);

create index idx_zones_location on zones(location_id);

-- Add location_id to lots (nullable for backward compat)
alter table lots add column if not exists location_id uuid references locations(id) on delete set null;
alter table lots add column if not exists zone_id uuid references zones(id) on delete set null;

-- ============================================================
-- INTER-LOCATION TRANSFERS
-- ============================================================
create table transfers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  transfer_number text not null,
  from_location_id uuid not null references locations(id),
  to_location_id uuid not null references locations(id),
  status transfer_status default 'pending',
  initiated_by uuid references users(id),
  received_by uuid references users(id),
  shipped_at timestamptz,
  received_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, transfer_number)
);

create table transfer_lines (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  transfer_id uuid not null references transfers(id) on delete cascade,
  product_id uuid not null references products(id),
  lot_id uuid references lots(id),
  quantity integer not null,
  quantity_received integer default 0,
  created_at timestamptz default now()
);

create index idx_transfers_tenant on transfers(tenant_id);
create index idx_transfer_lines_transfer on transfer_lines(transfer_id);

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
create table purchase_orders (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  po_number text not null,
  supplier_id uuid not null references suppliers(id),
  status po_status default 'draft',
  order_date date default current_date,
  expected_date date,
  location_id uuid references locations(id),
  approved_by uuid references users(id),
  approved_at timestamptz,
  notes text,
  total_amount numeric(14,4) default 0,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, po_number)
);

create table po_lines (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  po_id uuid not null references purchase_orders(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity_ordered integer not null,
  quantity_received integer default 0,
  unit_cost numeric(12,4) default 0,
  notes text,
  created_at timestamptz default now()
);

create index idx_po_tenant on purchase_orders(tenant_id);
create index idx_po_supplier on purchase_orders(supplier_id);
create index idx_po_status on purchase_orders(tenant_id, status);
create index idx_po_lines_po on po_lines(po_id);

-- ============================================================
-- RETURNS
-- ============================================================
create table returns (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  return_number text not null,
  return_type return_type not null,
  status return_status default 'pending',
  customer_id uuid references customers(id),
  supplier_id uuid references suppliers(id),
  reason text,
  disposition return_disposition,
  credit_amount numeric(12,4) default 0,
  inspected_by uuid references users(id),
  inspected_at timestamptz,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, return_number)
);

create table return_lines (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  return_id uuid not null references returns(id) on delete cascade,
  product_id uuid not null references products(id),
  lot_id uuid references lots(id),
  quantity integer not null,
  disposition return_disposition,
  reason text,
  created_at timestamptz default now()
);

create index idx_returns_tenant on returns(tenant_id);
create index idx_return_lines_return on return_lines(return_id);

-- ============================================================
-- CYCLE COUNTS
-- ============================================================
create table cycle_counts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  count_number text not null,
  location_id uuid references locations(id),
  status count_status default 'planned',
  count_type text default 'full', -- full, partial, spot
  is_blind boolean default false,
  planned_date date,
  completed_date date,
  created_by uuid references users(id),
  approved_by uuid references users(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, count_number)
);

create table cycle_count_lines (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  count_id uuid not null references cycle_counts(id) on delete cascade,
  product_id uuid not null references products(id),
  lot_id uuid references lots(id),
  location text,
  system_quantity integer not null default 0,
  counted_quantity integer,
  variance integer generated always as (counted_quantity - system_quantity) stored,
  reason_code text, -- damaged, expired, theft, miscount, sample
  counted_by uuid references users(id),
  counted_at timestamptz,
  notes text,
  created_at timestamptz default now()
);

create index idx_counts_tenant on cycle_counts(tenant_id);
create index idx_count_lines_count on cycle_count_lines(count_id);

-- ============================================================
-- QUARANTINE / QA
-- ============================================================
create table quarantine_holds (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  lot_id uuid not null references lots(id),
  product_id uuid not null references products(id),
  status quarantine_status default 'held',
  reason text not null,
  quantity integer not null,
  held_by uuid references users(id),
  held_at timestamptz default now(),
  released_by uuid references users(id),
  released_at timestamptz,
  disposition text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_quarantine_tenant on quarantine_holds(tenant_id);
create index idx_quarantine_lot on quarantine_holds(lot_id);
create index idx_quarantine_status on quarantine_holds(tenant_id, status);

-- ============================================================
-- DOCUMENTS
-- ============================================================
create table documents (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  doc_type doc_type not null,
  title text not null,
  file_name text,
  file_url text, -- Supabase Storage URL
  file_size integer,
  mime_type text,
  -- Polymorphic attachment
  entity_type text not null, -- product, lot, customer, supplier, return
  entity_id uuid not null,
  expiration_date date,
  notes text,
  uploaded_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_documents_tenant on documents(tenant_id);
create index idx_documents_entity on documents(entity_type, entity_id);
create index idx_documents_expiration on documents(tenant_id, expiration_date);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id), -- null = all users in tenant
  notification_type notification_type not null,
  priority notification_priority default 'medium',
  title text not null,
  message text,
  entity_type text, -- product, lot, po, customer, etc.
  entity_id uuid,
  is_read boolean default false,
  read_at timestamptz,
  is_email_sent boolean default false,
  created_at timestamptz default now()
);

create index idx_notifications_user on notifications(tenant_id, user_id, is_read);
create index idx_notifications_created on notifications(tenant_id, created_at desc);

create table notification_preferences (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id),
  notification_type notification_type not null,
  in_app boolean default true,
  email boolean default false,
  created_at timestamptz default now(),
  unique(tenant_id, user_id, notification_type)
);

-- ============================================================
-- CUSTOMER PRICING
-- ============================================================
create table price_tiers (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  discount_percent numeric(5,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table customer_prices (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  custom_price numeric(12,4) not null,
  effective_date date default current_date,
  expiration_date date,
  notes text,
  created_at timestamptz default now(),
  unique(tenant_id, customer_id, product_id)
);

-- Add tier to customers
alter table customers add column if not exists price_tier_id uuid references price_tiers(id) on delete set null;

create index idx_customer_prices_customer on customer_prices(customer_id);
create index idx_customer_prices_product on customer_prices(product_id);

-- ============================================================
-- KITTING / BOM
-- ============================================================
create table kits (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id), -- the kit as a product
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table kit_components (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kit_id uuid not null references kits(id) on delete cascade,
  component_product_id uuid not null references products(id),
  quantity integer not null default 1,
  created_at timestamptz default now()
);

create table kit_assemblies (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kit_id uuid not null references kits(id),
  quantity_assembled integer not null,
  assembled_by uuid references users(id),
  assembled_at timestamptz default now(),
  lot_number text,
  notes text,
  created_at timestamptz default now()
);

create table kit_assembly_lots (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  assembly_id uuid not null references kit_assemblies(id) on delete cascade,
  component_product_id uuid not null references products(id),
  lot_id uuid not null references lots(id),
  quantity_used integer not null,
  created_at timestamptz default now()
);

create index idx_kits_tenant on kits(tenant_id);
create index idx_kit_components_kit on kit_components(kit_id);
create index idx_kit_assemblies_kit on kit_assemblies(kit_id);

-- ============================================================
-- CUSTOM FIELDS (per-tenant extensibility)
-- ============================================================
create table custom_field_definitions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity_type text not null, -- product, customer, supplier, lot, order
  field_name text not null,
  field_label text not null,
  field_type text not null default 'text', -- text, number, date, boolean, select
  options jsonb, -- for select type: ["option1", "option2"]
  is_required boolean default false,
  sort_order integer default 0,
  created_at timestamptz default now(),
  unique(tenant_id, entity_type, field_name)
);

create table custom_field_values (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  field_id uuid not null references custom_field_definitions(id) on delete cascade,
  entity_id uuid not null,
  value text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(field_id, entity_id)
);

create index idx_custom_fields_tenant on custom_field_definitions(tenant_id, entity_type);
create index idx_custom_values_entity on custom_field_values(entity_id);

-- ============================================================
-- TEMPERATURE LOGGING
-- ============================================================
create table temperature_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  zone_id uuid not null references zones(id) on delete cascade,
  temperature numeric(5,1) not null,
  is_excursion boolean default false,
  recorded_by uuid references users(id),
  recorded_at timestamptz default now(),
  notes text
);

create index idx_temp_logs_zone on temperature_logs(zone_id, recorded_at desc);
create index idx_temp_logs_excursion on temperature_logs(tenant_id, is_excursion) where is_excursion = true;

-- ============================================================
-- ADD LEAD TIME TO PRODUCTS
-- ============================================================
alter table products add column if not exists lead_time_days integer default 7;
alter table products add column if not exists reorder_point integer;
alter table products add column if not exists reorder_quantity integer;
alter table products add column if not exists par_level_min integer;
alter table products add column if not exists par_level_max integer;

-- ============================================================
-- RLS FOR ALL NEW TABLES
-- ============================================================
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'locations', 'zones', 'transfers', 'transfer_lines',
    'purchase_orders', 'po_lines',
    'returns', 'return_lines',
    'cycle_counts', 'cycle_count_lines',
    'quarantine_holds', 'documents', 'notifications', 'notification_preferences',
    'price_tiers', 'customer_prices',
    'kits', 'kit_components', 'kit_assemblies', 'kit_assembly_lots',
    'custom_field_definitions', 'custom_field_values',
    'temperature_logs'
  ]) loop
    execute format('alter table %I enable row level security', tbl);
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

-- Updated_at triggers for new mutable tables
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'locations', 'transfers', 'purchase_orders', 'returns',
    'cycle_counts', 'quarantine_holds', 'documents',
    'price_tiers', 'kits', 'custom_field_values'
  ]) loop
    execute format(
      'create trigger trg_updated_at before update on %I for each row execute function update_updated_at()',
      tbl
    );
  end loop;
end $$;
