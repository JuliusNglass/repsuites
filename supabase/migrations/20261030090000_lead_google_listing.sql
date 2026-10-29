-- Free check requests can carry the Google listing the person confirmed on
-- the form (business search). Additive only.
alter table public.leads
  add column if not exists google_place_id text check (google_place_id is null or char_length(google_place_id) <= 300),
  add column if not exists address text check (address is null or char_length(address) <= 300),
  add column if not exists google_rating numeric(2,1) check (google_rating is null or (google_rating >= 0 and google_rating <= 5)),
  add column if not exists google_review_count integer check (google_review_count is null or google_review_count >= 0),
  add column if not exists website_url text check (website_url is null or char_length(website_url) <= 300);
