-- Customer Insights: a plain-English summary of what customers say, built
-- from Google reviews and private feedback.
create table if not exists public.customer_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_at timestamptz not null default now(),
  period_days integer not null,
  facts jsonb not null,
  summary jsonb,
  error text
);
create index if not exists customer_insights_tenant on public.customer_insights (tenant_id, created_at desc);
alter table public.customer_insights enable row level security;
revoke all on public.customer_insights from public, anon, authenticated;
grant select, insert, update, delete on public.customer_insights to service_role;
