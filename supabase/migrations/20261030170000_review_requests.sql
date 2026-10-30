-- Review requests: ask each customer for a review once, with gentle
-- reminders, by email (sent automatically) or by WhatsApp / text (sent by the
-- business from its own phone with one tap, so no message fees and no Meta
-- approval anywhere in the world).

create table if not exists public.review_request_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  country_code text not null default '44' check (country_code ~ '^[0-9]{1,4}$'),
  first_delay_hours integer not null default 2 check (first_delay_hours between 0 and 168),
  reminder_days integer not null default 3 check (reminder_days between 1 and 30),
  max_reminders integer not null default 1 check (max_reminders between 0 and 2),
  message text,
  reminder_message text,
  email_subject text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token text not null unique,
  name text,
  phone text,
  email text,
  channel text not null check (channel in ('whatsapp', 'sms', 'email')),
  status text not null default 'due' check (status in ('due', 'waiting', 'opened', 'finished', 'stopped')),
  step integer not null default 0, -- 0 = first ask, 1 = first reminder, 2 = second
  due_at timestamptz not null default now(),
  last_sent_at timestamptz,
  opened_at timestamptz,
  source text not null default 'manual',
  error text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists review_requests_due on public.review_requests (status, due_at);
create index if not exists review_requests_tenant on public.review_requests (tenant_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['review_request_settings', 'review_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Every 10 minutes: send due email requests.
create or replace function repsuites_private.run_review_requests()
returns bigint language plpgsql security definer set search_path = ''
as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  if not exists (
    select 1 from public.review_requests
     where status in ('due', 'waiting') and channel = 'email' and due_at <= now()
  ) then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/api/internal/review-requests',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
revoke all on function repsuites_private.run_review_requests() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-review-requests';
  perform cron.schedule('repsuites-review-requests', '3,13,23,33,43,53 * * * *',
                        'select repsuites_private.run_review_requests()');
end $$;
