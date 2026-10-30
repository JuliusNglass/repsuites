-- Lead generator (Accelur8 team only): prospects found by searching a business
-- or a niche and town, each with an insight report shared by a private link
-- (/r/<token>), opens tracked, and a simple sales stage with a follow-up date.
-- Additive only.

create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  place_id text not null unique check (char_length(place_id) <= 300),
  name text not null check (char_length(name) between 1 and 200),
  address text check (address is null or char_length(address) <= 300),
  town text check (town is null or char_length(town) <= 120),
  phone text check (phone is null or char_length(phone) <= 40),
  website text check (website is null or char_length(website) <= 300),
  category text check (category is null or char_length(category) <= 120),
  lat double precision,
  lng double precision,
  contact_name text check (contact_name is null or char_length(contact_name) <= 120),
  email text check (email is null or char_length(email) <= 320),
  source text not null default 'search' check (source in ('search', 'niche', 'inbound')),
  stage text not null default 'new'
    check (stage in ('new', 'sent', 'opened', 'replied', 'booked', 'won', 'lost')),
  follow_up_on date,
  notes text check (notes is null or char_length(notes) <= 4000),
  report jsonb,
  report_at timestamptz,
  report_token text unique check (report_token is null or report_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  opens integer not null default 0,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists prospects_stage on public.prospects (stage, follow_up_on);
create index if not exists prospects_created on public.prospects (created_at desc);

alter table public.prospects enable row level security;
revoke all on public.prospects from public, anon, authenticated;
grant select, insert, update, delete on public.prospects to service_role;

-- Count a report view; the first view moves a "sent" prospect to "opened".
create or replace function public.repsuites_report_opened(p_token text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.prospects
     set opens = opens + 1,
         first_opened_at = coalesce(first_opened_at, now()),
         last_opened_at = now(),
         stage = case when stage in ('new', 'sent') then 'opened' else stage end,
         updated_at = now()
   where report_token = p_token;
end
$$;
revoke all on function public.repsuites_report_opened(text) from public, anon, authenticated;
grant execute on function public.repsuites_report_opened(text) to service_role;
