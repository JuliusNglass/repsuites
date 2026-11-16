-- Wake the review-request run for due texts too (Text Pack businesses),
-- not only due emails.
create or replace function repsuites_private.run_review_requests()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare v_url text;
begin
  select app_url into v_url from repsuites_private.cron_runner where id;
  if v_url is null then return null; end if;
  if not exists (
    select 1 from public.review_requests
     where status in ('due', 'waiting') and channel = 'email' and due_at <= now()
  ) and not exists (
    select 1 from public.review_requests r
      join public.review_sms_settings s on s.tenant_id = r.tenant_id and s.enabled and s.monthly_cap > 0
     where r.status in ('due', 'waiting') and r.channel = 'sms' and r.due_at <= now()
  ) then
    return null;
  end if;
  return net.http_post(
    url := v_url || '/api/internal/review-requests',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-repsuites-cron-token', repsuites_private.cron_token()),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end
$$;
