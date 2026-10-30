-- Agency staff (agency_users) can open every business: they get an admin
-- (super_admin) membership for any business they are not already a member of.
create or replace function public.repsuites_get_my_memberships(p_user_id uuid)
returns table(tenant_id uuid, user_id uuid, role text, active boolean, can_clean boolean)
language sql stable security definer set search_path = ''
as $$
  select m.tenant_id, m.user_id, m.role, m.active, m.can_clean
    from public.tenant_memberships m
   where m.user_id = p_user_id and m.active = true
  union all
  select t.id, p_user_id, 'super_admin'::text, true, false
    from public.tenants t
   where exists (select 1 from public.agency_users a where a.user_id = p_user_id)
     and not exists (select 1 from public.tenant_memberships m
                      where m.user_id = p_user_id and m.tenant_id = t.id and m.active);
$$;
revoke all on function public.repsuites_get_my_memberships(uuid) from public, anon, authenticated;
grant execute on function public.repsuites_get_my_memberships(uuid) to service_role;
