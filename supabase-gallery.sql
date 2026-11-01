-- Run this script once in the Supabase SQL Editor for this project.
-- It uses only the public publishable key in the website; never put a
-- service-role key in the website.

create table if not exists public.gallery_items (
  media_id text primary key check (media_id ~ '^gallery-(image|video)-[a-z0-9-]+$'),
  media_type text not null check (media_type in ('image', 'video'))
);

insert into public.gallery_items (media_id, media_type) values
  ('gallery-image-gallery-1-jpg', 'image'),
  ('gallery-image-gallery-2-jpg', 'image'),
  ('gallery-image-gallery-3-jpg', 'image'),
  ('gallery-image-gallery-portrait-teal-png', 'image'),
  ('gallery-image-gallery-portrait-emerald-png', 'image'),
  ('gallery-image-gallery-community-gathering-png', 'image'),
  ('gallery-image-gallery-conference-greeting-png', 'image'),
  ('gallery-image-gallery-leadership-address-png', 'image'),
  ('gallery-image-birthday-celebration-poster-png', 'image'),
  ('gallery-image-bishop-ajayi-birthday-tribute-png', 'image'),
  ('gallery-image-gallery-birthday-arrival-png', 'image'),
  ('gallery-image-gallery-birthday-procession-png', 'image'),
  ('gallery-image-gallery-family-cake-png', 'image'),
  ('gallery-image-gallery-congregation-prayer-png', 'image'),
  ('gallery-image-gallery-birthday-greeting-png', 'image'),
  ('gallery-image-gallery-family-celebration-png', 'image'),
  ('gallery-image-gallery-congregation-worship-png', 'image'),
  ('gallery-image-gallery-church-gathering-png', 'image'),
  ('gallery-image-gallery-birthday-guests-png', 'image'),
  ('gallery-image-gallery-birthday-cake-png', 'image'),
  ('gallery-image-gallery-celebration-guests-png', 'image'),
  ('gallery-image-gallery-celebration-sermon-png', 'image'),
  ('gallery-image-gallery-church-service-png', 'image'),
  ('gallery-image-gallery-church-band-png', 'image'),
  ('gallery-image-gallery-choir-gathering-png', 'image'),
  ('gallery-image-gallery-womens-fellowship-png', 'image'),
  ('gallery-image-gallery-congregation-prayer-2-png', 'image'),
  ('gallery-image-gallery-celebration-address-png', 'image'),
  ('gallery-image-gallery-birthday-cake-2-png', 'image'),
  ('gallery-image-gallery-celebration-guests-2-png', 'image'),
  ('gallery-image-gallery-womens-celebration-png', 'image'),
  ('gallery-image-gallery-birthday-procession-2-png', 'image'),
  ('gallery-image-gallery-portrait-blue-png', 'image'),
  ('gallery-image-whatsapp-image-2026-10-27-at-13-40-47-jpeg', 'image'),
  ('gallery-image-archbishop-profile-png', 'image'),
  ('gallery-image-birthday-scripture-tribute-png', 'image'),
  ('gallery-image-dangerous-ships-quote-png', 'image'),
  ('gallery-image-escape-the-snare-sermon-png', 'image'),
  ('gallery-image-intentions-and-visions-png', 'image'),
  ('gallery-image-archbishop-white-attire-png', 'image'),
  ('gallery-image-salvation-redemption-sermon-png', 'image'),
  ('gallery-video-archbishop-birthday-video-mp4', 'video'),
  ('gallery-video-archbishop-birthday-video-2-mp4', 'video'),
  ('gallery-video-whatsapp-video-2026-10-27-at-09-21-48-mp4', 'video')
on conflict (media_id) do update
set media_type = excluded.media_type;

