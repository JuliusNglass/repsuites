-- Fix-It Pack bonus: one free month of RepSuites Growth, no card needed.
-- Claimed once per order when the buyer signs up. Service-role only.
alter table public.fixit_orders add column if not exists bonus_tenant_id uuid;
alter table public.fixit_orders add column if not exists bonus_claimed_at timestamptz;

create table if not exists public.tenant_bonus (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  source text not null default 'fixit',
  fixit_order_id uuid,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  reminded_at timestamptz,
  ended_at timestamptz
);
create index if not exists tenant_bonus_open on public.tenant_bonus (ends_at) where ended_at is null;

alter table public.tenant_bonus enable row level security;
revoke all on public.tenant_bonus from public, anon, authenticated;
grant select, insert, update on public.tenant_bonus to service_role;
