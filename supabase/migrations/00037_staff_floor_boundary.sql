begin;
-- Restrictive policies prevent an older permissive tenant policy from reopening staff access.
do $$ declare t text; begin
 for t in select tablename from pg_tables p where p.schemaname='public'
   and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=p.tablename and c.column_name='tenant_id')
 loop
  if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t) then raise exception 'Audit tenant-table RLS before applying staff boundary: %',t;end if;
  if t not in ('users','tenants','scan_tasks','scan_logs','bins','bin_inventory','locations','zones','promotions') then
   execute format('create policy staff_floor_read_guard on %I as restrictive for select to authenticated using(public.get_user_role() in (''admin'',''manager''))',t);
  end if;
  if t not in ('users','scan_logs') then
   execute format('create policy staff_floor_insert_guard on %I as restrictive for insert to authenticated with check(public.get_user_role() in (''admin'',''manager''))',t);
   execute format('create policy staff_floor_update_guard on %I as restrictive for update to authenticated using(public.get_user_role() in (''admin'',''manager'')) with check(public.get_user_role() in (''admin'',''manager''))',t);
   execute format('create policy staff_floor_delete_guard on %I as restrictive for delete to authenticated using(public.get_user_role() in (''admin'',''manager''))',t);
  end if;
 end loop;
end $$;
create policy staff_profile_read_guard on users as restrictive for select to authenticated using(public.get_user_role() in ('admin','manager') or id=auth.uid());
create policy staff_scanlog_read_guard on scan_logs as restrictive for select to authenticated using(public.get_user_role() in ('admin','manager') or scanned_by=auth.uid());
commit;
