-- Reuse the existing file-deletion policies for the two new decoration consumers.
-- Account deletion still uses service_role and its explicit reference cleanup.
begin;
create index sticker_pack_asset_idx on public.sticker_pack_items(asset_id);
create index diary_template_decoration_idx on public.diary_templates using gin(decoration jsonb_path_ops);
create or replace function milktea_private.asset_in_use(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.entry_assets where asset_id=p_id)
    or exists(select 1 from public.profiles where avatar_asset_id=p_id)
    or exists(select 1 from public.comments where image_asset_id=p_id)
    or exists(select 1 from public.user_preferences where default_background_asset_id=p_id or default_font_asset_id=p_id)
    or exists(select 1 from public.sticker_pack_items where asset_id=p_id)
    or exists(select 1 from public.sticker_packs where cover_asset_id=p_id)
    or exists(select 1 from public.diary_templates where
      decoration @> jsonb_build_object('background_asset_id',p_id)
      or decoration @> jsonb_build_object('font_asset_id',p_id)
      or decoration @> jsonb_build_object('stickers',jsonb_build_array(jsonb_build_object('asset_id',p_id))));
$$;
commit;
