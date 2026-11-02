-- Quality audit (Accelur8 build standard). Additive and safe to re-run.
--
-- A. Index every foreign key used in a lookup (Supabase advisor
--    "unindexed_foreign_keys"). The tables are small today, so a plain
--    CREATE INDEX is quick. Each index matches how the app reads the table:
--    - private_feedback: the review page counts messages per QR code in the
--      last hour (qr_id + created_at), and deleting a QR row checks this FK.
--    - rank_scans: the dashboard lists a business's scans, newest first.
--    - review_campaign_contacts, shop_orders, tenant_domains: tenant_id is
--      checked whenever a business is deleted (ON DELETE CASCADE / SET NULL)
--      and is used in tenant-scoped reads.
create index if not exists private_feedback_qr
  on public.private_feedback (qr_id, created_at desc);
create index if not exists rank_scans_tenant
  on public.rank_scans (tenant_id, run_at desc);
create index if not exists review_campaign_contacts_tenant
  on public.review_campaign_contacts (tenant_id);
create index if not exists shop_orders_tenant
  on public.shop_orders (tenant_id);
create index if not exists tenant_domains_tenant
  on public.tenant_domains (tenant_id);

-- B. Tighten table grants. Every other RepSuites table is reachable only by
--    the server (service_role). These five still carried the default
--    anon/authenticated grants. RLS is on with no policies, so no rows could
--    leak today, but removing the grants means a future policy mistake
--    cannot expose them either. The app only reads and writes these tables
--    with the service key (serviceRead / serviceWrite), so nothing changes
--    for users.
revoke all on table public.access_help from anon, authenticated;
revoke all on table public.email_checks from anon, authenticated;
revoke all on table public.lifecycle_sends from anon, authenticated;
revoke all on table public.lifecycle_settings from anon, authenticated;
revoke all on table public.tenant_activity from anon, authenticated;

-- C. public.repsuites_tenant_access(uuid) stays executable by authenticated
--    on purpose: src/lib/tenant-access.server.ts calls it with the signed-in
--    user's own token. It is SECURITY DEFINER with search_path = '' and
--    refuses any caller who is not a member of the business (or agency
--    staff). PUBLIC and anon cannot run it. Restated here so the intended
--    grants live in the repo.
revoke all on function public.repsuites_tenant_access(uuid) from public, anon;
grant execute on function public.repsuites_tenant_access(uuid) to authenticated, service_role;

-- pg_net stays in the public schema (moving it can break pg_cron jobs).
