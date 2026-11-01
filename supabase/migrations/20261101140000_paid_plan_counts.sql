-- "Most popular" on the prices page is backed by real numbers.
-- Additive: one read-only function. It returns a count of active paying
-- subscriptions per plan and no customer data. Trials ('trialing'),
-- 'past_due' and cancelled subscriptions are not counted.
create or replace function public.repsuites_paid_plan_counts()
returns table (plan text, subscriptions bigint)
language sql stable security definer set search_path = '' as $$
  select b.plan, count(*)::bigint
    from public.tenant_billing b
   where b.status = 'active'
     and b.plan is not null
   group by b.plan;
$$;
revoke all on function public.repsuites_paid_plan_counts() from public, anon, authenticated;
grant execute on function public.repsuites_paid_plan_counts() to service_role;
