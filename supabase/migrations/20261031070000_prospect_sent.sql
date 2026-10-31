-- Lead generator: record when a message was really sent, and how. Opens only
-- count after sending, and link-preview bots are skipped in the Worker.
-- Additive, plus a one-off clean of opens that came from tests and bots.

alter table public.prospects
  add column if not exists sent_at timestamptz,
  add column if not exists sent_via text
    check (sent_via is null or sent_via in ('whatsapp', 'email', 'text', 'copy', 'manual'));

-- Count a report view only after the message was sent. The first view moves
-- a "sent" prospect to "opened" (never straight from "new").
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
         stage = case when stage = 'sent' then 'opened' else stage end,
         updated_at = now()
   where report_token = p_token
     and sent_at is not null;
end
$$;
revoke all on function public.repsuites_report_opened(text) from public, anon, authenticated;
grant execute on function public.repsuites_report_opened(text) to service_role;

-- One-off: nothing is marked sent yet, so every open and play so far was a
-- test or a link-preview bot. Later stages (replied, booked, won, lost) stay.
update public.prospects
   set opens = 0,
       first_opened_at = null,
       last_opened_at = null,
       video_first_played_at = null,
       video_last_played_at = null,
       video_plays = 0,
       video_max_percent = 0,
       stage = case when stage in ('sent', 'opened') then 'new' else stage end
 where sent_at is null;
