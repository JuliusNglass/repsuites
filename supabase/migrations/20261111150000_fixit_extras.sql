-- The buyer's optional answers on the Fix-It Pack thank-you page.
alter table public.fixit_orders add column if not exists extras jsonb;
