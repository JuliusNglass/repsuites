-- Growth Fit Call chase: one row per text per GHL contact. Service-role only.
create table if not exists public.growth_chase (
  id uuid primary key default gen_random_uuid(),
  contact_id text not null check (char_length(contact_id) <= 64),
  step smallint not null check (step between 1 and 3),
  status text not null check (char_length(status) <= 40),
  created_at timestamptz not null default now(),
  unique (contact_id, step)
);
alter table public.growth_chase enable row level security;
revoke all on public.growth_chase from public, anon, authenticated;
grant select, insert, update on public.growth_chase to service_role;

-- Every 10 minutes. The app only sends 9am-7pm UK time, Monday to Saturday.
create or replace function repsuites_private.run_growth_chase()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  return net.http_post(
    url := v_url || '/api/internal/growth-chase',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
revoke all on function repsuites_private.run_growth_chase() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-growth-chase';
  perform cron.schedule('repsuites-growth-chase', '*/10 * * * *', 'select repsuites_private.run_growth_chase()');
end $$;
