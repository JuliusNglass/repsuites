-- Card and stand shop orders, and Stripe billing for plans.

alter table public.tenant_plans drop constraint if exists tenant_plans_plan_check;
alter table public.tenant_plans
  add constraint tenant_plans_plan_check check (plan in ('free', 'starter', 'pro', 'gold'));

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'in_production', 'shipped', 'cancelled')),
  items jsonb not null,
  total_pence integer not null check (total_pence >= 0),
  currency text not null default 'gbp',
  business_name text not null,
  google_place_id text,
  review_url text,
  card_message text,
  email text,
  contact_name text,
  phone text,
  shipping jsonb,
  stripe_session_id text unique,
  stripe_payment_intent text,
  paid_at timestamptz,
  tenant_id uuid references public.tenants(id) on delete set null,
  notes text
);
create index if not exists shop_orders_created on public.shop_orders (created_at desc);

create table if not exists public.tenant_billing (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text check (plan in ('starter', 'pro', 'gold')),
  status text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- Stripe sends each event at least once; remember what we handled.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['shop_orders', 'tenant_billing', 'stripe_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
