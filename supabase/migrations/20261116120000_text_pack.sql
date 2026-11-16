-- Text Pack: texted review requests sent by RepSuites through The SMS Works.
-- Additive only.

create table if not exists public.review_sms_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  sender text,
  monthly_cap integer not null default 0 check (monthly_cap between 0 and 100000),
  updated_at timestamptz not null default now()
);

create table if not exists public.review_sms_usage (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  parts integer not null default 0 check (parts >= 0),
  primary key (tenant_id, period)
);

alter table public.review_sms_settings enable row level security;
alter table public.review_sms_usage enable row level security;
revoke all on public.review_sms_settings from public, anon, authenticated;
revoke all on public.review_sms_usage from public, anon, authenticated;
grant select, insert, update on public.review_sms_settings to service_role;
grant select, insert, update on public.review_sms_usage to service_role;

alter table public.review_requests add column if not exists sms_id text;

-- Adds (or with a negative number gives back) text parts for a month.
-- Returns false, changing nothing, when it would go over the allowance.
create or replace function public.repsuites_use_sms(p_tenant uuid, p_period text, p_parts integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cap integer;
  v_used integer;
begin
  if p_parts = 0 or abs(p_parts) > 50 then return false; end if;
  select monthly_cap into v_cap from public.review_sms_settings
    where tenant_id = p_tenant and enabled;
  if v_cap is null then return false; end if;
  insert into public.review_sms_usage (tenant_id, period, parts)
    values (p_tenant, p_period, 0)
    on conflict (tenant_id, period) do nothing;
  select parts into v_used from public.review_sms_usage
    where tenant_id = p_tenant and period = p_period for update;
  if p_parts > 0 and v_used + p_parts > v_cap then return false; end if;
  update public.review_sms_usage set parts = greatest(0, v_used + p_parts)
    where tenant_id = p_tenant and period = p_period;
  return true;
end;
$$;

revoke execute on function public.repsuites_use_sms(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.repsuites_use_sms(uuid, text, integer) to service_role;
