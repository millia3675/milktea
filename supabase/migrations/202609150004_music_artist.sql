-- 오늘의 음악에 선택적인 가수명을 추가합니다. 기존 url/title 문서는 유지합니다.
begin;
create or replace function milktea_private.validate_entry_music() returns trigger
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
    or (m ? 'artist' and (jsonb_typeof(m->'artist') is distinct from 'string'
      or char_length(m->>'artist') > 120))
    or (m->>'url') !~ '^https://(www[.]youtube[.]com|music[.]youtube[.]com)/(watch[?]v=[A-Za-z0-9_-]{11}|playlist[?]list=[A-Za-z0-9_-]{2,128})$'
    or exists(select 1 from jsonb_object_keys(m) k where k not in ('url','title','artist')) then
    raise exception 'INVALID_MUSIC' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function milktea_private.validate_entry_music() from public, anon, authenticated;
commit;
