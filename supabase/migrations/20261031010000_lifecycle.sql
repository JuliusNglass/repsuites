-- Customer lifecycle: who is using RepSuites, who has gone quiet, and the
-- follow-up and upsell emails. Server-only tables (RLS on, no policies).

-- Last time the business's own people (not the Accelur8 team) opened the app.
create table if not exists public.tenant_activity (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  last_seen_at timestamptz,
  unsubscribed_at timestamptz,
  unsub_token uuid not null default gen_random_uuid() unique
);
alter table public.tenant_activity enable row level security;

-- Every follow-up email sent (mode 'live') or that would have been sent
-- ('preview', only in Julius's digest).
create table if not exists public.lifecycle_sends (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  type text not null,
  mode text not null check (mode in ('live', 'preview')),
  to_email text,
  sent_at timestamptz not null default now()
);
create index if not exists lifecycle_sends_tenant on public.lifecycle_sends (tenant_id, sent_at desc);
alter table public.lifecycle_sends enable row level security;

-- One row of settings. mode 'preview': customers get nothing, Julius gets a
-- daily list of what would be sent. mode 'live': customers get the emails.
create table if not exists public.lifecycle_settings (
  id boolean primary key default true check (id),
  mode text not null default 'preview' check (mode in ('preview', 'live')),
  last_weekly_at timestamptz,
  last_daily_at timestamptz
);
insert into public.lifecycle_settings (id) values (true) on conflict do nothing;
alter table public.lifecycle_settings enable row level security;

-- Called on dashboard load: marks the business active, at most once an hour,
-- and never for the Accelur8 team.
create or replace function public.repsuites_touch_activity(p_tenant uuid, p_user uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.tenant_activity (tenant_id, last_seen_at)
  select p_tenant, now()
  where not exists (select 1 from public.agency_users a where a.user_id = p_user)
    and exists (select 1 from public.tenant_memberships m
                where m.tenant_id = p_tenant and m.user_id = p_user and m.active)
  on conflict (tenant_id) do update set last_seen_at = now()
  where public.tenant_activity.last_seen_at is null
     or public.tenant_activity.last_seen_at < now() - interval '1 hour';
$$;
revoke all on function public.repsuites_touch_activity(uuid, uuid) from public, anon, authenticated;
grant execute on function public.repsuites_touch_activity(uuid, uuid) to service_role;

-- One row per business with the facts the follow-ups need.
create or replace function public.repsuites_lifecycle_facts()
returns table (
  tenant_id uuid, name text, created_at timestamptz, plan text, billing_status text,
  legacy boolean, self_serve boolean, owner_email text, owner_name text,
  email_confirmed boolean, last_seen_at timestamptz, unsubscribed boolean, unsub_token uuid,
  google_connected boolean, scans_total bigint, scans_7d bigint, feedback_total bigint,
  feedback_7d bigint, requests_sent bigint, replies_total bigint, orders_paid bigint
) language sql stable security definer set search_path = '' as $$
  with owner as (
    select distinct on (m.tenant_id) m.tenant_id, u.id as user_id, lower(u.email) as email
      from public.tenant_memberships m
      join auth.users u on u.id = m.user_id
     where m.active and m.role in ('owner', 'admin')
       and not exists (select 1 from public.agency_users a where a.user_id = m.user_id)
     order by m.tenant_id, (m.role = 'owner') desc, m.created_at
  )
  select t.id, t.name, t.created_at, coalesce(p.plan, 'free'), b.status,
         t.legacy_user_id is not null, coalesce(t.settings->>'source', '') = 'self_serve',
         o.email, nullif(t.settings->>'owner_name', ''),
         not exists (select 1 from public.email_checks e where e.user_id = o.user_id and e.verified_at is null),
         a.last_seen_at, a.unsubscribed_at is not null, a.unsub_token,
         exists (select 1 from public.google_connections g where g.tenant_id = t.id and g.status = 'connected'),
         (select count(*) from public.qr_scans s join public.qr_links q on q.id = s.qr_id where q.tenant_id = t.id),
         (select count(*) from public.qr_scans s join public.qr_links q on q.id = s.qr_id
           where q.tenant_id = t.id and s.scanned_at > now() - interval '7 days'),
         (select count(*) from public.private_feedback f where f.tenant_id = t.id),
         (select count(*) from public.private_feedback f where f.tenant_id = t.id and f.created_at > now() - interval '7 days'),
         (select count(*) from public.review_requests r where r.tenant_id = t.id and r.last_sent_at is not null),
         (select count(*) from public.google_reviews r where r.tenant_id = t.id and r.reply is not null),
         (select count(*) from public.shop_orders s where s.tenant_id = t.id and s.paid_at is not null)
    from public.tenants t
    left join public.tenant_plans p on p.tenant_id = t.id
    left join public.tenant_billing b on b.tenant_id = t.id
    left join public.tenant_activity a on a.tenant_id = t.id
    left join owner o on o.tenant_id = t.id;
$$;
revoke all on function public.repsuites_lifecycle_facts() from public, anon, authenticated;
grant execute on function public.repsuites_lifecycle_facts() to service_role;

-- Daily at 09:07 UK time-ish (08:07 UTC): the app works out who to email.
create or replace function repsuites_private.run_lifecycle()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  return net.http_post(
    url := v_url || '/api/internal/lifecycle',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
revoke all on function repsuites_private.run_lifecycle() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-lifecycle';
  perform cron.schedule('repsuites-lifecycle', '7 8 * * *', 'select repsuites_private.run_lifecycle()');
end $$;
