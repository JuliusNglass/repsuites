-- "Plan my month": AI-written Google posts wait as drafts until the owner
-- approves them. Only 'scheduled' posts are published by the 30-minute job.
alter table public.google_posts drop constraint if exists google_posts_status_check;
alter table public.google_posts add constraint google_posts_status_check
  check (status = any (array['draft','scheduled','posted','failed','cancelled']));
alter table public.google_posts drop constraint if exists google_posts_action_type_check;
alter table public.google_posts add constraint google_posts_action_type_check
  check (action_type is null or action_type = any (array['BOOK','LEARN_MORE','CALL','SIGN_UP','ORDER']));
alter table public.google_posts add column if not exists source text not null default 'manual'
  check (source in ('manual','ai'));
