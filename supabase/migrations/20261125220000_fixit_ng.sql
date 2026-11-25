-- Nigeria Fix-it Pack: naira orders paid by Paystack (or Stripe in NGN).
-- Paystack orders reuse stripe_session_id as the order key, stored as
-- "ps_<reference>", so the thank-you page and pack pipeline work unchanged.
alter table public.fixit_orders add column if not exists market text;        -- null (UK) | 'ng'
alter table public.fixit_orders add column if not exists currency text;      -- 'gbp' | 'ngn'
alter table public.fixit_orders add column if not exists amount_minor int;   -- pence or kobo
alter table public.fixit_orders add column if not exists tier text;          -- 'diy' | 'dfy'
alter table public.fixit_orders add column if not exists provider text;      -- 'stripe' | 'paystack'
create index if not exists fixit_orders_market_idx on public.fixit_orders (market, created_at);
