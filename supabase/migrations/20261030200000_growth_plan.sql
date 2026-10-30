-- One paid plan, RepSuites Growth (internal id 'gold'), with the new
-- 'growth' feature. The businesses Accelur8 already manages through Google
-- (Accelur8 Ltd, Burger Base, BILLO HOTEL) move to Growth so nothing they use
-- is switched off when the free tier is gated.
insert into public.tenant_plans (tenant_id, plan, features)
select t.id, 'gold', array['ranking','ai_visibility','nfc','growth']
from public.tenants t
where exists (select 1 from public.google_connections g where g.tenant_id = t.id)
on conflict (tenant_id) do update
  set plan = excluded.plan, features = excluded.features;
