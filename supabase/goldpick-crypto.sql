-- Gold Pick cryptocurrency order storage + exactly-once VIP fulfillment
-- Prerequisite: supabase/goldpick-vip.sql
-- Run in Supabase SQL Editor as project owner. NEVER put secret keys into GitHub Pages.

create table if not exists public.goldpick_crypto_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_days integer not null check (plan_days in (1,7,30,90,365)),
  price_usd numeric(12,2) not null check (price_usd > 0),
  pay_currency text not null,
  pay_amount numeric(30,14),
  pay_address text,
  pay_extra_id text,
  provider_payment_id text unique,
  provider_status text not null default 'creating',
  last_checked_at timestamptz,
  submitted_txid text,
  submitted_at timestamptz,
  txid_submission_count integer not null default 0,
  payin_hash text,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  constraint gp_order_pay_currency_safe check (pay_currency ~ '^[a-z0-9]{2,30}$'),
  constraint gp_order_valid_amount check (pay_amount is null or pay_amount > 0)
);

create index if not exists gp_crypto_orders_user_created
  on public.goldpick_crypto_orders (user_id, created_at desc);
create index if not exists gp_crypto_orders_unfulfilled
  on public.goldpick_crypto_orders (created_at desc)
  where fulfilled_at is null and provider_payment_id is not null;
create unique index if not exists gp_crypto_orders_claimed_txid
  on public.goldpick_crypto_orders (lower(submitted_txid))
  where submitted_txid is not null;

alter table public.goldpick_crypto_orders enable row level security;
revoke all on public.goldpick_crypto_orders from public, anon, authenticated;
grant select on public.goldpick_crypto_orders to authenticated;
grant all on public.goldpick_crypto_orders to service_role;
drop policy if exists "crypto_orders_select_own" on public.goldpick_crypto_orders;
create policy "crypto_orders_select_own"
  on public.goldpick_crypto_orders for select to authenticated
  using (user_id = (select auth.uid()));

-- Non-admin members may submit a transaction hash for THEIR OWN order,
-- but this never grants a VIP entitlement or marks any payment as finished.
create or replace function public.goldpick_submit_payment_txid(
  p_order_id uuid, p_txid text
) returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.goldpick_crypto_orders%rowtype;
  v_txid text;
begin
  if v_user_id is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  v_txid := lower(pg_catalog.btrim(coalesce(p_txid, '')));
  if v_txid !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false,
      'message', '이 네트워크에서는 64자리 트랜잭션 해시만 지원합니다.');
  end if;
  select * into v_order from public.goldpick_crypto_orders
    where id = p_order_id and user_id = v_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', '결제 요청을 찾을 수 없습니다.');
  end if;
  if v_order.fulfilled_at is not null then
    return jsonb_build_object('ok', true, 'message', '이미 VIP가 지급된 결제입니다.');
  end if;
  if v_order.provider_payment_id is null then
    return jsonb_build_object('ok', false, 'message', '결제 요청 생성이 완료되지 않았습니다.');
  end if;
  if v_order.submitted_txid is not null and v_order.submitted_txid = v_txid then
    return jsonb_build_object('ok', true, 'message', '이미 접수된 TXID입니다. 입금 상태를 재확인해 주세요.');
  end if;
  if v_order.txid_submission_count >= 3 then
    return jsonb_build_object('ok', false,
      'message', 'TXID 수정 횟수를 초과했습니다. 운영자에게 문의해 주세요.');
  end if;
  update public.goldpick_crypto_orders set
    submitted_txid = v_txid,
    submitted_at = now(),
    txid_submission_count = txid_submission_count + 1,
    updated_at = now()
  where id = p_order_id;
  return jsonb_build_object('ok', true,
    'message', 'TXID가 접수됐습니다. 서버 재검증과 필요 시 운영자 검토가 진행됩니다.');
exception when unique_violation then
  return jsonb_build_object('ok', false,
    'message', '이미 다른 주문에 등록된 TXID입니다.');
end;
$$;
revoke execute on function public.goldpick_submit_payment_txid(uuid,text)
  from public, anon, authenticated;
grant execute on function public.goldpick_submit_payment_txid(uuid,text)
  to authenticated;

