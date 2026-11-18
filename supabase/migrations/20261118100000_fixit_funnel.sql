-- £27 Profile Fix Pack funnel: which offer was bought, the saved card for
-- one-tap upsells, and what the buyer chose after paying.
alter table public.fixit_orders add column if not exists offer text;
alter table public.fixit_orders add column if not exists stripe_customer text;
alter table public.fixit_orders add column if not exists payment_intent text;
alter table public.fixit_orders add column if not exists upsell text;      -- null | 'paid' | 'declined' | 'failed'
alter table public.fixit_orders add column if not exists upsell_pi text;
alter table public.fixit_orders add column if not exists plan text;        -- null | 'managed' | 'growth_year' | 'later'
alter table public.fixit_orders add column if not exists plan_sub text;
