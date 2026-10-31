-- Lead generator: who owns the business. From Companies House (UK, the
-- registered company's active directors) and, as a weaker hint, a name found
-- on the business's own website. Additive only.

alter table public.prospects
  add column if not exists company_number text
    check (company_number is null or company_number ~ '^[A-Z0-9]{6,10}$'),
  add column if not exists company_name text
    check (company_name is null or char_length(company_name) <= 200),
  -- [{ "name": "SMITH, John", "role": "director", "appointed": "2019-04-01" }]
  add column if not exists owners jsonb not null default '[]'::jsonb,
  add column if not exists owner_source text
    check (owner_source is null or owner_source in ('companies_house')),
  add column if not exists owner_match text
    check (owner_match is null or owner_match in ('postcode match', 'name only')),
  -- Set on every Companies House look-up, found or not (re-checked after 90 days).
  add column if not exists owner_looked_up_at timestamptz,
  add column if not exists website_owner_name text
    check (website_owner_name is null or char_length(website_owner_name) <= 60);

alter table public.prospect_contacts
  add column if not exists owner_name text
    check (owner_name is null or char_length(owner_name) <= 60);
