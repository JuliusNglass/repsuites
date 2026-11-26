-- Each growth lead's own SparkOps booking link (from the SparkOps crm-event
-- reply), so follow-up texts and pages send them to book in SparkOps instead
-- of the GHL calendar. Service-role only.
create table if not exists public.growth_booking (
  email text,
  phone text,
  book_url text not null,
  created_at timestamptz not null default now()
);
create index if not exists growth_booking_email_idx on public.growth_booking (lower(email));
create index if not exists growth_booking_phone_idx on public.growth_booking (phone);
alter table public.growth_booking enable row level security;
revoke all on public.growth_booking from public, anon, authenticated;
grant select, insert, update on public.growth_booking to service_role;
