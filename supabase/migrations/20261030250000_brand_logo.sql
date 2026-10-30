-- The business's own logo and its QR stand look (background photo and colour
-- theme), remembered from the printable QR designer and reused on review
-- cards for Google posts. card_style: "stand", "brand" or a theme id.
alter table public.business_branding add column if not exists logo_url text;
alter table public.business_branding add column if not exists background_url text;
alter table public.business_branding add column if not exists stand_theme text;
alter table public.business_branding add column if not exists card_style text;
