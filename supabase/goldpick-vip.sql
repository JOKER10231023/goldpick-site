-- Gold Pick VIP membership / article tables
-- Run once in the Supabase SQL Editor as project owner.
-- Browser clients can only SELECT their own membership and published VIP articles.
-- No INSERT/UPDATE/DELETE permission is granted to anonymous or authenticated clients.

create table if not exists public.vip_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  granted_at timestamptz not null default now(),
  constraint vip_memberships_valid_period check (expires_at > starts_at)
);

create table if not exists public.vip_articles (
  id bigint generated always as identity primary key,
  title text not null check (char_length(title) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 500),
  content text not null,
  is_published boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists vip_articles_published_idx
  on public.vip_articles (published_at desc)
  where is_published = true;

alter table public.vip_memberships enable row level security;
alter table public.vip_articles enable row level security;

-- Revoke potentially permissive default grants before exposing the tables.
revoke all on public.vip_memberships from public, anon, authenticated;
revoke all on public.vip_articles from public, anon, authenticated;
grant select on public.vip_memberships to authenticated;
grant select on public.vip_articles to authenticated;
grant all on public.vip_memberships to service_role;
grant all on public.vip_articles to service_role;

drop policy if exists "vip_memberships_select_own" on public.vip_memberships;
create policy "vip_memberships_select_own"
  on public.vip_memberships for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "vip_articles_active_members_only" on public.vip_articles;
create policy "vip_articles_active_members_only"
  on public.vip_articles for select to authenticated
  using (
    is_published = true
    and published_at <= now()
    and exists (
      select 1
      from public.vip_memberships as m
      where m.user_id = (select auth.uid())
        and m.starts_at <= now()
        and m.expires_at > now()
    )
  );

-- Manage memberships and articles only through the Supabase dashboard SQL Editor
-- (project owner) or a properly protected server. NEVER place service_role keys
-- in this GitHub Pages website.
--
-- VIP GRANT EXAMPLE (DO NOT run until you replace the example email):
-- insert into public.vip_memberships (user_id, starts_at, expires_at)
-- select id, now(), now() + interval '30 days'
-- from auth.users
-- where email = 'member@example.com'
-- on conflict (user_id) do update
-- set starts_at = now(), expires_at = now() + interval '30 days';
--
-- VIP ARTICLE EXAMPLE (publish only real, verified content):
-- insert into public.vip_articles (title, summary, content, is_published)
-- values ('제목', '요약', '내용', true);
