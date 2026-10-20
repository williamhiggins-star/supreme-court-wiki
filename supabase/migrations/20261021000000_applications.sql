-- Applications (the Court's series yyAnnn, Rules 22-23), current term on,
-- and the stored "emergency/shadow docket" grouping built from them.
--
-- 1. application_details: one row per application, in the Court's terms,
--    read from its docket page (/docket/docketfiles/html/public/{n}.html):
--    the Court's caption, its verbatim filing entry ("Application (26A476)
--    for a stay, submitted to The Chief Justice."), the application type
--    and outcome as court_vocabulary codes, and the docket entries. The
--    Court's orders on an application are court_actions rows with the
--    same docket_number (source_url = the docket page).
--    application_type / outcome are null when the reader's rules can't
--    classify the Court's wording; the verbatim text is always kept.
-- 2. emergency_shadow_docket: NOT a Court term. The applications the press
--    and public mean by that phrase, chosen by a versioned rule
--    (scripts/lib/applications/membership.ts; docs/emergency-shadow-docket.md)
--    and fully rebuilt from application_details by
--    scripts/rebuild-emergency-shadow-docket.ts. Each row shows the
--    Court's own terms alongside.
--
-- Both tables are written by the pipeline (service role) only: RLS on, no
-- anon policy, and no grants to anon/authenticated. Nothing on the site
-- reads them.
--
-- Rollback:
--   drop table public.emergency_shadow_docket;
--   drop table public.application_details;

-- 1 ---------------------------------------------------------------------
create table public.application_details (
  docket_number            text primary key check (docket_number ~ '^[0-9]{2}A[0-9]+$'),
  term                     text not null,          -- from the series prefix: 26A… → '2026'
  docket_url               text not null,
  title                    text not null,          -- the Court's caption ("Title:"), verbatim
  application_type         text references public.court_vocabulary (code),
  application_text         text not null,          -- the Court's filing entry, verbatim
  directed_to              text,                   -- as the Court writes it: 'Justice Kagan', 'The Chief Justice'
  filed_date               date,                   -- date of the filing entry
  docketed_date            date,
  lower_court              text,                   -- "Lower Ct:", verbatim
  lower_court_case_numbers text,                   -- "Case Numbers:", verbatim
  linked_with              text,                   -- "Linked with:" (e.g. the petition an extension was for)
  outcome                  text references public.court_vocabulary (code),
  outcome_date             date,
  outcome_text             text,                   -- the Court's disposition entry, verbatim
  pending                  boolean not null,       -- no disposition since the latest filing or refiling
  entries                  jsonb not null,         -- [{date, text}] "Proceedings and Orders", verbatim, no contact details
  content_sha256           text not null,          -- of the stored content, to tell real changes from page noise
  page_last_modified       text,                   -- for If-Modified-Since
  first_fetched_at         timestamptz not null default now(),
  last_fetched_at          timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index application_details_pending_idx on public.application_details (pending) where pending;
alter table public.application_details enable row level security;

-- 2 ---------------------------------------------------------------------
create table public.emergency_shadow_docket (
  docket_number    text primary key references public.application_details (docket_number) on delete cascade,
  rule_version     text not null,                  -- e.g. 'esd-rule-1'
  term             text not null,
  title            text not null,
  application_type text not null references public.court_vocabulary (code),  -- the Court's term
  application_text text not null,                  -- the Court's filing entry, verbatim
  directed_to      text,
  filed_date       date,
  outcome          text references public.court_vocabulary (code),
  outcome_date     date,
  outcome_text     text,
  pending          boolean not null,
  docket_url       text not null,
  built_at         timestamptz not null default now()
);
alter table public.emergency_shadow_docket enable row level security;

-- Pipeline-only: no anon/authenticated access at all, even if RLS changed.
revoke all on table public.application_details, public.emergency_shadow_docket from anon, authenticated;
