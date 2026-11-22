-- GOLD PICK LTC automatic payments — run AFTER goldpick-direct-wallet.sql.
-- LTC only. Shared address + exact unique satoshi amount + >=6 confirmations.
-- Does not establish custodial platform credit. Only use with an authorized receiving wallet.
-- Deploy watcher worker before enabling LTC to avoid unmonitored payment orders.

alter table public.gp_direct_orders
 add column if not exists ltc_expected_sats bigint,
 add column if not exists ltc_matched_txid text,
 add column if not exists ltc_confirmations integer,
 add column if not exists ltc_checked_at timestamptz;
create unique index if not exists gp_ltc_unique_verified_txid
 on public.gp_direct_orders(lower(ltc_matched_txid))
 where ltc_matched_txid is not null;
create unique index if not exists gp_ltc_unique_active_amount
 on public.gp_direct_orders(address_snapshot,ltc_expected_sats)
 where coin='ltc' and network='litecoin' and status in ('awaiting_transfer','txid_submitted');

-- Amount uniqueness across ACTIVE orders; lock order creation for the receiving address.
-- Add 1..999 satoshis to the admin's base price. Amounts are valid 8-decimal LTC.
create or replace function public.gp_direct_create_order(
  p_coin text,p_network text,p_days integer
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_user_id uuid:=auth.uid();
 v_wallet public.gp_direct_wallets%rowtype;
 v_amount numeric;v_order public.gp_direct_orders%rowtype;
 v_sats bigint;v_base bigint;v_attempt integer;
begin
 if v_user_id is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if p_days is null or p_days not in (1,7,30,90,365) then
  return jsonb_build_object('ok',false,'message','이용 기간을 확인해 주세요.');
 end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('gp_direct_order:'||lower(coalesce(p_coin,''))||':'||
   lower(coalesce(p_network,'')),0));
 if exists(select 1 from public.gp_direct_orders
   where user_id=v_user_id and created_at>now()-interval '1 minute') then
  return jsonb_build_object('ok',false,'message','새 주문은 1분 간격으로 생성할 수 있습니다.');
 end if;
 select * into v_wallet from public.gp_direct_wallets
 where coin=lower(coalesce(p_coin,'')) and network=lower(coalesce(p_network,''))
   and enabled=true and length(address)>=12;
 if not found then
  return jsonb_build_object('ok',false,'message','해당 코인·네트워크는 결제할 수 없습니다.');
 end if;
 select amount into v_amount from public.gp_direct_prices
 where coin=v_wallet.coin and network=v_wallet.network and days=p_days;
 if v_amount is null then
  return jsonb_build_object('ok',false,'message','선택한 이용 기간은 판매하지 않습니다.');
 end if;
 if v_wallet.coin='ltc' and v_wallet.network='litecoin' then
  -- Avoid assigning the same amount to a different active order.
  -- Base amount must be an integer satoshi value and large enough for fees.
  if v_amount*100000000<>trunc(v_amount*100000000) then
   return jsonb_build_object('ok',false,'message','LTC 가격은 소수점 8자리 이내여야 합니다.');
  end if;
  v_base:=(v_amount*100000000)::bigint;
  if v_base<100000 then
   return jsonb_build_object('ok',false,'message','LTC 기본 가격은 0.001 LTC 이상이어야 합니다.');
  end if;
  -- 1..999 satoshis (~0.00000001..0.00000999 LTC) uniquely identify an order.
  for v_attempt in 1..999 loop
   v_sats:=v_base+v_attempt;
   if not exists(
    select 1 from public.gp_direct_orders o
    where o.coin='ltc' and o.network='litecoin'
      and o.address_snapshot=v_wallet.address and o.ltc_expected_sats=v_sats
      and o.created_at>now()-interval '48 hours'
   ) then exit; end if;
   v_sats:=null;
  end loop;
  if v_sats is null then
   return jsonb_build_object('ok',false,'message','현재 LTC 주문이 많습니다. 나중에 다시 시도해 주세요.');
  end if;
  v_amount:=v_sats::numeric/100000000;
 end if;
 insert into public.gp_direct_orders(
  user_id,coin,network,days,expected_amount,address_snapshot,tag_snapshot,
  ltc_expected_sats
 ) values(v_user_id,v_wallet.coin,v_wallet.network,p_days,v_amount,
  v_wallet.address,v_wallet.destination_tag,v_sats)
 returning * into v_order;
 return jsonb_build_object('ok',true,'order',jsonb_build_object(
  'id',v_order.id,'coin',v_order.coin,'network',v_order.network,
  'days',v_order.days,'amount',v_order.expected_amount::text,
  'address',v_order.address_snapshot,'tag',v_order.tag_snapshot,
  'status',v_order.status,'createdAt',v_order.created_at,
  'expiresAt',v_order.expires_at,'txid',null
 ));
