begin;
create table integration_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null check(provider in ('shopify')),
  event_id text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','running','complete','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index integration_jobs_pending on integration_jobs(next_attempt_at) where status in ('pending','running');
alter table integration_jobs enable row level security;
revoke all on integration_jobs from public,anon,authenticated;
grant all on integration_jobs to service_role;
create function claim_integration_job() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result integration_jobs;
begin
  update integration_jobs set status='failed',last_error='retry_limit' where attempts>=8 and (status='pending' or status='running' and lease_until<now());
  select * into result from integration_jobs where attempts<8 and (status='pending' and next_attempt_at<=now() or status='running' and lease_until<now()) order by next_attempt_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update integration_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=result.id returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function claim_integration_job() from public,anon,authenticated;
grant execute on function claim_integration_job() to service_role;
commit;
