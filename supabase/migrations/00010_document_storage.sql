begin;
-- Supabase owns the storage schema. Keep database-only environments reproducible.
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    values('tenant-documents','tenant-documents',false,10485760,array['application/pdf','image/png','image/jpeg','text/plain','text/csv'])
    on conflict(id) do nothing;
    execute $policy$create policy stokora_document_read on storage.objects for select to authenticated
      using(bucket_id='tenant-documents' and (storage.foldername(name))[1]=public.get_tenant_id()::text)$policy$;
    execute $policy$create policy stokora_document_upload on storage.objects for insert to authenticated
      with check(bucket_id='tenant-documents' and (storage.foldername(name))[1]=public.get_tenant_id()::text and public.tenant_has_access())$policy$;
    execute $policy$create policy stokora_document_delete on storage.objects for delete to authenticated
      using(bucket_id='tenant-documents' and (storage.foldername(name))[1]=public.get_tenant_id()::text and public.get_user_role() in ('admin','manager'))$policy$;
  end if;
end $$;
create function enforce_document_entity() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare entity_table text; related_tenant uuid;
begin
  entity_table:=case new.entity_type when 'product' then 'products' when 'lot' then 'lots' when 'supplier' then 'suppliers' when 'customer' then 'customers' end;
  if entity_table is null then raise exception 'Unsupported document entity'; end if;
  execute format('select tenant_id from %I where id=$1',entity_table) into related_tenant using new.entity_id;
  if related_tenant is distinct from new.tenant_id then raise exception 'Document entity belongs to another tenant'; end if;
  return new;
end $$;
create trigger enforce_document_entity before insert or update on documents for each row execute function enforce_document_entity();
commit;
