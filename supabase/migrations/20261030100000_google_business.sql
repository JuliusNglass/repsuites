-- Phase 2a: Google Business Profile for each business.
--
-- An owner connects the business's Google profile once (Google sign-in).
-- RepSuites keeps the Google refresh token in Vault, brings in new reviews
-- every 10 minutes, drafts or sends replies (per the business's settings),
-- publishes Google posts at the time chosen, and emails a monthly report.
-- Additive only.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists repsuites_private;

-- ---------- the scheduler: calls the app server with a shared secret ----------

create table if not exists repsuites_private.cron_runner (
  id boolean primary key default true check (id),
  app_url text check (app_url is null or app_url ~ '^https://[a-z0-9.-]+$')
);
insert into repsuites_private.cron_runner (id, app_url) values (true, 'https://repsuites.com')
  on conflict (id) do nothing;
alter table repsuites_private.cron_runner enable row level security;
revoke all on repsuites_private.cron_runner from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'repsuites_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
      'repsuites_cron_token', 'Shared secret for scheduled RepSuites jobs');
  end if;
end
$$;

create or replace function repsuites_private.cron_token()
returns text language sql stable security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'repsuites_cron_token' limit 1 $$;

-- App server: is this the right secret? (It never reads the secret itself.)
create or replace function public.repsuites_cron_token_ok(p_token text)
returns boolean language sql stable security definer set search_path = ''
as $$ select p_token is not null and p_token = repsuites_private.cron_token() $$;

revoke all on function repsuites_private.cron_token() from public, anon, authenticated;
revoke all on function public.repsuites_cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.repsuites_cron_token_ok(text) to service_role;

-- ---------- Google data ----------

create table if not exists public.google_connections (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  google_email text check (google_email is null or char_length(google_email) <= 320),
  account_name text check (account_name is null or account_name ~ '^accounts/[0-9]+$'),
  location_name text check (location_name is null or location_name ~ '^locations/[0-9]+$'),
  location_title text check (location_title is null or char_length(location_title) <= 200),
  status text not null default 'choose_location'
    check (status in ('connected', 'choose_location', 'needs_reconnect')),
  error text check (error is null or char_length(error) <= 300),
  connected_by uuid,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);

create table if not exists public.google_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  review_name text not null unique check (char_length(review_name) <= 300),
  reviewer text check (reviewer is null or char_length(reviewer) <= 200),
  stars integer check (stars is null or stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 5000),
  created_at_google timestamptz,
  updated_at_google timestamptz,
  reply text check (reply is null or char_length(reply) <= 4096),
  reply_at timestamptz,
  draft text check (draft is null or char_length(draft) <= 4096),
  error text check (error is null or char_length(error) <= 300),
  auto_replied boolean not null default false,
  synced_at timestamptz not null default now()
);
create index if not exists google_reviews_tenant on public.google_reviews (tenant_id, created_at_google desc);

create table if not exists public.google_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  summary text not null check (char_length(summary) between 1 and 1500),
  action_type text check (action_type is null or action_type in ('BOOK', 'LEARN_MORE', 'CALL', 'SIGN_UP')),
  action_url text check (action_url is null or (char_length(action_url) <= 500 and action_url ~ '^https://')),
  publish_at timestamptz not null default now(),
  status text not null default 'scheduled' check (status in ('scheduled', 'posted', 'failed', 'cancelled')),
  google_name text check (google_name is null or char_length(google_name) <= 300),
  error text check (error is null or char_length(error) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  posted_at timestamptz
);
create index if not exists google_posts_due on public.google_posts (status, publish_at);
create index if not exists google_posts_tenant on public.google_posts (tenant_id, publish_at desc);

-- Replies: off (drafts on request), suggest (draft every new review), auto
-- (answer new reviews at or above auto_min_stars). Only reviews after
-- mode_since are handled automatically.
create table if not exists public.google_reply_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  mode text not null default 'off' check (mode in ('off', 'suggest', 'auto')),
  auto_min_stars integer not null default 4 check (auto_min_stars between 1 and 5),
  mode_since timestamptz not null default now(),
  template_positive text check (template_positive is null or char_length(template_positive) <= 1500),
  template_neutral text check (template_neutral is null or char_length(template_neutral) <= 1500),
  template_negative text check (template_negative is null or char_length(template_negative) <= 1500),
  about text check (about is null or char_length(about) <= 1000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- Monthly report by email, on the 4th to 6th for the month before.
create table if not exists public.google_report_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  enabled boolean not null default false,
  email text check (email is null or (char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  last_sent_month text check (last_sent_month is null or last_sent_month ~ '^[0-9]{4}-[0-9]{2}$'),
  last_error text check (last_error is null or char_length(last_error) <= 300),
  updated_by uuid,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['google_connections','google_reviews','google_posts',
                           'google_reply_settings','google_report_settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ---------- refresh tokens in Vault, one secret per business ----------

create or replace function public.repsuites_google_store_refresh(p_tenant uuid, p_token text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_name text := 'repsuites_google_refresh:' || p_tenant::text; v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 2048 then
    raise exception 'Bad token' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    perform vault.create_secret(p_token, v_name, 'RepSuites Google Business Profile access for one business');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
  return true;
end
$$;

create or replace function public.repsuites_google_refresh_for(p_tenant uuid)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select decrypted_secret into v from vault.decrypted_secrets
   where name = 'repsuites_google_refresh:' || p_tenant::text limit 1;
  return v;
end
$$;

create or replace function public.repsuites_google_forget(p_tenant uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  delete from vault.secrets where name = 'repsuites_google_refresh:' || p_tenant::text;
  return true;
end
$$;

revoke all on function public.repsuites_google_store_refresh(uuid, text) from public, anon, authenticated;
revoke all on function public.repsuites_google_refresh_for(uuid) from public, anon, authenticated;
revoke all on function public.repsuites_google_forget(uuid) from public, anon, authenticated;
grant execute on function public.repsuites_google_store_refresh(uuid, text) to service_role;
grant execute on function public.repsuites_google_refresh_for(uuid) to service_role;
grant execute on function public.repsuites_google_forget(uuid) to service_role;

-- ---------- scheduled jobs (only call the app when there is work) ----------

create or replace function repsuites_private.run_google_sync()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  if not exists (select 1 from public.google_connections where status = 'connected') then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/api/internal/google',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;

create or replace function repsuites_private.run_google_report()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  if not exists (
    select 1 from public.google_report_settings s
      join public.google_connections c on c.tenant_id = s.tenant_id and c.status = 'connected'
     where s.enabled and s.email is not null
       and s.last_sent_month is distinct from to_char(now() - interval '1 month', 'YYYY-MM')
  ) then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/api/internal/google-report',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
revoke all on function repsuites_private.run_google_sync() from public, anon, authenticated;
revoke all on function repsuites_private.run_google_report() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('repsuites-google', 'repsuites-google-report');
  perform cron.schedule('repsuites-google', '*/10 * * * *', 'select repsuites_private.run_google_sync()');
  perform cron.schedule('repsuites-google-report', '5 8-12 4-6 * *', 'select repsuites_private.run_google_report()');
end
$$;
