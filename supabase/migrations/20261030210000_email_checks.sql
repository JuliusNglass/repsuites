-- Self-serve sign-ups confirm their email with a 6-digit code. Only people
-- who signed up at /start get a row; everyone else counts as confirmed.
create table if not exists public.email_checks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  code_hash text,
  sent_at timestamptz,
  sends_today int not null default 0,
  attempts int not null default 0,
  verified_at timestamptz,
  verified_by text,
  created_at timestamptz not null default now()
);
alter table public.email_checks enable row level security;
-- No policies: only the server (service role) reads or writes this table.

-- Accounts that never confirm within 14 days are switched off (memberships
-- made inactive). Reversible: set active = true again.
create or replace function repsuites_private.switch_off_unconfirmed()
returns int language sql security definer set search_path = '' as $$
  with gone as (
    update public.tenant_memberships m set active = false
    from public.email_checks e
    where e.user_id = m.user_id and e.verified_at is null
      and e.created_at < now() - interval '14 days' and m.active
    returning 1
  ) select count(*)::int from gone;
$$;
revoke all on function repsuites_private.switch_off_unconfirmed() from public, anon, authenticated;
select cron.schedule('repsuites-unconfirmed-email', '17 3 * * *', $$select repsuites_private.switch_off_unconfirmed()$$);
