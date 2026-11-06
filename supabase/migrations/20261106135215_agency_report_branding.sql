-- Agency-owned report appearance. Prospect reports use the creator's row so
-- public report links never need a tenant relationship.
create table if not exists public.agency_report_branding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  agency_name text not null default 'RepSuites' check (char_length(agency_name) between 1 and 80),
  primary_hex text not null default '#0b1d3a' check (primary_hex ~ '^#[0-9a-f]{6}$'),
  secondary_hex text not null default '#f5b324' check (secondary_hex ~ '^#[0-9a-f]{6}$'),
  logo_url text check (logo_url is null or char_length(logo_url) <= 500),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  updated_at timestamptz not null default now()
);
alter table public.agency_report_branding enable row level security;
revoke all on public.agency_report_branding from public, anon, authenticated;
grant select, insert, update, delete on public.agency_report_branding to service_role;

-- Evidence-linked recommendations remain proposed until an agency user
-- explicitly approves them. No public role can read or change this ledger.
create table if not exists public.prospect_actions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  action_key text not null check (char_length(action_key) between 1 and 120),
  title text not null check (char_length(title) between 1 and 500),
  evidence text check (evidence is null or char_length(evidence) <= 2000),
  status text not null default 'proposed' check (status in ('proposed','approved','in_progress','completed','rejected','verified')),
  assigned_to text check (assigned_to is null or char_length(assigned_to) <= 120),
  due_on date,
  note text check (note is null or char_length(note) <= 2000),
  approved_by uuid,
  approved_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (prospect_id, action_key)
);
create index if not exists prospect_actions_prospect_status
  on public.prospect_actions (prospect_id, status, due_on);
alter table public.prospect_actions enable row level security;
revoke all on public.prospect_actions from public, anon, authenticated;
grant select, insert, update, delete on public.prospect_actions to service_role;