end;
$$;

-- Public web cannot see the service-role functions. The worker alone can poll.
create or replace function public.gp_ltc_pending_orders()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_orders jsonb;
begin
 if auth.role()<>'service_role' then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'address',o.address_snapshot,'sats',o.ltc_expected_sats,
  'createdAt',o.created_at,'expiresAt',o.expires_at,
  'submittedTxid',o.txid
 )),'[]'::jsonb) into v_orders
 from (select * from public.gp_direct_orders
   where coin='ltc' and network='litecoin'
     and status in ('awaiting_transfer','txid_submitted')
     and ltc_expected_sats is not null
     and created_at>now()-interval '48 hours'
   order by created_at asc limit 100) o;
 return v_orders;
end;
$$;

-- Only the service role can finalize, and only after the external worker
-- independently checked confirmed on-chain LTC transaction output.
-- The function enforces exact amount, unique TXID and idempotent VIP grants.
create or replace function public.gp_ltc_finalize(
 p_order_id uuid,p_txid text,p_sats bigint,p_confirmations integer
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_order public.gp_direct_orders%rowtype;
 v_existing public.vip_memberships%rowtype;
 v_start timestamptz;v_end timestamptz;v_hash text:=lower(btrim(coalesce(p_txid,'')));
begin
 if auth.role()<>'service_role' then
  raise exception 'Forbidden' using errcode='42501';end if;
 if v_hash !~ '^[0-9a-f]{64}$' or p_confirmations<6 then
  return jsonb_build_object('ok',false,'message','거래 ID 또는 확정 횟수 오류');
 end if;
 select * into v_order from public.gp_direct_orders
 where id=p_order_id for update;
 if not found or v_order.coin<>'ltc' or v_order.network<>'litecoin' then
  return jsonb_build_object('ok',false,'message','LTC 주문 없음');
 end if;
 if v_order.status='approved' then
  return jsonb_build_object('ok',true,'already',true);
 end if;
 if v_order.status not in ('awaiting_transfer','txid_submitted')
    or v_order.ltc_expected_sats is distinct from p_sats then
  return jsonb_build_object('ok',false,'message','주문 상태 또는 수량 불일치');
 end if;
 if v_order.created_at<now()-interval '48 hours' then
  return jsonb_build_object('ok',false,'message','오래된 주문');
 end if;
 if exists(select 1 from public.gp_direct_orders
   where id<>p_order_id and
     (lower(coalesce(ltc_matched_txid,''))=v_hash or
      (network='litecoin' and lower(coalesce(txid,''))=v_hash and status='approved'))
 ) then return jsonb_build_object('ok',false,'message','중복 TXID');end if;
 -- Serialize concurrent VIP credits per user.
 perform 1 from auth.users where id=v_order.user_id for update;
 select * into v_existing from public.vip_memberships
   where user_id=v_order.user_id for update;
 if found and v_existing.expires_at>now() then
  v_start:=v_existing.starts_at;
  v_end:=v_existing.expires_at+pg_catalog.make_interval(days=>v_order.days);
 else
  v_start:=now();v_end:=v_start+pg_catalog.make_interval(days=>v_order.days);
 end if;
 insert into public.vip_memberships(user_id,starts_at,expires_at)
 values(v_order.user_id,v_start,v_end)
 on conflict(user_id) do update set
 starts_at=excluded.starts_at,expires_at=excluded.expires_at;
 update public.gp_direct_orders set status='approved',txid=v_hash,
  ltc_matched_txid=v_hash,ltc_confirmations=p_confirmations,
  ltc_checked_at=now(),approved_at=now(),admin_note='LTC on-chain verified'
 where id=v_order.id;
 return jsonb_build_object('ok',true,'credited',true);
exception when unique_violation then
 return jsonb_build_object('ok',false,'message','중복 거래');
end;
$$;

revoke all on function public.gp_ltc_pending_orders() from public,anon,authenticated;
revoke all on function public.gp_ltc_finalize(uuid,text,bigint,integer) from public,anon,authenticated;
grant execute on function public.gp_ltc_pending_orders() to service_role;
grant execute on function public.gp_ltc_finalize(uuid,text,bigint,integer) to service_role;
