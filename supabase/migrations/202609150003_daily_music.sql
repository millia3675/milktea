-- 밀크티: 일기 JSON에 선택적인 오늘의 음악 추가. 기존 일기는 그대로 유지.
-- initial, decoration_library를 적용한 다음 한 번 실행합니다.
begin;
create function milktea_private.validate_entry_music() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m jsonb := new.document->'music';
begin
  if m is null or m = 'null'::jsonb then return new; end if;
  if jsonb_typeof(m) is distinct from 'object' then
    raise exception 'INVALID_MUSIC' using errcode='23514';
  end if;
  if jsonb_typeof(m->'url') is distinct from 'string'
    or jsonb_typeof(m->'title') is distinct from 'string'
    or char_length(m->>'title') > 120
    or (m->>'url') !~ '^https://(www[.]youtube[.]com|music[.]youtube[.]com)/(watch[?]v=[A-Za-z0-9_-]{11}|playlist[?]list=[A-Za-z0-9_-]{2,128})$'
    or exists(select 1 from jsonb_object_keys(m) k where k not in ('url','title')) then
    raise exception 'INVALID_MUSIC' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function milktea_private.validate_entry_music() from public, anon, authenticated;
create trigger diary_music_validate before insert or update on public.diary_entries
  for each row execute function milktea_private.validate_entry_music();
commit;
