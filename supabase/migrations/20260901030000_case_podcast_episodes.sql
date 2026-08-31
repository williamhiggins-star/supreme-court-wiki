-- SCOTUS oral-arguments Spotify podcast episode matched to each case.
-- Mirrors what scripts/fetch-spotify-episodes.ts already computes and
-- writes to data/cases/*.json's podcastEpisodeUrl/spotifyMatchStatus
-- fields today (see that script's own header comment: "the SD schema has
-- no podcast_episode_url column on cases"). A dedicated table rather than
-- bare columns on cases because the match itself carries metadata worth
-- keeping: which episode, how it was matched, and how confident that
-- match is -- match_confidence lets a consumer distinguish an exact
-- docket-number match from a fuzzy title-similarity fallback instead of
-- collapsing both into a flat "matched" boolean.

create table public.case_podcast_episodes (
  case_id uuid primary key references public.cases(id) on delete cascade,
  episode_id text not null,
  episode_url text not null,
  match_method text not null check (match_method in ('docket', 'title')),
  match_confidence numeric not null check (match_confidence >= 0 and match_confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger case_podcast_episodes_set_updated_at
  before update on public.case_podcast_episodes
  for each row execute function public.set_updated_at();

alter table public.case_podcast_episodes enable row level security;
create policy "public read access" on public.case_podcast_episodes for select to anon, authenticated using (true);
grant select on table public.case_podcast_episodes to anon, authenticated;
