-- Facebook Page and Instagram posting for "Plan my month" posts.
-- Tokens live in Vault (one secret per business), like the Google token.

create table if not exists public.meta_connections (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  status text not null default 'choose_page'
    check (status in ('choose_page', 'connected', 'needs_reconnect')),
  user_name text,
  meta_user_id text,
  page_id text,
  page_name text,
  ig_user_id text,
  ig_username text,
  pages jsonb not null default '[]'::jsonb, -- choices: [{id, name, igId, igUsername}] (no tokens)
  error text,
  connected_by uuid,
  connected_at timestamptz not null default now()
);
alter table public.meta_connections enable row level security;
revoke all on public.meta_connections from public, anon, authenticated;
grant select, insert, update, delete on public.meta_connections to service_role;

alter table public.google_posts
  add column if not exists fb_enabled boolean not null default true,
  add column if not exists ig_enabled boolean not null default true,
  add column if not exists fb_status text check (fb_status in ('posted', 'failed', 'skipped')),
  add column if not exists fb_error text,
  add column if not exists fb_post_id text,
  add column if not exists ig_status text check (ig_status in ('posted', 'failed', 'skipped')),
  add column if not exists ig_error text,
  add column if not exists ig_media_id text;

-- Vault helpers, limited to names starting repsuites_meta_ (user and page tokens).
create or replace function public.repsuites_meta_store(p_name text, p_token text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_name !~ '^repsuites_meta_(user|page):[0-9a-f-]{36}$' then
    raise exception 'Bad name' using errcode = '22023';
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 4096 then
    raise exception 'Bad token' using errcode = '22023';
  end if;
  select id into v_id from vault.secrets where name = p_name;
  if v_id is null then
    perform vault.create_secret(p_token, p_name, 'RepSuites Facebook/Instagram access for one business');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
  return true;
end
$$;

create or replace function public.repsuites_meta_token(p_name text)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare v text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_name !~ '^repsuites_meta_(user|page):[0-9a-f-]{36}$' then return null; end if;
  select decrypted_secret into v from vault.decrypted_secrets where name = p_name limit 1;
  return v;
end
$$;

create or replace function public.repsuites_meta_forget(p_tenant uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  delete from vault.secrets
   where name in ('repsuites_meta_user:' || p_tenant::text, 'repsuites_meta_page:' || p_tenant::text);
  return true;
end
$$;

revoke all on function public.repsuites_meta_store(text, text) from public, anon, authenticated;
revoke all on function public.repsuites_meta_token(text) from public, anon, authenticated;
revoke all on function public.repsuites_meta_forget(uuid) from public, anon, authenticated;
grant execute on function public.repsuites_meta_store(text, text) to service_role;
grant execute on function public.repsuites_meta_token(text) to service_role;
grant execute on function public.repsuites_meta_forget(uuid) to service_role;

-- Data deletion requests from Meta (status page shows the code).
create table if not exists public.meta_deletion_requests (
  code text primary key,
  meta_user_id text,
  created_at timestamptz not null default now(),
  done_at timestamptz
);
alter table public.meta_deletion_requests enable row level security;
revoke all on public.meta_deletion_requests from public, anon, authenticated;
grant select, insert, update, delete on public.meta_deletion_requests to service_role;

