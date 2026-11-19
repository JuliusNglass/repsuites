-- Won-deal sync: one row per GHL opportunity sent to Meta as a Purchase. Service-role only.
create table if not exists public.growth_sales (
  opportunity_id text primary key check (char_length(opportunity_id) <= 64),
  contact_id text not null check (char_length(contact_id) <= 64),
  value numeric not null default 0,
  meta_sent boolean,
  alerted boolean,
  created_at timestamptz not null default now()
);
alter table public.growth_sales enable row level security;
revoke all on public.growth_sales from public, anon, authenticated;
grant select, insert, update on public.growth_sales to service_role;

create or replace function repsuites_private.run_sale_sync()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  return net.http_post(
    url := v_url || '/api/internal/sale-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
revoke all on function repsuites_private.run_sale_sync() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-sale-sync';
  perform cron.schedule('repsuites-sale-sync', '*/15 * * * *', 'select repsuites_private.run_sale_sync()');
end $$;
