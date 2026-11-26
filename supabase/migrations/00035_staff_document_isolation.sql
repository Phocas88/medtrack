begin;
do $$ begin
 if to_regclass('storage.objects') is not null then
  update storage.buckets set public=false where id='tenant-documents';
  execute $policy$create policy stokora_document_boundary on storage.objects as restrictive for all to public using(bucket_id<>'tenant-documents' or ((storage.foldername(name))[1]=public.get_tenant_id()::text and public.get_user_role() in ('admin','manager'))) with check(bucket_id<>'tenant-documents' or ((storage.foldername(name))[1]=public.get_tenant_id()::text and public.get_user_role() in ('admin','manager') and public.tenant_has_access()))$policy$;
  execute $policy$alter policy stokora_document_read on storage.objects using(bucket_id='tenant-documents' and (storage.foldername(name))[1]=public.get_tenant_id()::text and public.get_user_role() in ('admin','manager'))$policy$;
  execute $policy$alter policy stokora_document_upload on storage.objects with check(bucket_id='tenant-documents' and (storage.foldername(name))[1]=public.get_tenant_id()::text and public.tenant_has_access() and public.get_user_role() in ('admin','manager'))$policy$;
 end if;
end $$;
commit;
