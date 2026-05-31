create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  provider text,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  category text not null default '자유 게시판',
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 4000),
  card_id uuid references public.cards(id) on delete set null,
  view_count integer not null default 0 check (view_count >= 0),
  like_count integer not null default 0 check (like_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1200),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_display_name_idx on public.profiles(display_name);
create index if not exists community_posts_author_created_idx on public.community_posts(author_id, created_at desc);
create index if not exists community_posts_category_created_idx on public.community_posts(category, created_at desc) where is_deleted = false;
create index if not exists community_posts_card_created_idx on public.community_posts(card_id, created_at desc) where card_id is not null;
create index if not exists community_comments_post_created_idx on public.community_comments(post_id, created_at);
create index if not exists community_comments_author_created_idx on public.community_comments(author_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists community_posts_set_updated_at on public.community_posts;
create trigger community_posts_set_updated_at
before update on public.community_posts
for each row execute function public.set_updated_at();

drop trigger if exists community_comments_set_updated_at on public.community_comments;
create trigger community_comments_set_updated_at
before update on public.community_comments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, provider)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Riftbound Collector'
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    coalesce(new.raw_app_meta_data ->> 'provider', 'oauth')
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    provider = excluded.provider,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.profiles (id, display_name, avatar_url, provider)
select
  users.id,
  coalesce(
    nullif(users.raw_user_meta_data ->> 'name', ''),
    nullif(users.raw_user_meta_data ->> 'full_name', ''),
    nullif(split_part(users.email, '@', 1), ''),
    'Riftbound Collector'
  ),
  coalesce(users.raw_user_meta_data ->> 'avatar_url', users.raw_user_meta_data ->> 'picture'),
  coalesce(users.raw_app_meta_data ->> 'provider', 'oauth')
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;

drop policy if exists "Public read profiles" on public.profiles;
create policy "Public read profiles"
on public.profiles for select
using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Public read active community posts" on public.community_posts;
create policy "Public read active community posts"
on public.community_posts for select
using (is_deleted = false);

drop policy if exists "Members create own community posts" on public.community_posts;
create policy "Members create own community posts"
on public.community_posts for insert
to authenticated
with check ((select auth.uid()) = author_id);

drop policy if exists "Authors update own community posts" on public.community_posts;
create policy "Authors update own community posts"
on public.community_posts for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

drop policy if exists "Authors delete own community posts" on public.community_posts;
create policy "Authors delete own community posts"
on public.community_posts for delete
to authenticated
using ((select auth.uid()) = author_id);

drop policy if exists "Public read active community comments" on public.community_comments;
create policy "Public read active community comments"
on public.community_comments for select
using (is_deleted = false);

drop policy if exists "Members create own community comments" on public.community_comments;
create policy "Members create own community comments"
on public.community_comments for insert
to authenticated
with check ((select auth.uid()) = author_id);

drop policy if exists "Authors update own community comments" on public.community_comments;
create policy "Authors update own community comments"
on public.community_comments for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

drop policy if exists "Authors delete own community comments" on public.community_comments;
create policy "Authors delete own community comments"
on public.community_comments for delete
to authenticated
using ((select auth.uid()) = author_id);
