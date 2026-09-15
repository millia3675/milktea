-- 밀크티 v1.2: 기본 폰트/배경 추가, 초대된 친구끼리 꾸미기 자료 공유.
-- 202609140001_initial.sql 적용 후 1회 실행. 기존 자료와 일기는 보존.
begin;
alter table public.media_assets add column is_shared boolean not null default false;
alter table public.media_assets add constraint decoration_sharing_only
  check (not is_shared or kind in ('sticker','background','font'));
create index media_shared_library_idx on public.media_assets(kind,created_at,id) where is_shared and not archived;
-- 공유 여부는 등록할 때 확정한다. 이미 사용된 친구의 장식 권한을 회수하지 않는다.
grant insert(is_shared) on public.media_assets to authenticated;
alter table public.user_preferences drop constraint user_preferences_default_font_check;
alter table public.user_preferences add constraint user_preferences_default_font_check
  check(default_font in ('system','sans','handwriting','maruburi'));
alter table public.user_preferences drop constraint user_preferences_default_paper_check;
alter table public.user_preferences add constraint user_preferences_default_paper_check
  check(default_paper in ('white','lined','grid','cream','dots','rose','lavender','gingham'));
-- 공유된 장식은 다른 작성자의 일기/기본 설정에서도 참조할 수 있다.
-- 본문 사진, 프로필, 댓글의 소유자 FK는 유지한다. 유형/사용 권한은 검증 트리거가 검사한다.
do $$ declare c record; begin
  for c in select conname,conrelid::regclass as tbl from pg_constraint
    where contype='f' and confrelid='public.media_assets'::regclass
      and conrelid in ('public.entry_assets'::regclass,'public.user_preferences'::regclass)
  loop execute format('alter table %s drop constraint %I',c.tbl,c.conname); end loop;
