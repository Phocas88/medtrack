-- ============================================================
-- UNIT OF MEASURE CONVERSIONS
-- Tracks multiple UOMs per product (each, inner, case, pallet)
-- ============================================================

create table product_uom_conversions (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  uom_name text not null,           -- 'each', 'inner', 'case', 'pallet', 'box', 'lb', 'kg'
  conversion_factor integer not null default 1,  -- how many of the base UOM (each) per this UOM
  barcode text,                      -- optional barcode for this UOM packaging
  is_default boolean default false,  -- is this the default/base UOM
  is_orderable boolean default true, -- can you order in this UOM
  is_sellable boolean default true,  -- can you sell in this UOM
  weight numeric(10,3),              -- weight per this UOM unit
  dimensions text,                   -- L x W x H for this UOM
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(tenant_id, product_id, uom_name)
);

create index idx_product_uom_tenant on product_uom_conversions(tenant_id);
create index idx_product_uom_product on product_uom_conversions(product_id);
create index idx_product_uom_barcode on product_uom_conversions(barcode) where barcode is not null;

-- ============================================================
-- MULTI-PART PRODUCTS (1 of 2, 2 of 2, etc.)
-- Products that ship as multiple physical pieces under one SKU
-- ============================================================

create table product_parts (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  part_number integer not null,      -- 1, 2, 3, etc.
  total_parts integer not null,      -- total count (e.g., 2 for "1 of 2")
  part_description text,             -- e.g., "Table Top", "Table Legs"
  part_sku text,                     -- optional separate SKU for the part
  weight numeric(10,3),
  dimensions text,                   -- L x W x H
  barcode text,                      -- unique barcode for this part
  notes text,
  created_at timestamptz default now(),
  unique(tenant_id, product_id, part_number)
);

create index idx_product_parts_tenant on product_parts(tenant_id);
create index idx_product_parts_product on product_parts(product_id);
create index idx_product_parts_barcode on product_parts(barcode) where barcode is not null;

-- ============================================================
-- RLS
-- ============================================================
do $$
declare
  tbl text;
begin
  for tbl in select unnest(array[
    'product_uom_conversions',
    'product_parts'
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

do $$
begin
  execute 'create trigger trg_updated_at before update on product_uom_conversions for each row execute function update_updated_at()';
end $$;
