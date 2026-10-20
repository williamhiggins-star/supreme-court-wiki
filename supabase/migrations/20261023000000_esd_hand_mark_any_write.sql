-- emergency_shadow_docket: any write of public_view by a person marks the
-- row as set by hand, even when the value written is the same (e.g.
-- confirming "yes" to lock it). Before, only a change of value marked it,
-- so a confirmed value could later be changed by the rule.
--
-- Safe because the pipeline never writes public_view in an UPDATE: new and
-- reclassified rows are inserted, and fact refreshes leave public_view out.
-- Resetting the marker (public_view_set_by_hand = false, without writing
-- public_view) still hands a row back to the rule.
--
-- Rollback:
--   drop trigger emergency_shadow_docket_public_view_by_hand on public.emergency_shadow_docket;
--   create trigger emergency_shadow_docket_public_view_by_hand
--     before update of public_view on public.emergency_shadow_docket
--     for each row when (old.public_view is distinct from new.public_view)
--     execute function public.esd_mark_public_view_by_hand();

drop trigger emergency_shadow_docket_public_view_by_hand on public.emergency_shadow_docket;
create trigger emergency_shadow_docket_public_view_by_hand
  before update of public_view on public.emergency_shadow_docket
  for each row
  execute function public.esd_mark_public_view_by_hand();
