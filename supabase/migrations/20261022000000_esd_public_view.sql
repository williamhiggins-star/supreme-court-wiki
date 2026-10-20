-- emergency_shadow_docket: the public_view editorial setting (rule esd-rule-2).
--
-- 1. public_view: yes/no, default no. Whether a matter is part of what will
--    be shown publicly. An editorial setting, not a statement about what is
--    or isn't "shadow docket". Nothing on the site reads it yet.
-- 2. public_view_set_by_hand: set automatically (by the trigger below)
--    whenever public_view changes on an existing row. The pipeline never
--    changes public_view on an existing row (the nightly update leaves it
--    alone; the full rebuild only replaces unmarked rows), so any change
--    is a person's, and neither the nightly update nor a rebuild touches a
--    marked row's public_view.
-- 3. application_type may be null: esd-rule-2 also admits matters with no
--    glossary code (e.g. "to file … in excess of word limits"), shown with
--    the Court's verbatim text.
-- 4. Every row already in the table (esd-rule-1: stays, injunctions,
--    vacaturs of stays, recalls-and-stays of mandate) gets public_view =
--    yes, before the trigger exists, so none is marked as set by hand.
--
-- Rollback:
--   drop trigger emergency_shadow_docket_public_view_by_hand on public.emergency_shadow_docket;
--   drop function public.esd_mark_public_view_by_hand();
--   delete from public.emergency_shadow_docket where application_type is null;
--   alter table public.emergency_shadow_docket
--     alter column application_type set not null,
--     drop column public_view_set_by_hand,
--     drop column public_view;

alter table public.emergency_shadow_docket
  add column public_view boolean not null default false,
  add column public_view_set_by_hand boolean not null default false,
  alter column application_type drop not null;

update public.emergency_shadow_docket set public_view = true;

create function public.esd_mark_public_view_by_hand() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.public_view_set_by_hand := true;
  return new;
end;
$$;

create trigger emergency_shadow_docket_public_view_by_hand
  before update of public_view on public.emergency_shadow_docket
  for each row when (old.public_view is distinct from new.public_view)
  execute function public.esd_mark_public_view_by_hand();

revoke all on function public.esd_mark_public_view_by_hand() from public, anon, authenticated;
