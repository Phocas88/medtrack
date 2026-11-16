begin;
create function transition_order(p_order uuid,p_expected text,p_target text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare tid uuid; o sales_orders;
begin
 tid:=require_inventory_access();if get_user_role() not in ('admin','manager') then raise exception 'Manager required'; end if;
 select * into o from sales_orders where id=p_order and tenant_id=tid for update;if not found then raise exception 'Order not found'; end if;
 if o.status::text=p_target then return; end if;
 if o.order_number like 'SHOPIFY-%' then raise exception 'Change Shopify orders in Shopify to keep both systems consistent'; end if;
 if o.status::text<>p_expected then raise exception 'Order changed. Refresh before continuing'; end if;
 if not(o.status='draft' and p_target in ('confirmed','cancelled') or o.status='confirmed' and p_target='cancelled') then raise exception 'Unsupported order transition'; end if;
 if exists(select 1 from shipping_quotes where tenant_id=tid and order_id=o.id and purchase_state in ('buying','uncertain','purchased')) then raise exception 'Resolve the existing label purchase before cancelling'; end if;
 update sales_orders set status=p_target::order_status where id=o.id;
end $$;
revoke all on function transition_order(uuid,text,text) from public,anon;
grant execute on function transition_order(uuid,text,text) to authenticated;
commit;
