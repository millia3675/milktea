-- Owner administration is provisioned separately through service_role.
-- Never derive this permission from editable profiles or Auth user_metadata.
begin;
create table milktea_private.administrators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table milktea_private.administrators enable row level security;
revoke all on milktea_private.administrators from public, anon, authenticated;

create function public.is_milktea_admin(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from milktea_private.administrators a
    join public.members m on m.id=a.user_id where a.user_id=p_user_id and m.active)
    and not exists(select 1 from milktea_private.account_deletions where user_id=p_user_id);
$$;
revoke all on function public.is_milktea_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_milktea_admin(uuid) to service_role;
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_milktea_admin((select auth.uid()));
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create function public.invitation_allowed(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from milktea_private.account_deletions where user_id=p_user_id)
    and not exists(select 1 from public.members where id=p_user_id and not active);
$$;
create function public.approve_invited_member(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  lock table public.members in share row exclusive mode;
  if not public.invitation_allowed(p_user_id) then raise exception 'INVITATION_NOT_ALLOWED'; end if;
  insert into public.members(id,active) values(p_user_id,true) on conflict(id) do nothing;
end $$;
revoke all on function public.invitation_allowed(uuid),public.approve_invited_member(uuid) from public,anon,authenticated;
grant execute on function public.invitation_allowed(uuid),public.approve_invited_member(uuid) to service_role;

create table public.sticker_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(btrim(name)) between 1 and 50),
  cover_asset_id uuid references public.media_assets(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.sticker_pack_items (
  pack_id uuid not null references public.sticker_packs(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  position integer not null check(position between 0 and 199),
  primary key(pack_id,asset_id)
);
alter table public.sticker_packs enable row level security;
alter table public.sticker_pack_items enable row level security;
revoke all on public.sticker_packs,public.sticker_pack_items from public,anon,authenticated;
grant select on public.sticker_packs,public.sticker_pack_items to authenticated;
create policy packs_read on public.sticker_packs for select to authenticated
  using(milktea_private.is_member());
create policy pack_items_read on public.sticker_pack_items for select to authenticated
  using(milktea_private.is_member());

create function public.save_sticker_pack(p_id uuid,p_name text,p_assets uuid[],p_cover uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result_id uuid := coalesce(p_id,gen_random_uuid());
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 50
    or coalesce(cardinality(p_assets),0) not between 1 and 200
    or p_cover is null or not(p_cover=any(p_assets))
    or cardinality(p_assets)<>(select count(distinct a) from unnest(p_assets) a) then
    raise exception 'INVALID_PACK' using errcode='23514';
  end if;
  -- Only shared, available stickers can become a community pack. Private uploads stay private.
  perform id from public.media_assets where id=any(p_assets) for share;
  if (select count(*) from public.media_assets where id=any(p_assets)
    and kind='sticker' and is_shared and not archived)<>cardinality(p_assets) then
    raise exception 'PACK_ASSET_UNAVAILABLE' using errcode='23514';
  end if;
  if p_id is null then
    insert into public.sticker_packs(id,name,cover_asset_id) values(result_id,btrim(p_name),p_cover);
  else
    update public.sticker_packs set name=btrim(p_name),cover_asset_id=p_cover where id=p_id;
    if not found then raise exception 'PACK_UNAVAILABLE'; end if;
    delete from public.sticker_pack_items where pack_id=p_id;
  end if;
  insert into public.sticker_pack_items(pack_id,asset_id,position)
    select result_id,a,(n-1)::integer from unnest(p_assets) with ordinality x(a,n);
  return result_id;
end $$;
create function public.delete_sticker_pack(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  delete from public.sticker_packs where id=p_id;
end $$;
revoke all on function public.save_sticker_pack(uuid,text,uuid[],uuid),public.delete_sticker_pack(uuid) from public,anon;
grant execute on function public.save_sticker_pack(uuid,text,uuid[],uuid),public.delete_sticker_pack(uuid) to authenticated;

create table public.diary_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 50),
  decoration jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.diary_templates enable row level security;
revoke all on public.diary_templates from public,anon,authenticated;
grant select,delete on public.diary_templates to authenticated;
grant insert(id,name,decoration),update(name,decoration) on public.diary_templates to authenticated;
create policy templates_own on public.diary_templates for all to authenticated
  using(owner_id=(select auth.uid()) and milktea_private.is_member())
  with check(owner_id=(select auth.uid()) and milktea_private.is_member());

create function milktea_private.validate_template() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d jsonb := new.decoration; s jsonb; l jsonb;
begin
  if jsonb_typeof(d) is distinct from 'object' or octet_length(d::text)>32768
    or (d->>'version') is distinct from '1'
    or coalesce(d->>'paper','') not in ('white','lined','grid','cream','dots','rose','lavender','gingham')
    or coalesce(d->>'font','') not in ('system','sans','handwriting','maruburi')
    or jsonb_typeof(d->'stickers') is distinct from 'array'
    or (d-ARRAY['version','paper','font','background_asset_id','font_asset_id','stickers','layout'])<>'{}'::jsonb then
    raise exception 'INVALID_TEMPLATE' using errcode='23514';
  end if;
  if jsonb_array_length(d->'stickers')>40 then raise exception 'INVALID_TEMPLATE'; end if;
  perform milktea_private.check_asset((d->>'background_asset_id')::uuid,new.owner_id,'background');
  perform milktea_private.check_asset((d->>'font_asset_id')::uuid,new.owner_id,'font');
  for s in select value from jsonb_array_elements(d->'stickers') loop
    if jsonb_typeof(s) is distinct from 'object'
      or nullif(s->>'id','') is null or nullif(s->>'asset_id','') is null
      or (s-ARRAY['id','asset_id','x','y','scale','rotation','z'])<>'{}'::jsonb
      or jsonb_typeof(s->'x') is distinct from 'number' or jsonb_typeof(s->'y') is distinct from 'number'
      or jsonb_typeof(s->'scale') is distinct from 'number' or jsonb_typeof(s->'rotation') is distinct from 'number'
      or jsonb_typeof(s->'z') is distinct from 'number' then raise exception 'INVALID_TEMPLATE'; end if;
    perform (s->>'id')::uuid;
    if (s->>'x')::numeric not between 0 and 1 or (s->>'y')::numeric not between 0 and 1
      or (s->>'scale')::numeric not between 0.25 and 4 or (s->>'rotation')::numeric not between -180 and 180
      or (s->>'z')::numeric not between 0 and 100 or (s->>'z')::numeric<>trunc((s->>'z')::numeric) then
      raise exception 'INVALID_TEMPLATE';
    end if;
    perform milktea_private.check_asset((s->>'asset_id')::uuid,new.owner_id,'sticker');
  end loop;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(d->'stickers')) then
    raise exception 'INVALID_TEMPLATE';
  end if;
  if d ? 'layout' then
    l := d->'layout';
    if jsonb_typeof(l) is distinct from 'object' or (l->>'version') is distinct from '1'
      or jsonb_typeof(l->'width') is distinct from 'number' or jsonb_typeof(l->'height') is distinct from 'number'
      or (l-ARRAY['version','width','height'])<>'{}'::jsonb then raise exception 'INVALID_TEMPLATE'; end if;
    if (l->>'width')::numeric not between 240 and 1200 or (l->>'height')::numeric not between 100 and 200000 then
      raise exception 'INVALID_TEMPLATE';
    end if;
  elsif jsonb_array_length(d->'stickers')>0 then raise exception 'INVALID_TEMPLATE';
  end if;
  return new;
end $$;
create trigger validate_template before insert or update on public.diary_templates
  for each row execute function milktea_private.validate_template();

-- Deleting a shared upload also removes its references in other members' saved templates.
create function milktea_private.remove_template_asset() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.diary_templates set decoration=
    jsonb_set(case when decoration->>'background_asset_id'=old.id::text
      then decoration-'background_asset_id' else decoration end,'{stickers}',
      coalesce((select jsonb_agg(s) from jsonb_array_elements(decoration->'stickers') s
        where s->>'asset_id'<>old.id::text),'[]'::jsonb))
      - case when decoration->>'font_asset_id'=old.id::text then 'font_asset_id' else '__absent__' end
    where decoration->>'background_asset_id'=old.id::text or decoration->>'font_asset_id'=old.id::text
      or exists(select 1 from jsonb_array_elements(decoration->'stickers') s where s->>'asset_id'=old.id::text);
  return old;
end $$;
create trigger remove_template_asset before delete on public.media_assets
  for each row execute function milktea_private.remove_template_asset();

create function milktea_private.validate_daily_question() returns trigger
language plpgsql set search_path = '' as $$
declare q jsonb := new.document->'question';
begin
  if q is not null and q<>'null'::jsonb then
    if jsonb_typeof(q) is distinct from 'object' or jsonb_typeof(q->'text') is distinct from 'string'
      or coalesce(char_length(btrim(q->>'text')),0) not between 1 and 200
      or coalesce(q->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
      or (q-ARRAY['date','text'])<>'{}'::jsonb then raise exception 'INVALID_QUESTION'; end if;
    if (q->>'date')::date > (now() at time zone 'Asia/Seoul')::date then raise exception 'INVALID_QUESTION'; end if;
  end if;
  return new;
end $$;
create trigger validate_daily_question before insert or update on public.diary_entries
  for each row execute function milktea_private.validate_daily_question();
grant all on public.sticker_packs,public.sticker_pack_items,public.diary_templates,
  milktea_private.administrators to service_role;
revoke all on function milktea_private.validate_template(),milktea_private.remove_template_asset(),
  milktea_private.validate_daily_question() from public,anon,authenticated;
commit;
