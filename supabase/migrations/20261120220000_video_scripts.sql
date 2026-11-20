-- Explainer video orders: brief -> script -> client approval -> render.
-- Service-role only (the app checks the approval token itself).
create table if not exists public.video_orders (
  id uuid primary key default gen_random_uuid(),
  token text not null unique check (char_length(token) between 32 and 64),
  session_id text not null unique check (char_length(session_id) <= 255),
  pack text not null check (pack in ('one', 'three')),
  name text not null default '' check (char_length(name) <= 120),
  business text not null default '' check (char_length(business) <= 160),
  email text not null default '' check (char_length(email) <= 254),
  phone text not null default '' check (char_length(phone) <= 40),
  contact_id text check (char_length(contact_id) <= 64),
  brief jsonb not null default '{}'::jsonb,
  script jsonb,
  status text not null default 'writing'
    check (status in ('writing', 'sent', 'changes', 'approved', 'rendering', 'ready', 'delivered', 'stuck')),
  round smallint not null default 0 check (round between 0 and 10),
  feedback jsonb not null default '[]'::jsonb,
  reminders smallint not null default 0 check (reminders between 0 and 5),
  sent_at timestamptz,
  approved_at timestamptz,
  video_url text check (char_length(video_url) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists video_orders_status_idx on public.video_orders (status, sent_at);
alter table public.video_orders enable row level security;
revoke all on public.video_orders from public, anon, authenticated;
grant select, insert, update on public.video_orders to service_role;

-- Reminders: every 30 minutes. The app only sends 9am-7pm UK time, Monday to Saturday.
create or replace function repsuites_private.run_video_reminders()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  return net.http_post(
    url := v_url || '/api/internal/video-orders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{"action":"reminders"}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
revoke all on function repsuites_private.run_video_reminders() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-video-reminders';
  perform cron.schedule('repsuites-video-reminders', '*/30 * * * *', 'select repsuites_private.run_video_reminders()');
end $$;
