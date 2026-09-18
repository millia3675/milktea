begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  entry_id uuid not null references public.diary_entries(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  kind text not null check (kind in ('entry_comment','comment_reply')),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(recipient_id,comment_id),
  check(recipient_id<>actor_id)
);
create index notifications_recipient_idx on public.notifications(recipient_id,created_at desc,id desc);
create index notifications_unread_idx on public.notifications(recipient_id) where read_at is null;
create index notifications_comment_idx on public.notifications(comment_id);
create index notifications_entry_idx on public.notifications(entry_id);
create index notifications_actor_idx on public.notifications(actor_id);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
create policy notifications_self on public.notifications for select to authenticated
  using(recipient_id=(select auth.uid()) and milktea_private.is_published(entry_id));

create function milktea_private.notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare diary_owner uuid; reply_owner uuid;
begin
  select author_id into diary_owner from public.diary_entries where id=new.entry_id and status='published';
  if diary_owner is null then return new; end if;
  select author_id into reply_owner from public.comments where id=new.parent_id and entry_id=new.entry_id;
  -- A reply to the diary owner's comment is one reply notification, not two.
  insert into public.notifications(recipient_id,actor_id,entry_id,comment_id,kind,created_at)
    select m.id,new.author_id,new.entry_id,new.id,'comment_reply',new.created_at
    from public.members m where m.id=reply_owner and m.active and m.id<>new.author_id;
  insert into public.notifications(recipient_id,actor_id,entry_id,comment_id,kind,created_at)
    select m.id,new.author_id,new.entry_id,new.id,'entry_comment',new.created_at
    from public.members m where m.id=diary_owner and m.active and m.id<>new.author_id
    on conflict(recipient_id,comment_id) do nothing;
  return new;
end $$;
revoke all on function milktea_private.notify_comment() from public,anon,authenticated;
create trigger notify_comment after insert on public.comments
  for each row execute function milktea_private.notify_comment();

create function public.mark_notifications_read(p_ids uuid[] default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not milktea_private.is_member() then raise exception 'MEMBER_REQUIRED' using errcode='42501'; end if;
  update public.notifications set read_at=now()
    where recipient_id=(select auth.uid()) and read_at is null
      and (p_ids is null or id=any(p_ids)) and milktea_private.is_published(entry_id);
end $$;
revoke all on function public.mark_notifications_read(uuid[]) from public,anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Existing conversations remain available as history without a flood of unread alerts.
insert into public.notifications(recipient_id,actor_id,entry_id,comment_id,kind,created_at,read_at)
select p.author_id,c.author_id,c.entry_id,c.id,'comment_reply',c.created_at,now()
from public.comments c join public.comments p on p.id=c.parent_id and p.entry_id=c.entry_id
join public.diary_entries e on e.id=c.entry_id and e.status='published'
join public.members m on m.id=p.author_id and m.active
where p.author_id<>c.author_id;
insert into public.notifications(recipient_id,actor_id,entry_id,comment_id,kind,created_at,read_at)
select e.author_id,c.author_id,c.entry_id,c.id,'entry_comment',c.created_at,now()
from public.comments c join public.diary_entries e on e.id=c.entry_id and e.status='published'
join public.members m on m.id=e.author_id and m.active
where e.author_id<>c.author_id on conflict(recipient_id,comment_id) do nothing;

commit;
