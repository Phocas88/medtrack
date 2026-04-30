-- Run this FIRST if the previous migration partially ran
-- It drops everything so you can re-run the full migration cleanly

drop view if exists expiring_lots cascade;
drop view if exists product_stock_summary cascade;
drop table if exists shipment_lines cascade;
drop table if exists shipments cascade;
drop table if exists sales_order_lines cascade;
drop table if exists sales_orders cascade;
drop table if exists stock_movements cascade;
drop table if exists serial_numbers cascade;
drop table if exists lots cascade;
drop table if exists customers cascade;
drop table if exists products cascade;
drop table if exists suppliers cascade;
drop table if exists users cascade;
drop table if exists tenants cascade;
drop function if exists public.get_tenant_id() cascade;
drop function if exists public.get_user_role() cascade;
drop function if exists auth.tenant_id() cascade;
drop function if exists auth.user_role() cascade;
drop function if exists prevent_movement_mutation() cascade;
drop function if exists update_updated_at() cascade;
drop type if exists user_role cascade;
drop type if exists storage_requirement cascade;
drop type if exists movement_type cascade;
drop type if exists order_status cascade;
drop type if exists lot_status cascade;
