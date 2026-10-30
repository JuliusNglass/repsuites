-- Each business's brand colours as hex codes (#rrggbb, lower case).
create table if not exists public.business_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  primary_hex text check (primary_hex ~ '^#[0-9a-f]{6}$'),
  secondary_hex text check (secondary_hex ~ '^#[0-9a-f]{6}$'),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.business_branding enable row level security;
revoke all on public.business_branding from public, anon, authenticated;
grant select, insert, update, delete on public.business_branding to service_role;