create table if not exists public.gallery_likes (
  media_id text not null references public.gallery_items (media_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (media_id, user_id)
);

create table if not exists public.gallery_comments (
  id bigint generated always as identity primary key,
  media_id text not null references public.gallery_items (media_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists gallery_comments_media_created_idx
  on public.gallery_comments (media_id, created_at desc);
create index if not exists gallery_comments_user_created_idx
  on public.gallery_comments (user_id, created_at desc);

alter table public.gallery_items enable row level security;
alter table public.gallery_likes enable row level security;
alter table public.gallery_comments enable row level security;

drop policy if exists "Gallery items are public" on public.gallery_items;
create policy "Gallery items are public"
  on public.gallery_items for select
  to anon, authenticated
  using (true);

drop policy if exists "Gallery likes are readable" on public.gallery_likes;
drop policy if exists "Visitors can read their own likes" on public.gallery_likes;
create policy "Visitors can read their own likes"
  on public.gallery_likes for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Visitors can like gallery items" on public.gallery_likes;
create policy "Visitors can like gallery items"
  on public.gallery_likes for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.gallery_items
      where gallery_items.media_id = gallery_likes.media_id
    )
  );

drop policy if exists "Visitors can remove their own likes" on public.gallery_likes;
create policy "Visitors can remove their own likes"
  on public.gallery_likes for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Gallery comments are readable" on public.gallery_comments;
create policy "Gallery comments are readable"
  on public.gallery_comments for select
  to anon, authenticated
  using (true);

drop policy if exists "Visitors can submit their own comments" on public.gallery_comments;
create policy "Visitors can submit their own comments"
  on public.gallery_comments for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.gallery_items
      where gallery_items.media_id = gallery_comments.media_id
    )
  );

-- A view exposes aggregate counts without exposing the user IDs stored in the
-- likes table. A second view gives each visitor only their own liked item IDs.
create or replace view public.gallery_like_counts as
select
  items.media_id,
  count(likes.user_id)::bigint as like_count
from public.gallery_items as items
left join public.gallery_likes as likes on likes.media_id = items.media_id
group by items.media_id;

create or replace view public.gallery_my_likes as
select media_id
from public.gallery_likes
where user_id = (select auth.uid());

comment on view public.gallery_like_counts is
  'Public gallery like totals; does not expose visitor identities.';
comment on view public.gallery_my_likes is
  'Only the current authenticated visitor''s liked gallery item IDs.';

-- Comments are public by design, but the visitor UUID is never granted for
-- reading. No UPDATE or DELETE access/policies are given to website visitors.
revoke all on public.gallery_items, public.gallery_likes, public.gallery_comments
  from anon, authenticated;
grant select on public.gallery_items to anon, authenticated;
grant select (media_id, user_id) on public.gallery_likes to authenticated;
grant insert (media_id, user_id) on public.gallery_likes to authenticated;
grant delete on public.gallery_likes to authenticated;
grant select (id, media_id, display_name, body, created_at)
  on public.gallery_comments to anon, authenticated;
grant insert (media_id, user_id, display_name, body)
  on public.gallery_comments to authenticated;
grant select on public.gallery_like_counts, public.gallery_my_likes
  to anon, authenticated;

create or replace function public.check_gallery_comment_spam()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_item_comment boolean;
  recent_comment_count integer;
begin
  new.display_name := btrim(new.display_name);
  new.body := btrim(new.body);

  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'Comment author does not match the signed-in visitor.';
  end if;

  if char_length(new.display_name) not between 1 and 60
     or char_length(new.body) not between 1 and 500 then
    raise exception 'Display name must be 1-60 characters and comment must be 1-500 characters.';
  end if;

  select exists (
    select 1
    from public.gallery_comments
    where user_id = new.user_id
      and media_id = new.media_id
      and created_at > now() - interval '30 seconds'
  )
  into recent_item_comment;

  if recent_item_comment then
    raise exception 'Please wait 30 seconds before commenting on this item again.';
  end if;

  select count(*)::integer
  from public.gallery_comments
  where user_id = new.user_id
    and created_at > now() - interval '10 minutes'
  into recent_comment_count;

  if recent_comment_count >= 20 then
    raise exception 'Comment limit reached. Please try again later.';
  end if;

  return new;
end;
$$;

revoke all on function public.check_gallery_comment_spam() from public, anon, authenticated;
drop trigger if exists check_gallery_comment_spam on public.gallery_comments;
create trigger check_gallery_comment_spam
  before insert on public.gallery_comments
  for each row execute function public.check_gallery_comment_spam();
