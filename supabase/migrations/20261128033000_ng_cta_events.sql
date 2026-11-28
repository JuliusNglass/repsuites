-- Button wording test on /ng: one row per view, button click and checkout start.
create table if not exists public.ng_cta_events (
  id bigserial primary key,
  variant text not null check (variant in ('a','b')),
  kind text not null check (kind in ('view','click','start')),
  price int,
  created_at timestamptz not null default now()
);
alter table public.ng_cta_events enable row level security;
revoke all on public.ng_cta_events from public, anon, authenticated;
grant select, insert on public.ng_cta_events to service_role;
grant usage, select on sequence public.ng_cta_events_id_seq to service_role;
