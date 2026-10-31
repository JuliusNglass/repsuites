-- Lead generator: how to reach each prospect. Mobile or landline (mobiles are
-- very likely on WhatsApp), and the email and Facebook/Instagram pages found
-- on their website. Results of the email finder are cached by Google place id
-- so repeat searches are instant; they are re-checked after 30 days.
-- Additive only.

alter table public.prospects
  add column if not exists phone_type text
    check (phone_type is null or phone_type in ('mobile', 'landline', 'unknown', 'none')),
  add column if not exists facebook_url text
    check (facebook_url is null or (facebook_url ~ '^https://' and char_length(facebook_url) <= 300)),
  add column if not exists instagram_url text
    check (instagram_url is null or (instagram_url ~ '^https://' and char_length(instagram_url) <= 300));

create table if not exists public.prospect_contacts (
  place_id text primary key check (char_length(place_id) <= 300),
  website text check (website is null or char_length(website) <= 300),
  email text check (email is null or char_length(email) <= 320),
  emails text[] not null default '{}',
  facebook_url text check (facebook_url is null or char_length(facebook_url) <= 300),
  instagram_url text check (instagram_url is null or char_length(instagram_url) <= 300),
  found_at timestamptz not null default now()
);

alter table public.prospect_contacts enable row level security;
revoke all on public.prospect_contacts from public, anon, authenticated;
grant select, insert, update, delete on public.prospect_contacts to service_role;
