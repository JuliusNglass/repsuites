-- A picture on each Google post: one of the business's own Google photos,
-- or a branded review card made in the browser and stored in post-images.
alter table public.google_posts
  add column if not exists image_url text check (image_url is null or image_url ~ '^https://'),
  add column if not exists image_kind text check (image_kind is null or image_kind in ('google','card')),
  add column if not exists image_quote text,
  add column if not exists image_by text;

-- Public bucket: Google must be able to fetch the picture when it posts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 5242880, array['image/png','image/jpeg'])
on conflict (id) do nothing;
-- Only the server (service role) uploads; anyone can read public files.
