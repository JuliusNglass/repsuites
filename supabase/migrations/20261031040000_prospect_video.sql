-- A short personal video on each prospect's report (/r/<token>), how much of
-- it they watched, and a personal link-preview picture for WhatsApp/email.
alter table public.prospects
  add column if not exists video_url text check (video_url is null or video_url ~ '^https://'),
  add column if not exists video_kind text check (video_kind is null or video_kind in ('loom','youtube','vimeo','file')),
  add column if not exists video_path text,
  add column if not exists video_added_at timestamptz,
  add column if not exists video_first_played_at timestamptz,
  add column if not exists video_last_played_at timestamptz,
  add column if not exists video_plays integer not null default 0,
  add column if not exists video_max_percent integer not null default 0,
  add column if not exists og_image_url text check (og_image_url is null or og_image_url ~ '^https://');

-- Public-read bucket. Paths are long random strings, so files cannot be
-- guessed. Only the server hands out (signed) upload links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prospect-videos', 'prospect-videos', true, 209715200,
        array['video/mp4','video/quicktime','video/webm','image/jpeg'])
on conflict (id) do nothing;
