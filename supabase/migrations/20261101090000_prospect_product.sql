-- Which product a prospect is being sold: RepSuites (Google reviews and
-- visibility) or SparkOps (operations hub for cleaning businesses). The
-- Prospects page switches between the two pipelines, and /r/<token> renders
-- the matching report. Additive only: every existing row stays RepSuites.
alter table public.prospects
  add column if not exists product text not null default 'repsuites';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospects_product_check'
  ) then
    alter table public.prospects
      add constraint prospects_product_check check (product in ('repsuites', 'sparkops'));
  end if;
end
$$;

create index if not exists prospects_product_updated_idx
  on public.prospects (product, updated_at desc);
