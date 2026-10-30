-- AI search visibility: does an AI assistant that searches the web name the
-- business when asked who to use?
create table if not exists public.ai_visibility_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  service text check (service is null or char_length(service) <= 80),
  town text check (town is null or char_length(town) <= 80),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
create table if not exists public.ai_visibility_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  results jsonb not null,
  named integer not null default 0,
  total integer not null default 0,
  error text
);
create index if not exists ai_visibility_checks_tenant on public.ai_visibility_checks (tenant_id, created_at desc);
do $$
declare t text;
begin
  foreach t in array array['ai_visibility_settings', 'ai_visibility_checks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
