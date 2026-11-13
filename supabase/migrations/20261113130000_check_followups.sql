-- Free Google Check follow-ups: one row per step per lead (sent, failed or
-- stopped). Service-role only (the app checks everything in code).
create table if not exists public.check_followups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  step smallint not null check (step between 1 and 3),
  channel text not null check (channel in ('sms', 'email', 'none')),
  status text not null check (char_length(status) <= 40),
  created_at timestamptz not null default now(),
  unique (lead_id, step)
);
alter table public.check_followups enable row level security;
revoke all on public.check_followups from public, anon, authenticated;
grant select, insert, update on public.check_followups to service_role;

-- Already followed up by hand on 12-13 Nov 2026: skip those steps.
insert into public.check_followups (lead_id, step, channel, status)
select l.id, s.step, 'sms', 'sent_manual'
  from public.leads l
  join (values ('cleaningdivaservices@gmail.com', 1), ('cleaningdivaservices@gmail.com', 2),
               ('bbbuffngo@gmail.com', 1)) as s(email, step)
    on lower(l.email) = s.email
on conflict (lead_id, step) do nothing;

-- Every hour at :11. The app only sends 9am-7pm UK time, Monday to Saturday.
create or replace function repsuites_private.run_check_followups()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  return net.http_post(
    url := v_url || '/api/internal/check-followups',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
revoke all on function repsuites_private.run_check_followups() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'repsuites-check-followups';
  perform cron.schedule('repsuites-check-followups', '11 * * * *', 'select repsuites_private.run_check_followups()');
end $$;
