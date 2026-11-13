-- Report story mode: how far each prospect got through the story cards.
alter table public.prospects add column if not exists story_max_card smallint;
alter table public.prospects add column if not exists story_seen_at timestamptz;
