-- Feedback page behind every printed QR code (/feedback/<id>).
-- Google-compliant: every customer sees every review button (no rating
-- question first, no sending unhappy customers away from public reviews).
-- Each business lists one or more review sites in its preferred order; the
-- first is the big button. Anyone can also send private feedback, which goes
-- to the business's owners by email and into their dashboard.
-- Additive only.

create table if not exists public.review_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  platform text not null check (platform in
    ('google', 'facebook', 'tripadvisor', 'trustpilot', 'yelp', 'booking', 'other')),
  label text check (label is null or char_length(label) between 1 and 60),
  url text not null check (url ~ '^https://' and char_length(url) <= 600),
  position integer not null default 0 check (position between 0 and 99),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, url)
);
create index if not exists review_links_tenant on public.review_links (tenant_id, position);

create table if not exists public.private_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  qr_id uuid references public.qr_links(id) on delete set null,
  name text check (name is null or char_length(name) <= 120),
  contact text check (contact is null or char_length(contact) <= 200),
  message text not null check (char_length(message) between 2 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists private_feedback_tenant on public.private_feedback (tenant_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['review_links','private_feedback'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- Who to tell about private feedback: the business's owners and admins.
create or replace function public.repsuites_owner_emails(p_tenant uuid)
returns text[] language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  return coalesce((
    select array_agg(distinct u.email)
      from public.tenant_memberships m
      join auth.users u on u.id = m.user_id
     where m.tenant_id = p_tenant and m.active and m.role in ('owner', 'admin')
       and u.email is not null and u.email !~ '@(repsuites\.app|scan\.internal)$'
  ), '{}');
end
$$;
revoke all on function public.repsuites_owner_emails(uuid) from public, anon, authenticated;
grant execute on function public.repsuites_owner_emails(uuid) to service_role;
