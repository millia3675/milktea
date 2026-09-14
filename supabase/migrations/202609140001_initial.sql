-- 밀크티 v1.1 / 새 Supabase 프로젝트에 postgres 권한으로 1회 실행.
-- 기존 테이블을 삭제하거나 덮어쓰지 않음. 전체 파일은 하나의 트랜잭션.
-- public: Data API 노출 / milktea_private: Data API 노출 금지.
begin;
create schema milktea_private;
revoke all on schema milktea_private from public, anon, authenticated;
grant usage on schema milktea_private to authenticated;

create table public.members (
  id uuid primary key references auth.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references public.members(id),
  nickname text not null default '새 친구' check (char_length(btrim(nickname)) between 1 and 20),
  avatar_asset_id uuid,
  main_color text not null default '#6C80D9' check (main_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#F3F5FF' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('avatar','diary-image','comment-image','sticker','background','font')),
  bucket_id text not null,
  object_path text not null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  mime_type text not null,
  byte_size bigint not null check (byte_size between 1 and 10485760),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique(owner_id,id), unique(bucket_id,object_path),
  check (split_part(object_path,'/',1) = owner_id::text and split_part(object_path,'/',2) <> ''),
  check (object_path !~ '(^|/)\.\.(/|$)'),
  check ((kind = 'avatar' and bucket_id = 'avatars')
      or (kind in ('diary-image','comment-image') and bucket_id = 'diary-images')
      or (kind = 'sticker' and bucket_id = 'stickers')
      or (kind = 'background' and bucket_id = 'backgrounds')
      or (kind = 'font' and bucket_id = 'fonts')),
  check ((kind = 'font' and mime_type in ('font/woff2','font/woff','font/ttf','font/otf','application/font-woff','application/x-font-ttf','application/x-font-opentype','application/vnd.ms-opentype'))
      or (kind <> 'font' and mime_type in ('image/png','image/webp','image/jpeg'))),
  check (kind <> 'sticker' or mime_type in ('image/png','image/webp'))
);
alter table public.profiles add foreign key (id,avatar_asset_id) references public.media_assets(owner_id,id);
create table public.user_preferences (
  user_id uuid primary key references public.profiles(id),
  streak_mode text not null default 'weekly' check (streak_mode in ('weekly','monthly')),
  default_paper text not null default 'white' check (default_paper in ('white','lined','grid','cream')),
  default_font text not null default 'system' check (default_font in ('system','sans','handwriting')),
  default_background_asset_id uuid,
  default_font_asset_id uuid,
  updated_at timestamptz not null default now(),
  foreign key(user_id,default_background_asset_id) references public.media_assets(owner_id,id),
  foreign key(user_id,default_font_asset_id) references public.media_assets(owner_id,id)
);
create table public.habit_fields (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  name text not null check (char_length(btrim(name)) between 1 and 30),
  type text not null check (type in ('boolean','number')),
  unit text not null default '' check (char_length(unit) <= 10),
  position integer not null default 0 check (position between 0 and 100),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.diary_entries (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id),
  diary_date date not null,
  title text not null default '' check (char_length(title) <= 100),
  status text not null default 'draft' check (status in ('draft','published')),
  tags text[] not null default '{}',
  document jsonb not null default '{"version":1,"blocks":[],"stickers":[],"habits":[],"paper":"white","font":"system"}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique(author_id,id),
  check (diary_date >= date '1900-01-01'),
  check (cardinality(tags) <= 10 and array_ndims(tags) <= 1)
);
-- JSON 속 파일 참조를 DB의 외래키로 보호하는 파생 테이블. 클라이언트 직접 쓰기 금지.
create table public.entry_assets (
  entry_id uuid not null,
  author_id uuid not null,
  asset_id uuid not null,
  primary key(entry_id,asset_id),
  foreign key(author_id,entry_id) references public.diary_entries(author_id,id) on delete cascade,
  foreign key(author_id,asset_id) references public.media_assets(owner_id,id)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.diary_entries(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  content text not null default '' check (char_length(content) <= 2000),
  image_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(author_id,image_asset_id) references public.media_assets(owner_id,id),
  check (char_length(btrim(content)) > 0 or image_asset_id is not null)
);
create table public.reactions (
  entry_id uuid not null references public.diary_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  emoji text not null check (emoji in ('👍','❤️','😂','🐱','✨','🫂','🍀','🔥')),
  created_at timestamptz not null default now(),
  primary key(entry_id,user_id,emoji)
);
create table public.entry_reads (
  entry_id uuid not null references public.diary_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  last_read_at timestamptz not null default now(),
  primary key(entry_id,user_id)
);
create index diary_date_feed_idx on public.diary_entries(diary_date desc,created_at desc,id desc) where status='published';
create index diary_author_feed_idx on public.diary_entries(author_id,diary_date desc,created_at desc,id desc);
create index diary_tags_idx on public.diary_entries using gin(tags);
create index comments_entry_idx on public.comments(entry_id,created_at,id);
create index comments_image_idx on public.comments(image_asset_id) where image_asset_id is not null;
create index entry_assets_asset_idx on public.entry_assets(asset_id);
create index entry_reads_user_idx on public.entry_reads(user_id);
create index habit_owner_idx on public.habit_fields(owner_id,position);

create function milktea_private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members where id=(select auth.uid()) and active);
$$;
create function milktea_private.can_read_entry(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select milktea_private.is_member() and exists(
    select 1 from public.diary_entries where id=p_id and (status='published' or author_id=(select auth.uid())));
$$;
create function milktea_private.is_published(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select milktea_private.is_member() and exists(select 1 from public.diary_entries where id=p_id and status='published');
$$;
create function milktea_private.owns_entry(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select milktea_private.is_member() and exists(select 1 from public.diary_entries where id=p_id and author_id=(select auth.uid()));
$$;
create function milktea_private.asset_in_use(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.entry_assets where asset_id=p_id)
    or exists(select 1 from public.profiles where avatar_asset_id=p_id)
    or exists(select 1 from public.comments where image_asset_id=p_id)
    or exists(select 1 from public.user_preferences where default_background_asset_id=p_id or default_font_asset_id=p_id);
$$;
create function milktea_private.can_read_asset(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select milktea_private.is_member() and (
    exists(select 1 from public.media_assets where id=p_id and owner_id=(select auth.uid()))
    or exists(select 1 from public.profiles where avatar_asset_id=p_id)
    or exists(select 1 from public.entry_assets a join public.diary_entries e on e.id=a.entry_id
              where a.asset_id=p_id and e.status='published')
    or exists(select 1 from public.comments c join public.diary_entries e on e.id=c.entry_id
              where c.image_asset_id=p_id and e.status='published'));
$$;
create function milktea_private.can_read_object(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select milktea_private.is_member() and (
    split_part(p_path,'/',1)=(select auth.uid())::text
    or exists(select 1 from public.media_assets a where a.bucket_id=p_bucket and a.object_path=p_path
              and milktea_private.can_read_asset(a.id)));
$$;
create function milktea_private.can_delete_object(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select milktea_private.is_member() and split_part(p_path,'/',1)=(select auth.uid())::text
    and not exists(select 1 from public.media_assets a where a.bucket_id=p_bucket and a.object_path=p_path
                   and milktea_private.asset_in_use(a.id));
$$;
create function milktea_private.bootstrap_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values(new.id);
  insert into public.user_preferences(user_id) values(new.id);
  return new;
end $$;
create trigger bootstrap_member after insert on public.members for each row execute function milktea_private.bootstrap_member();

create function milktea_private.touch_updated() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end $$;
create function milktea_private.check_asset(p_id uuid,p_owner uuid,p_kind text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_id is not null and not exists(select 1 from public.media_assets where id=p_id and owner_id=p_owner and kind=p_kind) then
    raise exception 'ASSET_TYPE_OR_OWNER_MISMATCH' using errcode='23514';
  end if;
end $$;
create function milktea_private.validate_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform milktea_private.check_asset(new.avatar_asset_id,new.id,'avatar'); return new; end $$;
create trigger validate_profile before insert or update on public.profiles for each row execute function milktea_private.validate_profile();
create function milktea_private.validate_preferences() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform milktea_private.check_asset(new.default_background_asset_id,new.user_id,'background');
  perform milktea_private.check_asset(new.default_font_asset_id,new.user_id,'font');
  return new;
end $$;
create trigger validate_preferences before insert or update on public.user_preferences for each row execute function milktea_private.validate_preferences();
create function milktea_private.validate_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform milktea_private.check_asset(new.image_asset_id,new.author_id,'comment-image'); return new; end $$;
create trigger validate_comment before insert or update on public.comments for each row execute function milktea_private.validate_comment();

create function milktea_private.validate_entry() returns trigger
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
    or coalesce(d->>'paper','') not in ('white','lined','grid','cream')
    or coalesce(d->>'font','') not in ('system','sans','handwriting') then
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
create trigger validate_entry before insert or update on public.diary_entries for each row execute function milktea_private.validate_entry();
create function milktea_private.sync_entry_assets() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.entry_assets where entry_id=new.id;
  insert into public.entry_assets(entry_id,author_id,asset_id)
    select new.id,new.author_id,ref::uuid from (
      select b->>'asset_id' ref from jsonb_array_elements(new.document->'blocks') b where b->>'type'='image'
      union select s->>'asset_id' from jsonb_array_elements(new.document->'stickers') s
      union select new.document->>'background_asset_id'
      union select new.document->>'font_asset_id'
    ) refs where ref is not null;
  return new;
end $$;
create trigger sync_entry_assets after insert or update on public.diary_entries for each row execute function milktea_private.sync_entry_assets();
create trigger touch_profile before update on public.profiles for each row execute function milktea_private.touch_updated();
create trigger touch_preferences before update on public.user_preferences for each row execute function milktea_private.touch_updated();
create trigger touch_comment before update on public.comments for each row execute function milktea_private.touch_updated();

-- API에 노출된 모든 애플리케이션 테이블: 기본 권한 제거 후 필요한 작업만 부여.
do $$ declare t text; begin
  foreach t in array array['members','profiles','media_assets','user_preferences','habit_fields','diary_entries','entry_assets','comments','reactions','entry_reads'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant select on public.members,public.profiles,public.media_assets,public.user_preferences,public.habit_fields,
  public.diary_entries,public.entry_assets,public.comments,public.reactions,public.entry_reads to authenticated;
grant update(nickname,avatar_asset_id,main_color,background_color) on public.profiles to authenticated;
grant update(streak_mode,default_paper,default_font,default_background_asset_id,default_font_asset_id) on public.user_preferences to authenticated;
grant insert(id,owner_id,kind,bucket_id,object_path,name,mime_type,byte_size),update(name,archived),delete on public.media_assets to authenticated;
grant insert(id,owner_id,name,type,unit,position),update(name,unit,position,archived) on public.habit_fields to authenticated;
grant insert(id,author_id,diary_date,title,status,tags,document),update(diary_date,title,status,tags,document),delete on public.diary_entries to authenticated;
grant insert(id,entry_id,author_id,content,image_asset_id),update(content,image_asset_id),delete on public.comments to authenticated;
grant insert(entry_id,user_id,emoji),delete on public.reactions to authenticated;
grant insert(entry_id,user_id),update(last_read_at),delete on public.entry_reads to authenticated;

create policy members_self_read on public.members for select to authenticated using(id=(select auth.uid()));
create policy profiles_read on public.profiles for select to authenticated using((select milktea_private.is_member()));
create policy profiles_update on public.profiles for update to authenticated
  using((select milktea_private.is_member()) and id=(select auth.uid()))
  with check((select milktea_private.is_member()) and id=(select auth.uid()));
create policy preferences_self on public.user_preferences for all to authenticated
  using((select milktea_private.is_member()) and user_id=(select auth.uid()))
  with check((select milktea_private.is_member()) and user_id=(select auth.uid()));
create policy habits_self on public.habit_fields for all to authenticated
  using((select milktea_private.is_member()) and owner_id=(select auth.uid()))
  with check((select milktea_private.is_member()) and owner_id=(select auth.uid()));
create policy entries_read on public.diary_entries for select to authenticated
  using((select milktea_private.is_member()) and (status='published' or author_id=(select auth.uid())));
create policy entries_insert on public.diary_entries for insert to authenticated
  with check((select milktea_private.is_member()) and author_id=(select auth.uid()));
create policy entries_update on public.diary_entries for update to authenticated
  using((select milktea_private.is_member()) and author_id=(select auth.uid()))
  with check((select milktea_private.is_member()) and author_id=(select auth.uid()));
create policy entries_delete on public.diary_entries for delete to authenticated
  using((select milktea_private.is_member()) and author_id=(select auth.uid()));
create policy entry_assets_read on public.entry_assets for select to authenticated using(milktea_private.can_read_entry(entry_id));
create policy assets_read on public.media_assets for select to authenticated using(milktea_private.can_read_asset(id));
create policy assets_insert on public.media_assets for insert to authenticated
  with check((select milktea_private.is_member()) and owner_id=(select auth.uid()));
create policy assets_update on public.media_assets for update to authenticated
  using((select milktea_private.is_member()) and owner_id=(select auth.uid()))
  with check((select milktea_private.is_member()) and owner_id=(select auth.uid()));
create policy assets_delete on public.media_assets for delete to authenticated
  using((select milktea_private.is_member()) and owner_id=(select auth.uid()) and not milktea_private.asset_in_use(id));
create policy comments_read on public.comments for select to authenticated using(milktea_private.can_read_entry(entry_id));
create policy comments_insert on public.comments for insert to authenticated
  with check(author_id=(select auth.uid()) and milktea_private.is_published(entry_id));
create policy comments_update on public.comments for update to authenticated
  using(author_id=(select auth.uid()) and milktea_private.is_published(entry_id))
  with check(author_id=(select auth.uid()) and milktea_private.is_published(entry_id));
create policy comments_delete on public.comments for delete to authenticated
  using((select milktea_private.is_member()) and (author_id=(select auth.uid()) or milktea_private.owns_entry(entry_id)));
create policy reactions_read on public.reactions for select to authenticated using(milktea_private.can_read_entry(entry_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check(user_id=(select auth.uid()) and milktea_private.is_published(entry_id));
create policy reactions_delete on public.reactions for delete to authenticated
  using((select milktea_private.is_member()) and user_id=(select auth.uid()));
create policy reads_self on public.entry_reads for all to authenticated
  using((select milktea_private.is_member()) and user_id=(select auth.uid()))
  with check((select milktea_private.is_member()) and user_id=(select auth.uid()) and milktea_private.can_read_entry(entry_id));

-- 저장 RPC: 호출자 권한/RLS로 실행, 문서 및 파일 참조가 한 트랜잭션에서 저장됨.
create function public.save_entry(p_id uuid,p_expected_version integer,p_date date,p_title text,p_status text,p_tags text[],p_document jsonb)
returns public.diary_entries language plpgsql security invoker set search_path = '' as $$
declare result public.diary_entries;
begin
  if not milktea_private.is_member() then raise exception 'MEMBER_REQUIRED' using errcode='42501'; end if;
  if p_expected_version=0 then
    insert into public.diary_entries(id,author_id,diary_date,title,status,tags,document)
    values(p_id,auth.uid(),p_date,p_title,p_status,p_tags,p_document) returning * into result;
  else
    update public.diary_entries set diary_date=p_date,title=p_title,status=p_status,tags=p_tags,document=p_document
    where id=p_id and author_id=auth.uid() and version=p_expected_version returning * into result;
    if not found then raise exception 'ENTRY_CHANGED_OR_UNAVAILABLE' using errcode='P0001'; end if;
  end if;
  return result;
end $$;
create function public.mark_entry_read(p_entry_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.entry_reads(entry_id,user_id) values(p_entry_id,auth.uid())
  on conflict(entry_id,user_id) do update set last_read_at=now();
end $$;

-- 비공개 버킷: 서명 URL을 DB에 저장하지 않고 bucket_id/object_path만 저장.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('avatars','avatars',false,1048576,array['image/png','image/webp','image/jpeg']),
 ('diary-images','diary-images',false,8388608,array['image/png','image/webp','image/jpeg']),
 ('stickers','stickers',false,2097152,array['image/png','image/webp']),
 ('backgrounds','backgrounds',false,8388608,array['image/png','image/webp','image/jpeg']),
 ('fonts','fonts',false,10485760,array['font/woff2','font/woff','font/ttf','font/otf','application/font-woff','application/x-font-ttf','application/x-font-opentype','application/vnd.ms-opentype']);
create policy milktea_storage_read on storage.objects for select to authenticated
  using(bucket_id in ('avatars','diary-images','stickers','backgrounds','fonts') and milktea_private.can_read_object(bucket_id,name));
create policy milktea_storage_insert on storage.objects for insert to authenticated
  with check(bucket_id in ('avatars','diary-images','stickers','backgrounds','fonts')
    and (select milktea_private.is_member()) and split_part(name,'/',1)=(select auth.uid())::text
    and split_part(name,'/',2)<>'' and name !~ '(^|/)\.\.(/|$)');
create policy milktea_storage_delete on storage.objects for delete to authenticated
  using(bucket_id in ('avatars','diary-images','stickers','backgrounds','fonts') and milktea_private.can_delete_object(bucket_id,name));
-- UPDATE 정책 없음: 파일 덮어쓰기(upsert/move) 금지, 수정 파일은 새 UUID 경로로 업로드.

-- SECURITY DEFINER 함수는 private 스키마에만 두고, RLS에서 사용하는 함수만 실행 허용.
revoke all on all functions in schema milktea_private from public,anon,authenticated;
grant execute on function milktea_private.is_member(),milktea_private.can_read_entry(uuid),milktea_private.is_published(uuid),
  milktea_private.owns_entry(uuid),milktea_private.asset_in_use(uuid),milktea_private.can_read_asset(uuid),
  milktea_private.can_read_object(text,text),milktea_private.can_delete_object(text,text) to authenticated;
revoke all on function public.save_entry(uuid,integer,date,text,text,text[],jsonb),public.mark_entry_read(uuid) from public,anon,authenticated;
grant execute on function public.save_entry(uuid,integer,date,text,text,text[],jsonb),public.mark_entry_read(uuid) to authenticated;
commit;
