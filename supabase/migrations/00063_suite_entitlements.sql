begin;

create table public.suite_subscriptions (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product text not null check (product in ('purchasing','analytics','commerce','pos','shipping','manufacturing')),
  status text not null default 'checkout',
  checkout_id uuid not null default gen_random_uuid(),
  checkout_expires_at timestamptz,
  stripe_price_id text not null,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  last_event_at bigint not null default 0,
  primary key (tenant_id,product)
);
alter table public.suite_subscriptions enable row level security;
revoke all on public.suite_subscriptions from public,anon,authenticated;
grant select,insert,update on public.suite_subscriptions to service_role;

create function public.suite_workspace_available(p_tenant uuid,p_product text) returns boolean
language sql stable set search_path=public,pg_temp as $$
  select exists (
    select 1 from suite_subscriptions s
    join tenant_billing b on b.tenant_id=s.tenant_id
    where s.tenant_id=p_tenant and s.product=p_product
      and s.status in ('active','trialing') and s.current_period_end>now()
      and (b.status='active' or (b.status='trialing' and b.trial_ends_at>now()))
  )
$$;

create function public.suite_has_access(p_product text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists (
    select 1 from users u where u.id=auth.uid() and u.is_active
      and u.role in ('admin','manager') and u.access_level is distinct from 'scanner_only'
      and public.suite_workspace_available(u.tenant_id,p_product)
  )
$$;

create function public.require_suite_access(p_product text) returns uuid
language plpgsql stable set search_path=public,pg_temp as $$
begin
  if not public.suite_has_access(p_product) then
    raise exception 'An active % add-on is required',p_product using errcode='42501';
  end if;
  return public.get_tenant_id();
end $$;

create function public.list_suite_subscriptions() returns table (
  product text,status text,enabled boolean
)
language sql stable security definer set search_path=public,pg_temp as $$
  select s.product,s.status,public.suite_workspace_available(s.tenant_id,s.product)
  from suite_subscriptions s join users u on u.tenant_id=s.tenant_id
  where u.id=auth.uid() and u.is_active and u.role in ('admin','manager')
    and u.access_level is distinct from 'scanner_only'
$$;

-- Reuse one reservation and Stripe idempotency key until the checkout expires.
create function public.reserve_suite_checkout(p_tenant uuid,p_product text,p_price text)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare reservation suite_subscriptions;
begin
  if not exists (select 1 from tenant_billing where tenant_id=p_tenant and stripe_customer_id is not null
    and (status='active' or (status='trialing' and trial_ends_at>now()))) then
    raise exception 'A WMS subscription and billing account are required' using errcode='P0001';
  end if;
  insert into suite_subscriptions(tenant_id,product,stripe_price_id,checkout_expires_at)
    values(p_tenant,p_product,p_price,now()+interval '23 hours')
    on conflict(tenant_id,product) do nothing;
  select * into reservation from suite_subscriptions
    where tenant_id=p_tenant and product=p_product for update;
  if reservation.status not in ('checkout','canceled','incomplete_expired') then
    raise exception 'Manage this add-on through the billing portal' using errcode='P0001';
  end if;
  if reservation.status<>'checkout' or reservation.checkout_expires_at<=now() then
    update suite_subscriptions set status='checkout',checkout_id=gen_random_uuid(),
      checkout_expires_at=now()+interval '23 hours',stripe_price_id=p_price,
      stripe_subscription_id=null,current_period_end=null,last_event_at=0
      where tenant_id=p_tenant and product=p_product returning * into reservation;
  end if;
  return jsonb_build_object('id',reservation.checkout_id,'expires_at',reservation.checkout_expires_at,
    'price',reservation.stripe_price_id);
end $$;

create function public.apply_suite_subscription(
  p_tenant uuid,p_product text,p_checkout uuid,p_customer text,p_subscription text,
  p_price text,p_status text,p_period_end timestamptz,p_event_at bigint
) returns boolean language plpgsql set search_path=public,pg_temp as $$
declare changed integer;
begin
  update suite_subscriptions s set
    stripe_subscription_id=p_subscription,
    status=case when s.stripe_price_id=p_price then p_status else 'unrecognized' end,
    current_period_end=p_period_end,last_event_at=p_event_at
  where s.tenant_id=p_tenant and s.product=p_product and s.checkout_id=p_checkout
    and (s.stripe_subscription_id is null or s.stripe_subscription_id=p_subscription)
    and s.last_event_at<=p_event_at
    and (s.status not in ('canceled','incomplete_expired') or s.status=p_status)
    and exists(select 1 from tenant_billing b where b.tenant_id=p_tenant and b.stripe_customer_id=p_customer);
  get diagnostics changed=row_count;
  return changed=1;
end $$;

revoke all on function public.suite_workspace_available(uuid,text),public.suite_has_access(text),
  public.require_suite_access(text),public.list_suite_subscriptions(),
  public.reserve_suite_checkout(uuid,text,text),
  public.apply_suite_subscription(uuid,text,uuid,text,text,text,text,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.suite_has_access(text),public.list_suite_subscriptions() to authenticated;
grant execute on function public.suite_workspace_available(uuid,text),public.reserve_suite_checkout(uuid,text,text),
  public.apply_suite_subscription(uuid,text,uuid,text,text,text,text,timestamptz,bigint) to service_role;
commit;
