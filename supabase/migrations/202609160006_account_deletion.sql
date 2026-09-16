-- Self-service deletion is authorized by the Edge Function after password verification.
-- Only service_role can start/finish it; ordinary clients can read their own status.
begin;
create table milktea_private.account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null default now()
);
alter table milktea_private.account_deletions enable row level security;
revoke all on milktea_private.account_deletions from public, anon, authenticated;

create function public.account_deletion_pending() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from milktea_private.account_deletions where user_id=(select auth.uid()));
$$;
revoke all on function public.account_deletion_pending() from public, anon;
grant execute on function public.account_deletion_pending() to authenticated;

create function public.begin_account_deletion(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into milktea_private.account_deletions(user_id) values(p_user_id) on conflict do nothing;
  -- Outstanding JWTs immediately lose access through the existing membership policies.
  update public.members set active=false where id=p_user_id;
end $$;

create function public.account_deletion_objects(p_user_id uuid)
returns table(bucket_id text, object_path text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id, o.name from storage.objects o
  where exists(select 1 from milktea_private.account_deletions where user_id=p_user_id)
    and (o.owner_id=p_user_id::text or (
      o.bucket_id in ('avatars','diary-images','stickers','backgrounds','fonts')
      and split_part(o.name,'/',1)=p_user_id::text))
  order by o.bucket_id,o.name limit 1000;
$$;

create function public.finish_account_deletion(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r record; d jsonb; owned uuid[];
begin
  -- Serialize changes to shared decorations and their references for this short transaction.
  lock table public.members, public.profiles, public.media_assets, public.user_preferences,
    public.habit_fields, public.diary_entries, public.entry_assets, public.comments,
    public.reactions, public.entry_reads in share row exclusive mode;
  if not exists(select 1 from milktea_private.account_deletions where user_id=p_user_id) then
    raise exception 'DELETION_NOT_STARTED';
  end if;
  if exists(select 1 from public.account_deletion_objects(p_user_id)) then
    raise exception 'STORAGE_CLEANUP_REQUIRED';
  end if;
  select coalesce(array_agg(id),'{}'::uuid[]) into owned from public.media_assets where owner_id=p_user_id;
  delete from public.diary_entries where author_id=p_user_id;
  delete from public.comments where author_id=p_user_id;
  delete from public.reactions where user_id=p_user_id;
  delete from public.entry_reads where user_id=p_user_id;
  delete from public.user_preferences where user_id=p_user_id;
  delete from public.habit_fields where owner_id=p_user_id;

  -- Keep friends' text, photos, music and layout. Remove only this member's decorations.
  for r in select e.id,e.document from public.diary_entries e where exists(
    select 1 from public.entry_assets a where a.entry_id=e.id and a.asset_id=any(owned))
  loop
    d := jsonb_set(r.document,'{stickers}',coalesce((
      select jsonb_agg(s.value order by s.ordinality)
      from jsonb_array_elements(r.document->'stickers') with ordinality s
      where not ((s.value->>'asset_id')::uuid=any(owned))),'[]'::jsonb));
    if (d->>'background_asset_id')::uuid=any(owned) then
      d := (d-'background_asset_id') || '{"paper":"white"}'::jsonb;
    end if;
    if (d->>'font_asset_id')::uuid=any(owned) then
      d := (d-'font_asset_id') || '{"font":"system"}'::jsonb;
    end if;
    -- Existing triggers validate the document, increment its version and rebuild references.
    update public.diary_entries set document=d where id=r.id;
  end loop;
  update public.user_preferences set default_background_asset_id=null, default_paper='white'
    where default_background_asset_id=any(owned);
  update public.user_preferences set default_font_asset_id=null, default_font='system'
    where default_font_asset_id=any(owned);
  update public.profiles set avatar_asset_id=null where id=p_user_id;
  delete from public.media_assets where owner_id=p_user_id;
  delete from public.profiles where id=p_user_id;
  delete from public.members where id=p_user_id;
  -- Keep the job until Auth deletion succeeds, so a failed final request can be retried.
end $$;

revoke all on function public.begin_account_deletion(uuid), public.account_deletion_objects(uuid),
  public.finish_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.begin_account_deletion(uuid), public.account_deletion_objects(uuid),
  public.finish_account_deletion(uuid) to service_role;
commit;
