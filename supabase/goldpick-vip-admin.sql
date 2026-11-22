-- Gold Pick — Secure VIP admin controls (run AFTER goldpick-vip.sql)
-- Requires Supabase project owner to run in SQL Editor.
-- Never put a service_role or secret API key in this website.

create table if not exists public.goldpick_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.goldpick_admins enable row level security;
revoke all on public.goldpick_admins from public, anon, authenticated;
grant all on public.goldpick_admins to service_role;

create table if not exists public.goldpick_vip_audit (
  id bigint generated always as identity primary key,
  performed_at timestamptz not null default now(),
  admin_user_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  operation text not null check (operation in ('grant','extend','revoke')),
  duration_days integer,
  old_expires_at timestamptz,
  new_expires_at timestamptz
);
alter table public.goldpick_vip_audit enable row level security;
revoke all on public.goldpick_vip_audit from public, anon, authenticated;
grant all on public.goldpick_vip_audit to service_role;

create or replace function public.goldpick_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.goldpick_admins
    where user_id = (select auth.uid())
  );
$$;

revoke execute on function public.goldpick_is_admin()
  from public, anon, authenticated;
grant execute on function public.goldpick_is_admin()
  to authenticated;

create or replace function public.goldpick_manage_vip(
  p_email text,
  p_action text,
  p_days integer default null
)
returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_user_id uuid;
  v_email text;
  v_action text;
  v_now timestamptz := now();
  v_start timestamptz;
  v_end timestamptz;
  v_old_end timestamptz;
  v_status text;
begin
  -- CRITICAL: Every privileged call independently checks the authenticated user.
  if v_admin_id is null or not exists (
    select 1 from public.goldpick_admins where user_id = v_admin_id
  ) then
    raise exception '관리자 권한이 없습니다.' using errcode = '42501';
  end if;

  v_email := lower(pg_catalog.btrim(p_email));
  v_action := lower(pg_catalog.btrim(p_action));

  if v_email is null or pg_catalog.char_length(v_email) > 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    return jsonb_build_object('ok', false, 'message', '이메일 주소를 확인해 주세요.');
  end if;

  if v_action not in ('lookup','grant','extend','revoke') then
    return jsonb_build_object('ok', false, 'message', '지원되지 않는 작업입니다.');
  end if;

  if v_action in ('grant','extend') and
     (p_days is null or p_days < 1 or p_days > 3650)
  then
    return jsonb_build_object('ok', false, 'message', '이용 기간은 1~3650일이어야 합니다.');
  end if;

  select u.id, u.email into v_user_id, v_email
    from auth.users u where lower(u.email) = v_email
    limit 1;
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'message', '가입된 회원을 찾지 못했습니다.');
  end if;

  -- Lock target user's Auth row, serializing conflicting grants for that account.
  perform 1 from auth.users where id = v_user_id for update;
  select m.starts_at, m.expires_at into v_start, v_old_end
    from public.vip_memberships m where m.user_id = v_user_id;

  if v_action = 'lookup' then
    v_status := case
      when v_old_end is null then 'free'
      when v_old_end <= v_now then 'expired'
      when v_start > v_now then 'scheduled'
      else 'vip'
    end;
    return jsonb_build_object(
      'ok', true, 'email', v_email, 'status', v_status,
      'starts_at', v_start, 'expires_at', v_old_end
    );
  end if;

  if v_action = 'revoke' then
    delete from public.vip_memberships where user_id = v_user_id;
    v_start := null;
    v_end := null;
  elsif v_action = 'grant' then
    v_start := v_now;
    v_end := v_now + pg_catalog.make_interval(days => p_days);
    insert into public.vip_memberships (user_id, starts_at, expires_at)
      values (v_user_id, v_start, v_end)
    on conflict (user_id) do update set
      starts_at = excluded.starts_at, expires_at = excluded.expires_at;
  else
    v_start := case when v_old_end > v_now then coalesce(v_start, v_now) else v_now end;
    v_end := pg_catalog.greatest(coalesce(v_old_end, v_now), v_now)
             + pg_catalog.make_interval(days => p_days);
    insert into public.vip_memberships (user_id, starts_at, expires_at)
      values (v_user_id, v_start, v_end)
    on conflict (user_id) do update set
      starts_at = excluded.starts_at, expires_at = excluded.expires_at;
  end if;

  insert into public.goldpick_vip_audit (
    admin_user_id, target_user_id, operation,
    duration_days, old_expires_at, new_expires_at
  ) values (
    v_admin_id, v_user_id, v_action,
    case when v_action = 'revoke' then null else p_days end,
    v_old_end, v_end
  );

  return jsonb_build_object(
    'ok', true, 'email', v_email,
    'status', case when v_action = 'revoke' then 'free' else 'vip' end,
    'starts_at', v_start, 'expires_at', v_end,
    'message', case v_action
      when 'grant' then 'VIP 이용권을 지급했습니다.'
      when 'extend' then 'VIP 이용권을 연장했습니다.'
      when 'revoke' then 'VIP 이용권을 회수했습니다.'
    end
  );
end;
$$;

revoke execute on function public.goldpick_manage_vip(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.goldpick_manage_vip(text,text,integer)
  to authenticated;

-- ONE-TIME ADMIN ACTIVATION AFTER YOU CREATE A GOLD PICK ACCOUNT:
-- Run this separately in SQL Editor, replacing the sample email with
-- the exact login email of your own Gold Pick administrator account:
--
-- insert into public.goldpick_admins (user_id)
-- select id from auth.users
-- where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
-- on conflict (user_id) do nothing;
--
-- select * from public.goldpick_admins; -- should show one row
--
-- Keep admin login protected; email confirmation is off for public signup.
-- Don't assign admin rights to a publicly shared or untrusted account.
