# RepSuites capability inventory and release plan

Inspected 5 November 2026. Source baseline: `15a413c` on `JuliusNglass/repsuites`.
Inputs: attached `Pasted text(4).txt` transcript and the earlier Discover / Diagnose / Recommend / Execute / Prove roadmap. The roadmap was a proposal, not evidence of implementation.

## Verified environments and safeguards

- TanStack Start / React application, Nitro Cloudflare-module build, Supabase REST access.
- Connected Supabase project `ljosiwovyixvvxokyuel` is explicitly production. Repository AGENTS.md confirms production only. No RepSuites staging project was listed.
- Cloudflare has Worker `repsuites`; no RepSuites staging Worker or Pages project was listed. Secret binding names were inspected, not values. Google Maps, DataForSEO, Anthropic, Supabase, session and billing bindings exist; their operational validity was not tested.
- All 42 public tables report RLS enabled. The checked feature tables have no client RLS policies. Source intentionally uses service-role requests with server guards and tenant filters. This is deny-by-default client access, not row authorization for service-role requests.
- Existing ranking guards require a verified tenant session, role and plan access, and same-origin writes. Agency prospecting uses agency membership and same-origin writes. Preserve these guards; never accept a caller-selected tenant as authorization.
- Cron calls verify a database token. Ranking has a monthly cap and user-triggered daily limit; AI has a ten-minute check interval. These are not an atomic provider-spend ledger. Prospect grids are outside the scheduled scan cost ledger, and failed scheduled calls are not fully accounted. Concurrency-safe cost reservations remain a release follow-up.
- Printed feedback QR addresses and existing `qr_links` must stay valid. No customer rows, credentials, production settings or deployed versions were changed during this work.

## Repository-grounded inventory

| Journey               | Existing implementation                                                                                                                              | Gap / batch                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover              | Google Places business/niche search with pagination, prospect CRM stages, contact cache, owner research, regional filters                            | Reuse; no second discovery engine                                                                                                                                   |
| Diagnose: maps        | 5x5 prospect grids, up to three phrases, configurable area, map overlays; customer 3x3/5x5 scans                                                     | First PR: complete-grid evidence, reject malformed/pending provider responses, same-grid competitor rankings                                                        |
| Diagnose: competitors | Nearby category-matched rivals, distance, rating, review counts and review gap                                                                       | First PR adds top-three coverage, found spots and found-only averages using the same provider responses                                                             |
| Diagnose: GBP         | Public Places profile basics, reviews; connected GBP reviews, posts and performance workflows                                                        | First PR exposes source/date/coverage of public basics. Full private profile audit, services and suspension checks remain unimplemented                             |
| Diagnose: website     | Bounded contact discovery exists, but reports did not inspect page SEO markup                                                                        | First PR adds static homepage title, H1, description, viewport, tap-to-call and parseable JSON-LD observations with recommendations                                 |
| Diagnose: AI          | Claude web-search samples for three questions, sources/domains and competitor names                                                                  | Second PR adds model/time/source URL/excerpt evidence, malformed-answer handling and stricter identity matching. Other providers remain unimplemented               |
| Recommend             | Rule-based review, profile and grid fixes                                                                                                            | First PR adds finding-specific website recommendations. No invented conversion, lost-call or revenue claims. A unified evidence-linked task system remains pending  |
| Reports               | Public token report, interactive map/phrase switching, accessible colour/shape pins, video, PDF via browser print, real Google performance snapshots | Extend existing report. Custom agency logo/colour controls and reliable all-keyword print layouts remain pending; tenant business branding already exists elsewhere |
| Prove                 | Weekly stored ranking scans and latest/previous comparison; connected Google performance periods                                                     | Comparable history across grid/location changes, recurring prospect audits, alerts and AI history dashboard remain pending                                          |
| Execute               | Protected GBP posts/replies, review campaigns and accounting/CRM integrations                                                                        | No generic approved execution ledger, immutable evidence binding, expiry/revocation, idempotent execution or rollback verification yet                              |

## Batch order

1. Ranking correctness and report diagnosis (first draft PR): complete data before claims, competitor coverage, static website audit, explicit GBP evidence. Existing `prospects.report` JSONB stores additive optional fields, so no schema migration is required. Older reports omit the new fields safely. Failed grids are withheld rather than showing failed requests as poor rankings.
2. AI evidence quality (second draft PR): malformed responses become errors rather than negative visibility. Retain provider-returned model, check time, public source URLs and excerpt in existing `results` JSONB. Partial failures are displayed. No schema migration or provider change is required.
3. Staging and cost controls: establish isolated staging Supabase and Worker, test identities, sandbox provider budgets, callback origins and disabled outbound campaigns/billing/cron. Introduce an atomic run/cost ledger via a generated migration only after this environment exists. Do not copy production customer data or secrets into staging.
4. Agency report branding and complete PDF coverage: reuse tenant branding only after defining agency ownership; print every phrase and include source/date/methodology and limitations.
5. Prove: immutable run context, comparable historical series, alert deduplication and evidence-linked recommendations. Reuse rank scans and AI checks rather than introducing competing history stores.
6. Execute: persisted approval bound to exact tenant/action/evidence, role recheck at execution, expiration/revocation, idempotency and outcome verification. No live client-resource modifications before explicit approval.

## Validation and release gates

Local type checks, changed-file lint, unit/integration tests and the Cloudflare production-target build are required. Mock provider tests cover failed/pending Maps responses, incomplete grids, shared competitor comparisons, audit fetch failures, unsafe redirects, oversized HTML, escaping and malformed AI output. All external provider calls in tests are mocked; no live paid scans were run.

Windows test startup required `npx vitest run --configLoader runner`; default esbuild config bundling attempted to read a denied ancestor directory. Bun install could not write its temp directory; dependencies were installed with npm without changing the lockfile. CI still uses the repository's Bun lockfile and must pass before release.

Staging validation has NOT occurred: no isolated RepSuites environment was available. Keep both PRs draft until staging smoke tests cover authenticated tenant isolation, agency-only report creation, old/new report rendering, printing, unavailable providers, quotas, and disabled external side effects. No migrations, merges or deployments were performed.

Existing Supabase advisor findings: no-policy RLS notices are consistent with the server-only model; the tenant-access SECURITY DEFINER RPC is intentionally authenticated and membership-checked in migrations. pg_net location and disabled leaked-password protection also appeared. Do not blindly move extensions or rewrite policies as part of a feature release. Review current advisories separately: https://supabase.com/docs/guides/database/database-linter and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Static audits inspect returned HTML, not rendered JavaScript or measured business performance. Existing URL checks reject literal private IPs, local-style hosts, credentials and unusual ports, and revalidate redirects. They are not a DNS rebinding defense; review egress restrictions before widening arbitrary website crawling. No cross-site crawling was added.
