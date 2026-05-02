-- ============================================================
-- BINS & SCANNER MODULE
-- Bin management with primary/secondary bins, min/max levels,
-- replenishment workflows, and mobile scanner task system
-- ============================================================

-- Bin types
create type bin_type as enum ('primary', 'secondary', 'bulk', 'staging', 'returns');
create type scan_task_type as enum ('verify_stock', 'verify_bin', 'cycle_count', 'bin_to_bin', 'replenish', 'putaway', 'pick');
create type scan_task_status as enum ('pending', 'assigned', 'in_progress', 'completed', 'cancelled');

-- ============================================================
-- BINS
-- ============================================================
create table bins (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  zone_id uuid references zones(id) on delete set null,
  bin_code text not null,         -- e.g. A-01-03 (aisle-rack-shelf)
  bin_type bin_type default 'primary',
  description text,
  is_active boolean default true,
  max_weight numeric(10,2),       -- optional weight capacity
  max_volume numeric(10,2),       -- optional volume capacity
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, location_id, bin_code)
);

create index idx_bins_tenant on bins(tenant_id);
create index idx_bins_location on bins(location_id);
create index idx_bins_zone on bins(zone_id);

-- ============================================================
-- BIN INVENTORY (what's in each bin)
-- ============================================================
create table bin_inventory (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  bin_id uuid not null references bins(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  lot_id uuid references lots(id) on delete set null,
  quantity integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(bin_id, product_id, lot_id)
);

create index idx_bin_inventory_bin on bin_inventory(bin_id);
create index idx_bin_inventory_product on bin_inventory(product_id);
create index idx_bin_inventory_tenant on bin_inventory(tenant_id);

-- ============================================================
-- PRODUCT BIN ASSIGNMENTS (min/max per product per bin)
-- ============================================================
create table product_bin_assignments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  bin_id uuid not null references bins(id) on delete cascade,
  bin_role text not null default 'primary',  -- 'primary' or 'secondary'
  min_quantity integer not null default 0,
  max_quantity integer not null default 100,
  reorder_point integer not null default 10,  -- trigger replenishment when qty drops below this
  unit_of_measure text default 'each',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, product_id, bin_id)
);

create index idx_pba_tenant on product_bin_assignments(tenant_id);
create index idx_pba_product on product_bin_assignments(product_id);
create index idx_pba_bin on product_bin_assignments(bin_id);

-- ============================================================
-- SCANNER TASKS (manager assigns to associates)
-- ============================================================
create table scan_tasks (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  task_type scan_task_type not null,
  status scan_task_status default 'pending',
  priority integer default 5,  -- 1=highest, 10=lowest
  title text not null,
  instructions text,

  -- Assignment
  assigned_to uuid references users(id),
  assigned_by uuid references users(id),
  assigned_at timestamptz,

  -- Target (what to scan)
  location_id uuid references locations(id),
  bin_id uuid references bins(id),
  product_id uuid references products(id),
  lot_id uuid references lots(id),

  -- For bin-to-bin moves
  source_bin_id uuid references bins(id),
  target_bin_id uuid references bins(id),
  requested_quantity integer,

  -- Results
  scanned_quantity integer,
  variance integer,
  result_notes text,
  completed_by uuid references users(id),
  started_at timestamptz,
  completed_at timestamptz,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_scan_tasks_tenant on scan_tasks(tenant_id);
create index idx_scan_tasks_assigned on scan_tasks(assigned_to, status);
create index idx_scan_tasks_status on scan_tasks(tenant_id, status);
create index idx_scan_tasks_bin on scan_tasks(bin_id);

-- ============================================================
-- SCAN LOG (every barcode scan is logged)
-- ============================================================
create table scan_logs (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  task_id uuid references scan_tasks(id) on delete set null,
  scanned_by uuid references users(id),
  scan_type text not null,        -- 'bin', 'product', 'lot', 'serial'
  scanned_value text not null,    -- the barcode value
  resolved_bin_id uuid references bins(id),
  resolved_product_id uuid references products(id),
  resolved_lot_id uuid references lots(id),
  quantity integer,
  notes text,
  scanned_at timestamptz default now()
);

create index idx_scan_logs_tenant on scan_logs(tenant_id);
create index idx_scan_logs_task on scan_logs(task_id);
create index idx_scan_logs_time on scan_logs(tenant_id, scanned_at desc);

-- ============================================================
-- RLS FOR NEW TABLES
-- ============================================================
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'bins', 'bin_inventory', 'product_bin_assignments',
    'scan_tasks', 'scan_logs'
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

-- Updated_at triggers
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'bins', 'bin_inventory', 'product_bin_assignments', 'scan_tasks'
  ]) loop
    execute format(
      'create trigger trg_updated_at before update on %I for each row execute function update_updated_at()',
      tbl
    );
  end loop;
end $$;
