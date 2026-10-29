-- RepSuites foundation: businesses (tenants), who can sign in to each,
-- printed QR review links, scans, and free visibility check requests.
-- Every table is service-role only (the app server reads with the service
-- key and filters by the tenant from the verified session).

create schema if not exists repsuites_private;
revoke all on schema repsuites_private from public, anon, authenticated;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  slug text unique check (slug is null or slug ~ '^[a-z0-9-]{2,80}$'),
  settings jsonb not null default '{}'::jsonb,
  legacy_user_id uuid unique,           -- the old RepSuites account this came from
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  timezone text not null default 'Europe/London',
  currency text not null default 'GBP',
  date_format text not null default 'dd-mm-yyyy'
);

create table if not exists public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'super_admin')),
  active boolean not null default true,
  can_clean boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index if not exists tenant_memberships_user on public.tenant_memberships (user_id) where active;

create table if not exists public.tenant_domains (
  domain text primary key check (domain ~ '^[a-z0-9.-]{3,253}$'),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  active boolean not null default true
);

create table if not exists public.tenant_plans (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'gold')),
  features text[] not null default '{}'
);

-- Accelur8 staff who can see every business.
create table if not exists public.agency_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Accounts that must set a new password before they can use the app.
create table if not exists public.password_change_required (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Printed QR codes: https://www.repsuites.com/feedback/<id>
create table if not exists public.qr_links (
  id uuid primary key,
  tenant_id uuid references public.tenants(id) on delete set null,
  kind text not null default 'business' check (kind in ('business', 'location')),
  business_name text check (business_name is null or char_length(business_name) <= 300),
  location_name text check (location_name is null or char_length(location_name) <= 500),
  google_place_id text check (google_place_id is null or char_length(google_place_id) <= 200),
  target_url text check (target_url is null or (target_url ~ '^https://' and char_length(target_url) <= 2000)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists qr_links_tenant on public.qr_links (tenant_id);

create table if not exists public.qr_scans (
  id bigint generated always as identity primary key,
  qr_id uuid not null references public.qr_links(id) on delete cascade,
  scanned_at timestamptz not null default now()
);
create index if not exists qr_scans_qr on public.qr_scans (qr_id, scanned_at desc);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  business_name text not null check (char_length(business_name) between 1 and 160),
  town text not null check (char_length(town) between 1 and 120),
  email text not null check (char_length(email) <= 320),
  phone text check (phone is null or char_length(phone) <= 40),
  source text not null default 'homepage' check (char_length(source) <= 60),
  created_at timestamptz not null default now()
);

create table if not exists repsuites_private.app_errors (
  id bigint generated always as identity primary key,
  host text, path text, message text,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['tenants','tenant_settings','tenant_memberships','tenant_domains','tenant_plans',
                           'agency_users','password_change_required','qr_links','qr_scans','leads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ---------- functions the app server calls ----------

create or replace function public.repsuites_get_my_memberships(p_user_id uuid)
returns table(tenant_id uuid, user_id uuid, role text, active boolean, can_clean boolean)
language sql stable security definer set search_path = ''
as $$
  select tenant_id, user_id, role, active, can_clean
    from public.tenant_memberships
   where user_id = p_user_id and active = true;
$$;

create or replace function public.repsuites_password_status(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('mustChangePassword',
    exists (select 1 from public.password_change_required r where r.user_id = p_user_id));
$$;

create or replace function public.repsuites_record_app_error(p_host text, p_path text, p_message text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  insert into repsuites_private.app_errors (host, path, message)
    values (left(p_host, 255), left(p_path, 500), left(coalesce(nullif(p_message, ''), 'Unknown error'), 2000));
  delete from repsuites_private.app_errors where created_at < now() - interval '30 days';
end
$$;

create or replace function public.repsuites_tenant_access(p_tenant uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_agency boolean := false;
  v_plan text := 'free';
  v_features text[] := '{}';
begin
  if p_tenant is null then raise exception 'tenant required' using errcode = '22023'; end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    if v_uid is null then raise exception 'not allowed' using errcode = '42501'; end if;
    v_agency := exists (select 1 from public.agency_users a where a.user_id = v_uid);
    if not v_agency and not exists (select 1 from public.tenant_memberships m
                                     where m.tenant_id = p_tenant and m.user_id = v_uid and m.active) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  select p.plan, p.features into v_plan, v_features from public.tenant_plans p where p.tenant_id = p_tenant;
  return jsonb_build_object(
    'tenantId', p_tenant, 'plan', coalesce(v_plan, 'free'), 'features', to_jsonb(coalesce(v_features, '{}')),
    'status', 'active', 'daysOverdue', 0, 'dueDate', null, 'amountDuePence', null,
    'invoiceNumber', null, 'payUrl', null, 'readOnlyFrom', null, 'onHoldFrom', null,
    'agency', v_agency);
end
$$;

revoke all on function public.repsuites_get_my_memberships(uuid) from public, anon, authenticated;
revoke all on function public.repsuites_password_status(uuid) from public, anon, authenticated;
revoke all on function public.repsuites_record_app_error(text, text, text) from public, anon, authenticated;
revoke all on function public.repsuites_tenant_access(uuid) from public, anon;
grant execute on function public.repsuites_get_my_memberships(uuid) to service_role;
grant execute on function public.repsuites_password_status(uuid) to service_role;
grant execute on function public.repsuites_record_app_error(text, text, text) to service_role;
grant execute on function public.repsuites_tenant_access(uuid) to authenticated, service_role;
