-- Accelur8's own contact store, replacing GHL contacts (Nov 2026 GHL exit).
-- Same shape the funnel code used from GHL: id (GHL ids kept for people
-- moved over), names, email, phone, company, tags, custom fields, notes.
-- Service-role only; no client access. Additive.
create table if not exists public.crm_contacts (
  id text primary key,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  source text,
  tags text[] not null default '{}',
  custom jsonb not null default '{}'::jsonb,
  dnd boolean not null default false,
  date_added timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_contacts_tags_idx on public.crm_contacts using gin (tags);
create index if not exists crm_contacts_email_idx on public.crm_contacts (lower(email));
create index if not exists crm_contacts_phone_idx on public.crm_contacts (phone);
create table if not exists public.crm_notes (
  id bigserial primary key,
  contact_id text not null references public.crm_contacts(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.crm_contacts enable row level security;
alter table public.crm_notes enable row level security;
revoke all on public.crm_contacts, public.crm_notes from public, anon, authenticated;
grant select, insert, update on public.crm_contacts, public.crm_notes to service_role;
grant usage, select on sequence public.crm_notes_id_seq to service_role;

-- Add tags without losing existing ones (atomic).
create or replace function public.crm_add_tags(p_id text, p_tags text[])
returns text[] language sql security definer set search_path = '' as $$
  update public.crm_contacts c
     set tags = (select coalesce(array_agg(distinct t), '{}') from unnest(c.tags || p_tags) t),
         updated_at = now()
   where c.id = p_id
  returning c.tags;
$$;
revoke all on function public.crm_add_tags(text, text[]) from public, anon, authenticated;
grant execute on function public.crm_add_tags(text, text[]) to service_role;

-- One-off copy of GHL contacts (runs in small batches from the growth cron).
create table if not exists public.crm_backfill (
  id integer primary key default 1 check (id = 1),
  cursor jsonb,
  done boolean not null default false,
  copied integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.crm_backfill enable row level security;
revoke all on public.crm_backfill from public, anon, authenticated;
grant select, insert, update on public.crm_backfill to service_role;
