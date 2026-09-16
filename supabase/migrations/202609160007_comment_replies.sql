begin;

alter table public.comments
  add column parent_id uuid,
  add column parent_deleted boolean not null default false,
  add constraint comments_entry_id_id_key unique (entry_id, id),
  add constraint comments_not_own_parent check (parent_id is null or parent_id <> id),
  add constraint comments_parent_in_entry_fkey foreign key (entry_id, parent_id)
    references public.comments(entry_id, id) on delete set null (parent_id);
create index comments_parent_idx on public.comments(entry_id, parent_id, created_at, id);

-- A reply always belongs to the same diary. Clients cannot move existing replies
-- or forge deletion markers; the FK alone detaches children when a parent is removed.
create function milktea_private.preserve_comment_thread() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.entry_id is distinct from old.entry_id or
    (new.parent_id is distinct from old.parent_id and new.parent_id is not null) then
    raise exception 'COMMENT_PARENT_IMMUTABLE';
  end if;
  new.parent_deleted := old.parent_deleted or
    (old.parent_id is not null and new.parent_id is null);
  return new;
end $$;
revoke all on function milktea_private.preserve_comment_thread() from public, anon, authenticated;
create trigger preserve_comment_thread before update on public.comments
  for each row execute function milktea_private.preserve_comment_thread();

grant insert(parent_id) on public.comments to authenticated;
commit;
