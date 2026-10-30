-- Phase 2b: local ranking grid (DataForSEO Google Maps results). Each
-- business tracks up to 5 search words, checked weekly from a grid of points
-- around the business. About $0.002 per point; a monthly spending cap is set
-- on the server (REPSUITES_DATAFORSEO_MONTHLY_LIMIT_USD). Additive only.

create table if not exists public.rank_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  grid_size integer not null default 5 check (grid_size in (3, 5)),
  spacing_km numeric(4, 1) not null default 1.5 check (spacing_km between 0.5 and 10),
  center_lat double precision check (center_lat is null or center_lat between -90 and 90),
  center_lng double precision check (center_lng is null or center_lng between -180 and 180),
  place_id text check (place_id is null or char_length(place_id) <= 200),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.rank_keywords (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  keyword text not null check (char_length(keyword) between 2 and 80),
  active boolean not null default true,
  next_run_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, keyword)
);
create index if not exists rank_keywords_due on public.rank_keywords (active, next_run_at);

create table if not exists public.rank_scans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  keyword_id uuid not null references public.rank_keywords(id) on delete cascade,
  keyword text not null,
  run_at timestamptz not null default now(),
  grid_size integer not null,
  spacing_km numeric(4, 1) not null,
  center_lat double precision not null,
  center_lng double precision not null,
  points jsonb not null default '[]'::jsonb,
  found integer not null default 0,
  average_rank numeric(5, 2),
  cost_usd numeric(8, 4) not null default 0
);
create index if not exists rank_scans_keyword on public.rank_scans (keyword_id, run_at desc);
create index if not exists rank_scans_month on public.rank_scans (run_at);

do $$
declare t text;
begin
  foreach t in array array['rank_settings','rank_keywords','rank_scans'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

create or replace function repsuites_private.run_rank_checks()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  if not exists (
    select 1 from public.rank_keywords k
      join public.rank_settings s on s.tenant_id = k.tenant_id and s.enabled
     where k.active and k.next_run_at <= now()
  ) then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/api/internal/rank-checks',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
end
$$;
revoke all on function repsuites_private.run_rank_checks() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-rank-checks';
  perform cron.schedule('repsuites-rank-checks', '7,37 * * * *', 'select repsuites_private.run_rank_checks()');
end
$$;
