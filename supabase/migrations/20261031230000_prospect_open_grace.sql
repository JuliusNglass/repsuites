-- Opens in the first 60 seconds after sending are not people: email link
-- scanners and our own tap from the sending app fetch the link right away.
-- Replaces the function from 20261031070000_prospect_sent.sql.
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
     and sent_at is not null
     and now() - sent_at > interval '60 seconds';
end
$$;
revoke all on function public.repsuites_report_opened(text) from public, anon, authenticated;
grant execute on function public.repsuites_report_opened(text) to service_role;

-- The pipeline list is ordered by the last change, and due follow-ups are
-- read on their own.
create index if not exists prospects_updated_at_idx on public.prospects (updated_at desc);
create index if not exists prospects_follow_up_on_idx on public.prospects (follow_up_on)
  where follow_up_on is not null;
