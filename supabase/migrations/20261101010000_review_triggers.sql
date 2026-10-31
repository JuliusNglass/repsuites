-- Review requests, part 2: automatic triggers (a webhook per business, for
-- "job done" or "invoice paid"), a "don't ask the same customer again for"
-- window, two reminders on set days that stop on real signals (clicked a
-- review site, left private feedback, a matching Google review, unsubscribed),
-- opt-outs per business, and quiet hours. Additive only.

alter table public.review_request_settings
  add column if not exists trigger_token text unique
    check (trigger_token is null or trigger_token ~ '^[A-Za-z0-9_-]{24,64}$'),
  add column if not exists cooldown_days integer not null default 90
    check (cooldown_days in (60, 90, 180)),
  add column if not exists reminder1_days integer not null default 3
    check (reminder1_days between 1 and 30),
  add column if not exists reminder2_days integer not null default 7
    check (reminder2_days between 2 and 60),
  add column if not exists quiet_start integer not null default 20
    check (quiet_start between 0 and 23),
  add column if not exists quiet_end integer not null default 9
    check (quiet_end between 0 and 23);

-- New businesses get two reminders (day 3 and day 7) by default.
alter table public.review_request_settings alter column max_reminders set default 2;

alter table public.review_requests
  add column if not exists phone_key text check (phone_key is null or phone_key ~ '^[0-9]{6,15}$'),
  add column if not exists event text
    check (event is null or event in ('job_done', 'invoice_paid', 'manual')),
  add column if not exists external_id text check (external_id is null or char_length(external_id) <= 200),
  add column if not exists first_sent_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists feedback_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists unsubscribed_at timestamptz,
  add column if not exists skip_reason text
    check (skip_reason is null or skip_reason in ('asked_recently', 'unsubscribed'));

-- "skipped" joins the allowed statuses (a superset of the old list).
alter table public.review_requests drop constraint if exists review_requests_status_check;
alter table public.review_requests add constraint review_requests_status_check
  check (status in ('due', 'waiting', 'opened', 'finished', 'stopped', 'skipped'));

create unique index if not exists review_requests_external
  on public.review_requests (tenant_id, external_id) where external_id is not null;
create index if not exists review_requests_email
  on public.review_requests (tenant_id, email, created_at desc) where email is not null;
create index if not exists review_requests_phone_key
  on public.review_requests (tenant_id, phone_key, created_at desc) where phone_key is not null;

-- Customers who unsubscribed from one business's review requests.
create table if not exists public.review_request_optouts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  contact text not null check (char_length(contact) between 3 and 200), -- email (lower case) or phone digits
  created_at timestamptz not null default now(),
  primary key (tenant_id, contact)
);
alter table public.review_request_optouts enable row level security;
revoke all on public.review_request_optouts from public, anon, authenticated;
grant select, insert, update, delete on public.review_request_optouts to service_role;

-- How many reminders actually went out (a reminder can be skipped when the
-- customer already opened the link).
alter table public.review_requests
  add column if not exists reminders_sent integer not null default 0 check (reminders_sent between 0 and 2);
