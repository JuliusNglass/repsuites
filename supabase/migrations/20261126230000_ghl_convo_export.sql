create table if not exists public.ghl_convo_export (
  id text primary key,
  contact_id text,
  contact_name text,
  email text,
  phone text,
  messages jsonb not null default '[]'::jsonb,
  exported_at timestamptz not null default now()
);
create table if not exists public.ghl_convo_export_state (
  id int primary key default 1,
  cursor jsonb,
  done boolean not null default false,
  copied int not null default 0
);
insert into public.ghl_convo_export_state (id) values (1) on conflict do nothing;
alter table public.ghl_convo_export enable row level security;
alter table public.ghl_convo_export_state enable row level security;
revoke all on public.ghl_convo_export, public.ghl_convo_export_state from public, anon, authenticated;
grant select, insert, update on public.ghl_convo_export, public.ghl_convo_export_state to service_role;
