-- WhatsApp-gated free check: keep the search phrase with the lead so the
-- scan can run later (when they reply SEND), and record when it ran.
-- Additive only.
alter table public.leads
  add column if not exists check_keyword text check (check_keyword is null or char_length(check_keyword) <= 60),
  add column if not exists scan_requested_at timestamptz;
