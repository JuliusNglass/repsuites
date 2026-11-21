-- Tracked nurture link clicks. Service-role only.
create table if not exists public.link_clicks (
  id bigint generated always as identity primary key,
  code text not null check (char_length(code) <= 40),
  contact_id text check (char_length(contact_id) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists link_clicks_contact_idx on public.link_clicks (contact_id, created_at);
alter table public.link_clicks enable row level security;
revoke all on public.link_clicks from public, anon, authenticated;
grant select, insert on public.link_clicks to service_role;
