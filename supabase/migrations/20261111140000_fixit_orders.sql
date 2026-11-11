-- Fix-It Pack orders: paid by Stripe, written by AI, delivered in minutes.
-- Service-role only (the app checks everything in code).
create table if not exists public.fixit_orders (
  id uuid primary key default gen_random_uuid(),
  stripe_session_id text unique not null,
  view_key text unique not null default encode(extensions.gen_random_bytes(18), 'hex'),
  report_token text,
  business text,
  email text,
  phone text,
  name text,
  status text not null default 'paid'
    check (status in ('paid', 'writing', 'ready', 'failed', 'needs_info')),
  attempts int not null default 0,
  pack jsonb,
  error text,
  created_at timestamptz not null default now(),
  writing_at timestamptz,
  ready_at timestamptz,
  emailed_at timestamptz
);
create index if not exists fixit_orders_status_idx on public.fixit_orders (status, created_at);
alter table public.fixit_orders enable row level security;
revoke all on public.fixit_orders from public, anon, authenticated;
grant select, insert, update on public.fixit_orders to service_role;

-- Every 5 minutes: write any pack the thank-you page did not finish.
create or replace function repsuites_private.run_fixit()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  if not exists (
    select 1 from public.fixit_orders
     where status = 'paid' or (status = 'writing' and writing_at < now() - interval '5 minutes')
        or (status = 'ready' and emailed_at is null)
  ) then return null; end if;
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  return net.http_post(
    url := v_url || '/api/internal/fixit',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end
$$;
revoke all on function repsuites_private.run_fixit() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-fixit';
  perform cron.schedule('repsuites-fixit', '*/5 * * * *', 'select repsuites_private.run_fixit()');
end $$;
