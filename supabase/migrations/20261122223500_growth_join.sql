-- Who tapped the join link for their Fit Call, and who got the "we're on the call" nudge.
create table if not exists public.growth_join (
  appt_id text primary key,
  contact_id text not null,
  start_at timestamptz,
  joined_at timestamptz,
  nudged_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.growth_join enable row level security;
revoke all on public.growth_join from public, anon, authenticated;
grant select, insert, update on public.growth_join to service_role;
