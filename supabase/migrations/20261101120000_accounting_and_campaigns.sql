-- Review requests, part 3. Additive only.
-- A. Accounting connections (QuickBooks Online, Xero, FreeAgent): "invoice
--    paid" queues a review request. Tokens live in Vault (one secret per
--    business and provider), never in a table. Webhooks only nudge a poll;
--    the poll (also hourly as a fallback) reads paid invoices since a cursor.
-- B. "Ask past customers" campaigns: a list trickles into review_requests at
--    a gentle daily rate, and stops itself on high bounces or unsubscribes.

create table if not exists public.accounting_connections (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('quickbooks', 'xero', 'freeagent')),
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect')),
  account_id text check (account_id is null or char_length(account_id) <= 200),
  account_name text check (account_name is null or char_length(account_name) <= 200),
  sync_cursor timestamptz not null default now(), -- invoices paid/updated after this
  next_poll_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  last_error_at timestamptz,
  queued_total integer not null default 0,
  connected_by uuid,
  connected_at timestamptz not null default now(),
  primary key (tenant_id, provider)
);
create index if not exists accounting_connections_account
  on public.accounting_connections (provider, account_id);
create index if not exists accounting_connections_due
  on public.accounting_connections (next_poll_at) where status = 'connected';

create table if not exists public.review_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'paused', 'stopped', 'finished')),
  daily_rate integer not null default 25 check (daily_rate between 10 and 100),
  message text not null check (char_length(message) between 10 and 600),
  email_subject text not null check (char_length(email_subject) between 3 and 150),
  total integer not null default 0 check (total between 0 and 2000),
  lawful_basis_confirmed_at timestamptz not null,
  stop_reason text check (stop_reason is null or char_length(stop_reason) <= 300),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists review_campaigns_tenant on public.review_campaigns (tenant_id, created_at desc);
create index if not exists review_campaigns_running on public.review_campaigns (status) where status = 'running';

create table if not exists public.review_campaign_contacts (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.review_campaigns(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text check (name is null or char_length(name) <= 80),
  email text check (email is null or char_length(email) <= 200),
  phone text check (phone is null or char_length(phone) <= 30),
  last_job_date date,
  status text not null default 'waiting' check (status in ('waiting', 'queued')),
  queued_at timestamptz
);
create index if not exists review_campaign_contacts_next
  on public.review_campaign_contacts (campaign_id, status, id);
create index if not exists review_campaign_contacts_queued
  on public.review_campaign_contacts (campaign_id, queued_at) where queued_at is not null;

alter table public.review_requests
  add column if not exists campaign_id uuid references public.review_campaigns(id) on delete set null,
  add column if not exists message text check (message is null or char_length(message) <= 600),
  add column if not exists email_subject text check (email_subject is null or char_length(email_subject) <= 150),
  add column if not exists email_id text check (email_id is null or char_length(email_id) <= 100),
  add column if not exists bounced_at timestamptz;
create index if not exists review_requests_campaign
  on public.review_requests (campaign_id, created_at) where campaign_id is not null;
create index if not exists review_requests_email_id
  on public.review_requests (email_id) where email_id is not null;

do $$
declare t text;
begin
  foreach t in array array['accounting_connections', 'review_campaigns', 'review_campaign_contacts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
grant usage on sequence public.review_campaign_contacts_id_seq to service_role;

-- Vault helpers, limited to names repsuites_acct_<provider>:<tenant uuid>.
-- The secret is a small JSON with the access and refresh tokens.
create or replace function public.repsuites_acct_store(p_name text, p_token text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_name !~ '^repsuites_acct_(quickbooks|xero|freeagent):[0-9a-f-]{36}$' then
    raise exception 'Bad name' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 12000 then
    raise exception 'Bad token' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_token, p_name, 'RepSuites accounting access for one business');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
  return true;
end
$$;

create or replace function public.repsuites_acct_token(p_name text)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_name !~ '^repsuites_acct_(quickbooks|xero|freeagent):[0-9a-f-]{36}$' then return null; end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = p_name limit 1;
  return v;
end
$$;

create or replace function public.repsuites_acct_forget(p_name text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_name !~ '^repsuites_acct_(quickbooks|xero|freeagent):[0-9a-f-]{36}$' then return false; end if;
  delete from vault.secrets where name = p_name;
  return true;
end
$$;

revoke all on function public.repsuites_acct_store(text, text) from public, anon, authenticated;
revoke all on function public.repsuites_acct_token(text) from public, anon, authenticated;
revoke all on function public.repsuites_acct_forget(text) from public, anon, authenticated;
grant execute on function public.repsuites_acct_store(text, text) to service_role;
grant execute on function public.repsuites_acct_token(text) to service_role;
grant execute on function public.repsuites_acct_forget(text) to service_role;

-- Every 10 minutes: only calls the app when a connection is due a poll (a
-- webhook nudged it, or its hourly check is due) or a campaign is running.
create or replace function repsuites_private.run_review_automation()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  if not exists (
    select 1 from public.accounting_connections where status = 'connected' and next_poll_at <= now()
  ) and not exists (
    select 1 from public.review_campaigns where status = 'running'
  ) then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/api/internal/review-automation',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
revoke all on function repsuites_private.run_review_automation() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-review-automation';
  perform cron.schedule('repsuites-review-automation', '1,11,21,31,41,51 * * * *',
                        'select repsuites_private.run_review_automation()');
end $$;
