-- INSERT ... RETURNING must be able to read the new row directly.
-- The stable helper's table lookup cannot see that row in the same statement.
begin;
alter policy assets_read on public.media_assets
  using (
    (select milktea_private.is_member()) and (
      owner_id = (select auth.uid())
      or milktea_private.can_read_asset(id)
    )
  );
commit;
