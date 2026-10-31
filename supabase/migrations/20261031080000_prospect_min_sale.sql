-- "What 1 more customer is worth" on the prospect report: the lowest usual
-- sale (in pence, or kobo for Nigeria) and whether it is per day or per week.
-- Empty means the report uses the default for the niche.
alter table public.prospects
  add column if not exists min_sale_pence integer check (min_sale_pence is null or min_sale_pence >= 0),
  add column if not exists sale_period text check (sale_period is null or sale_period in ('day', 'week'));
