-- "We do it for you" plan, and the Access help tracker Accelur8 uses to get
-- added as a manager on a business's Google profile.
alter table public.tenant_plans drop constraint if exists tenant_plans_plan_check;
alter table public.tenant_plans add constraint tenant_plans_plan_check
  check (plan = any (array['free','starter','pro','gold','managed']));
alter table public.tenant_billing drop constraint if exists tenant_billing_plan_check;
alter table public.tenant_billing add constraint tenant_billing_plan_check
  check (plan = any (array['starter','pro','gold','managed']));

create table if not exists public.access_help (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','request_sent','waiting','video_booked','done')),
  requested_on date,
  video_on date,
  note text check (char_length(note) <= 1000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.access_help enable row level security;
-- No policies: only the server (service role) reads or writes this table.