-- Called ONLY by the secret-bearing Worker after independently verifying
-- provider payment ID, status, amount, asset AND deposit address.
-- Row locking makes retrying webhooks/cron safe: one payment = one grant.
create or replace function public.goldpick_finalize_crypto_order(
  p_order_id uuid,
  p_payment_id text,
  p_currency text,
  p_pay_address text,
  p_pay_amount numeric,
  p_actually_paid numeric,
  p_payin_hash text default null
) returns jsonb language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_order public.goldpick_crypto_orders%rowtype;
  v_start timestamptz;
  v_expiry timestamptz;
  v_existing public.vip_memberships%rowtype;
begin
  select * into v_order from public.goldpick_crypto_orders
    where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok',false,'reason','order_missing');
  end if;
  if v_order.fulfilled_at is not null then
    return jsonb_build_object('ok',true,'already_fulfilled',true);
  end if;
  if v_order.provider_payment_id is null
    or v_order.provider_payment_id <> p_payment_id
    or lower(v_order.pay_currency) <> lower(coalesce(p_currency,''))
    or v_order.pay_address is null
    or v_order.pay_address <> p_pay_address
    or v_order.pay_amount is null
    or p_pay_amount is null
    or v_order.pay_amount <> p_pay_amount
    or p_actually_paid is null
    or p_actually_paid < v_order.pay_amount
  then
    return jsonb_build_object('ok',false,'reason','payment_mismatch_or_underpaid');
  end if;

  -- Serialize simultaneous payments for the same customer, including first grants.
  perform 1 from auth.users where id = v_order.user_id for update;
  select * into v_existing from public.vip_memberships
    where user_id = v_order.user_id for update;
  if found and v_existing.expires_at > now() then
    v_start := v_existing.starts_at;
    v_expiry := v_existing.expires_at + pg_catalog.make_interval(days => v_order.plan_days);
  else
    v_start := now();
    v_expiry := v_start + pg_catalog.make_interval(days => v_order.plan_days);
  end if;
  insert into public.vip_memberships (user_id, starts_at, expires_at)
    values (v_order.user_id,v_start,v_expiry)
  on conflict (user_id) do update set
    starts_at = excluded.starts_at,
    expires_at = excluded.expires_at;
  update public.goldpick_crypto_orders set
    provider_status = 'finished', fulfilled_at = now(),
    payin_hash = coalesce(nullif(p_payin_hash,''),payin_hash),
    updated_at = now()
  where id = p_order_id;
  return jsonb_build_object('ok',true,'already_fulfilled',false,'expires_at',v_expiry);
end;
$$;
revoke execute on function public.goldpick_finalize_crypto_order(
  uuid,text,text,text,numeric,numeric,text
) from public, anon, authenticated;
grant execute on function public.goldpick_finalize_crypto_order(
  uuid,text,text,text,numeric,numeric,text
) to service_role;

-- No public payment creation/update. All payment details are generated by
-- a Cloudflare Worker with secret service_role key, verified user JWT,
-- immutable server-side prices, and merchant NOWPayments API credentials.

-- Admin-only review queue for missed deposits and submitted TXIDs.
-- A review entry does NOT confirm the transfer and never grants VIP.
create or replace function public.goldpick_admin_crypto_cases(
  p_limit integer default 30
) returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_items jsonb;
begin
  if v_admin_id is null or not exists (
    select 1 from public.goldpick_admins
    where user_id = v_admin_id
  ) then
    raise exception '관리자 권한이 없습니다.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'email', t.email,
    'days', t.plan_days,
    'currency', t.pay_currency,
    'amount', t.pay_amount,
    'address', t.pay_address,
    'provider_payment_id', t.provider_payment_id,
    'provider_status', t.provider_status,
    'txid', t.submitted_txid,
    'payin_hash', t.payin_hash,
    'created_at', t.created_at,
    'fulfilled_at', t.fulfilled_at
  )), '[]'::jsonb)
  into v_items
  from (
    select o.*, u.email
    from public.goldpick_crypto_orders o
    join auth.users u on u.id = o.user_id
    where o.submitted_txid is not null
       or o.provider_status = 'needs_review'
    order by o.submitted_at desc nulls last, o.created_at desc
    limit least(greatest(coalesce(p_limit,30),1),50)
  ) t;
  return v_items;
end;
$$;
revoke execute on function public.goldpick_admin_crypto_cases(integer)
  from public, anon, authenticated;
grant execute on function public.goldpick_admin_crypto_cases(integer)
  to authenticated;