end $$;
alter table public.entry_assets add foreign key(asset_id) references public.media_assets(id);
alter table public.user_preferences add foreign key(default_background_asset_id) references public.media_assets(id);
alter table public.user_preferences add foreign key(default_font_asset_id) references public.media_assets(id);
create or replace function milktea_private.check_asset(p_id uuid,p_owner uuid,p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_id is not null and not exists(
    select 1 from public.media_assets where id=p_id and kind=p_kind
      and (owner_id=p_owner or (is_shared and kind in ('sticker','background','font')))
  ) then raise exception 'ASSET_TYPE_OR_OWNER_MISMATCH' using errcode='23514'; end if;
end $$;
create or replace function milktea_private.can_read_asset(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select milktea_private.is_member() and (
    exists(select 1 from public.media_assets where id=p_id and (owner_id=(select auth.uid()) or (is_shared and kind in ('sticker','background','font'))))
    or exists(select 1 from public.profiles where avatar_asset_id=p_id)
    or exists(select 1 from public.entry_assets a join public.diary_entries e on e.id=a.entry_id
              where a.asset_id=p_id and e.status='published')
    or exists(select 1 from public.comments c join public.diary_entries e on e.id=c.entry_id
              where c.image_asset_id=p_id and e.status='published'));
$$;
create or replace function milktea_private.validate_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  d jsonb := new.document;
  item jsonb;
  tag text;
  content_found boolean := false;
  total_text integer := 0;
begin
  if new.diary_date > (now() at time zone 'Asia/Seoul')::date then
    raise exception 'FUTURE_DIARY_DATE' using errcode='23514';
  end if;
  if jsonb_typeof(d) is distinct from 'object' or (d->>'version') is distinct from '1'
    or jsonb_typeof(d->'blocks') is distinct from 'array'
    or jsonb_typeof(d->'stickers') is distinct from 'array'
    or jsonb_typeof(d->'habits') is distinct from 'array'
    or coalesce(d->>'paper','') not in ('white','lined','grid','cream','dots','rose','lavender','gingham')
    or coalesce(d->>'font','') not in ('system','sans','handwriting','maruburi') then
    raise exception 'INVALID_DOCUMENT' using errcode='23514';
  end if;
  if octet_length(d::text)>262144 or jsonb_array_length(d->'blocks')>100
    or jsonb_array_length(d->'stickers')>40 or jsonb_array_length(d->'habits')>30 then
    raise exception 'DOCUMENT_TOO_LARGE' using errcode='23514';
  end if;
  foreach tag in array new.tags loop
    if tag is null or char_length(btrim(tag)) not between 1 and 20 or tag ~ '[#[:space:]]' then
      raise exception 'INVALID_TAG' using errcode='23514';
    end if;
  end loop;
  if cardinality(new.tags) <> (select count(distinct t) from unnest(new.tags) t) then
    raise exception 'DUPLICATE_TAG' using errcode='23514';
  end if;
  for item in select value from jsonb_array_elements(d->'blocks') loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'type','') not in ('text','image')
      or nullif(item->>'id','') is null then
      raise exception 'INVALID_BLOCK' using errcode='23514';
    end if;
    perform (item->>'id')::uuid;
    if item->>'type'='text' then
      if jsonb_typeof(item->'text') is distinct from 'string' then raise exception 'INVALID_TEXT' using errcode='23514'; end if;
      total_text := total_text + char_length(item->>'text');
      content_found := content_found or char_length(btrim(item->>'text'))>0;
    else
      if nullif(item->>'asset_id','') is null then raise exception 'MISSING_IMAGE' using errcode='23514'; end if;
      perform milktea_private.check_asset((item->>'asset_id')::uuid,new.author_id,'diary-image');
      content_found := true;
    end if;
  end loop;
  if total_text>30000 then raise exception 'TEXT_TOO_LONG' using errcode='23514'; end if;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(d->'blocks')) then
    raise exception 'DUPLICATE_BLOCK_ID' using errcode='23514';
  end if;
  for item in select value from jsonb_array_elements(d->'stickers') loop
    if nullif(item->>'id','') is null or nullif(item->>'asset_id','') is null
      or jsonb_typeof(item->'x') is distinct from 'number' or jsonb_typeof(item->'y') is distinct from 'number'
      or jsonb_typeof(item->'scale') is distinct from 'number' or jsonb_typeof(item->'rotation') is distinct from 'number'
      or jsonb_typeof(item->'z') is distinct from 'number' then
      raise exception 'INVALID_STICKER' using errcode='23514';
    end if;
    perform (item->>'id')::uuid;
    if (item->>'x')::numeric not between 0 and 1 or (item->>'y')::numeric not between 0 and 1
      or (item->>'scale')::numeric not between 0.25 and 4 or (item->>'rotation')::numeric not between -180 and 180
      or (item->>'z')::numeric not between 0 and 100 or (item->>'z')::numeric<>trunc((item->>'z')::numeric) then
      raise exception 'STICKER_OUT_OF_RANGE' using errcode='23514';
    end if;
    perform milktea_private.check_asset((item->>'asset_id')::uuid,new.author_id,'sticker');
  end loop;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(d->'stickers')) then
    raise exception 'DUPLICATE_STICKER_ID' using errcode='23514';
  end if;
  for item in select value from jsonb_array_elements(d->'habits') loop
    -- 이전 일기의 이름/단위는 당시 스냅샷을 유지한다. 원본 항목은 archive만 한다.
    if not exists(select 1 from public.habit_fields h where h.id=(item->>'field_id')::uuid
      and h.owner_id=new.author_id and h.type=item->>'type')
      or jsonb_typeof(item->'name') is distinct from 'string'
      or coalesce(char_length(btrim(item->>'name')),0) not between 1 and 30
      or jsonb_typeof(item->'unit') is distinct from 'string' or char_length(item->>'unit')>10
      or coalesce(item->>'type','') not in ('boolean','number') then
      raise exception 'INVALID_HABIT' using errcode='23514';
    end if;
    if item->>'type'='boolean' and jsonb_typeof(item->'value') is distinct from 'boolean' then
      raise exception 'INVALID_HABIT_VALUE' using errcode='23514';
    end if;
    if item->>'type'='number' then
      if jsonb_typeof(item->'value') is distinct from 'number' then raise exception 'INVALID_HABIT_VALUE' using errcode='23514'; end if;
      if (item->>'value')::numeric not between 0 and 1000000 then raise exception 'INVALID_HABIT_VALUE' using errcode='23514'; end if;
    end if;
  end loop;
  if (select count(*)<>count(distinct value->>'field_id') from jsonb_array_elements(d->'habits')) then
    raise exception 'DUPLICATE_HABIT' using errcode='23514';
  end if;
  perform milktea_private.check_asset((d->>'background_asset_id')::uuid,new.author_id,'background');
  perform milktea_private.check_asset((d->>'font_asset_id')::uuid,new.author_id,'font');
  if new.status='published' and not content_found then raise exception 'EMPTY_ENTRY' using errcode='23514'; end if;
  new.updated_at := now();
  if TG_OP='INSERT' then
    new.version := 1;
    new.created_at := now();
    new.published_at := case when new.status='published' then now() else null end;
  else
    new.version := old.version+1;
    new.published_at := case when new.status='published' then coalesce(old.published_at,now()) else old.published_at end;
  end if;
  return new;
end $$;
commit;
