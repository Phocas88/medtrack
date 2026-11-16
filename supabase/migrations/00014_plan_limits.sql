begin;
create function enforce_plan_limit() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare selected_plan text; maximum integer; usage_count integer;
begin
  perform 1 from tenants where id=new.tenant_id for update;
  select coalesce(plan,'starter') into selected_plan from tenant_billing where tenant_id=new.tenant_id;
  selected_plan:=coalesce(selected_plan,'starter');
  if selected_plan='enterprise' then return new; end if;
  if TG_TABLE_NAME='users' then
    if not new.is_active or TG_OP='UPDATE' and old.is_active then return new; end if;
    maximum:=case when selected_plan='professional' then 25 else 5 end;
    select count(*) into usage_count from users where tenant_id=new.tenant_id and is_active;
  elsif TG_TABLE_NAME='products' then
    if new.is_archived or TG_OP='UPDATE' and not old.is_archived then return new; end if;
    maximum:=case when selected_plan='professional' then 10000 else 1000 end;
    select count(*) into usage_count from products where tenant_id=new.tenant_id and not is_archived;
  elsif TG_TABLE_NAME='locations' then
    if not new.is_active or TG_OP='UPDATE' and old.is_active then return new; end if;
    maximum:=case when selected_plan='professional' then 3 else 1 end;
    select count(*) into usage_count from locations where tenant_id=new.tenant_id and is_active;
  elsif TG_TABLE_NAME='sales_orders' then
    if TG_OP='UPDATE' then return new; end if;
    maximum:=case when selected_plan='professional' then 5000 else 500 end;
    select count(*) into usage_count from sales_orders where tenant_id=new.tenant_id and created_at>=date_trunc('month',now());
  end if;
  if maximum is not null and usage_count>=maximum then raise exception 'Plan limit reached for %. Upgrade your subscription.',TG_TABLE_NAME; end if;
  return new;
end $$;
create trigger enforce_plan_limit before insert or update on users for each row execute function enforce_plan_limit();
create trigger enforce_plan_limit before insert or update on products for each row execute function enforce_plan_limit();
create trigger enforce_plan_limit before insert or update on locations for each row execute function enforce_plan_limit();
create trigger enforce_plan_limit before insert on sales_orders for each row execute function enforce_plan_limit();
commit;
