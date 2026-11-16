begin;
create function disconnect_shopify(p_tenant_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update integration_credentials set connected=false,encrypted_token=null,updated_at=now() where tenant_id=p_tenant_id and provider='shopify';
  update tenants set settings=jsonb_set(coalesce(settings,'{}'),'{shopify}',coalesce(settings->'shopify','{}')||'{"connected":false,"auto_sync_orders":false,"auto_sync_inventory":false}'::jsonb) where id=p_tenant_id;
end $$;
revoke all on function disconnect_shopify(uuid) from public,anon,authenticated;
grant execute on function disconnect_shopify(uuid) to service_role;

create function process_shopify_privacy(p_tenant_id uuid,p_domain text,p_topic text,p_event_id text,p_email text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare export_data jsonb;
begin
  perform 1 from tenants where id=p_tenant_id for update;
  if not found then raise exception 'Unknown tenant'; end if;
  if exists(select 1 from webhook_events where provider='shopify-privacy' and event_id=p_event_id) then return; end if;
  if p_topic='customers/data_request' then
    select jsonb_build_object(
      'customers',coalesce((select jsonb_agg(to_jsonb(c)) from customers c where c.tenant_id=p_tenant_id and lower(c.email)=lower(p_email)),'[]'),
      'orders',coalesce((select jsonb_agg(to_jsonb(o)) from sales_orders o join customers c on c.id=o.customer_id where o.tenant_id=p_tenant_id and lower(c.email)=lower(p_email)),'[]')
    ) into export_data;
    insert into gdpr_requests(tenant_id,shop_domain,request_type,status,payload) values(p_tenant_id,p_domain,'data_request','ready',export_data);
  elsif p_topic in ('customers/redact','shop/redact') then
    update sales_orders o set ship_to_name='REDACTED',ship_to_address=null,notes=null
      where o.tenant_id=p_tenant_id and (p_topic='shop/redact' and o.order_number like 'SHOPIFY-%' or
        o.customer_id in(select c.id from customers c where c.tenant_id=p_tenant_id and lower(c.email)=lower(p_email)));
    update customers c set name='REDACTED',contact_name=null,email=null,phone=null,ship_to_address=null,notes=null
      where c.tenant_id=p_tenant_id and (lower(c.email)=lower(p_email) or
        p_topic='shop/redact' and c.id in(select customer_id from sales_orders where tenant_id=p_tenant_id and order_number like 'SHOPIFY-%'));
    if p_topic='shop/redact' then
      delete from integration_credentials where tenant_id=p_tenant_id and provider='shopify';
      update tenants set settings=settings-'shopify' where id=p_tenant_id;
      -- Previously compiled exports must not survive merchant redaction.
      update gdpr_requests set payload='{}' where tenant_id=p_tenant_id;
    end if;
    insert into gdpr_requests(tenant_id,shop_domain,request_type,status,payload,completed_at) values(p_tenant_id,p_domain,p_topic,'completed','{}',now());
  else raise exception 'Unsupported privacy topic'; end if;
  insert into webhook_events(provider,event_id,tenant_id) values('shopify-privacy',p_event_id,p_tenant_id);
end $$;
revoke all on function process_shopify_privacy(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function process_shopify_privacy(uuid,text,text,text,text) to service_role;

-- Enforce trial/payment boundaries even when clients call PostgREST directly.
create function enforce_subscription_write() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user in ('authenticated','anon') and not public.tenant_has_access() then
    raise exception 'An active subscription or trial is required';
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['products','suppliers','customers','lots','serial_numbers','stock_movements','sales_orders','sales_order_lines','shipments','shipment_lines',
    'locations','zones','bins','bin_inventory','product_bin_assignments','scan_tasks','scan_logs','purchase_orders','po_lines','transfers','transfer_lines',
    'returns','return_lines','cycle_counts','cycle_count_lines','quarantine_holds','documents','kits','kit_components','kit_assemblies','kit_assembly_lots',
    'custom_field_definitions','custom_field_values','temperature_logs','price_tiers','customer_prices','service_items','work_orders','work_order_lines','promotions'] loop
    execute format('create trigger enforce_subscription_write before insert or update or delete on %I for each row execute function enforce_subscription_write()',t);
  end loop;
end $$;
commit;
