-- A prospect can sign in with Google once from their report to add their
-- real profile figures. We keep the figures, never the access.
alter table public.prospects
  add column if not exists gbp_snapshot jsonb,
  add column if not exists gbp_connected_at timestamptz;
