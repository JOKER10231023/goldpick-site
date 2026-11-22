-- GOLD PICK / DIRECT-WALLET CHECKOUT
-- This mode uses addresses configured by the account administrator.
-- No wallet or TXID alone can certify a customer payment.
-- Deploy through Supabase SQL Editor, AFTER goldpick-vip.sql and goldpick-vip-admin.sql.
-- IMPORTANT: Never use a third-party custodial deposit address without provider authorization.
-- All generated orders require an independent transfer check and admin approval.

create table if not exists public.gp_supported_assets (
  coin text not null,
  network text not null,
  coin_label text not null,
  network_label text not null,
  sort_order integer not null default 0,
  primary key (coin, network)
);
revoke all on public.gp_supported_assets from public, anon, authenticated;
grant select on public.gp_supported_assets to authenticated;
alter table public.gp_supported_assets enable row level security;
-- Deliberately no public SELECT policy; users read from vetted RPC only.

insert into public.gp_supported_assets(coin,network,coin_label,network_label,sort_order) values
 ('btc','bitcoin','Bitcoin (BTC)','Bitcoin',10),
 ('eth','ethereum','Ethereum (ETH)','Ethereum',20),
 ('eth','bsc','Ethereum (ETH)','BNB Smart Chain (BEP20)',21),
 ('eth','base','Ethereum (ETH)','Base',22),
 ('eth','robinhood','Ethereum (ETH)','Robinhood Chain',23),
 ('shfl','ethereum','Shuffle (SHFL)','Ethereum (ERC20)',30),
 ('cash','solana','CASH','Solana',35),
 ('ltc','litecoin','Litecoin (LTC)','Litecoin',40),
 ('usdt','ethereum','Tether (USDT)','Ethereum (ERC20)',50),
 ('usdt','bsc','Tether (USDT)','BNB Smart Chain (BEP20)',51),
 ('usdt','tron','Tether (USDT)','TRON (TRC20)',52),
 ('usdt','polygon','Tether (USDT)','Polygon',53),
 ('usdt','solana','Tether (USDT)','Solana',54),
 ('usdc','ethereum','USD Coin (USDC)','Ethereum (ERC20)',60),
 ('usdc','bsc','USD Coin (USDC)','BNB Smart Chain (BEP20)',61),
 ('usdc','solana','USD Coin (USDC)','Solana',62),
 ('usdc','polygon','USD Coin (USDC)','Polygon',63),
 ('usdc','base','USD Coin (USDC)','Base',64),
 ('usdc','arbitrum','USD Coin (USDC)','Arbitrum (native USDC)',65),
 ('trx','tron','TRON (TRX)','TRON',70),
 ('pol','polygon','POL','Polygon',80),
 ('pol','ethereum','POL','Ethereum',81),
 ('xrp','xrpl','Ripple (XRP)','XRP Ledger',90),
 ('sol','solana','Solana (SOL)','Solana',100),
 ('doge','dogecoin','Dogecoin (DOGE)','Dogecoin',110),
 ('bnb','bsc','BNB','BNB Smart Chain',120),
 ('avax','avalanche','Avalanche (AVAX)','Avalanche C-Chain',130),
 ('gram','ton','GRAM','TON',140),
 ('shib','ethereum','Shiba Inu (SHIB)','Ethereum (ERC20)',150),
 ('bonk','solana','Bonk (BONK)','Solana',160),
 ('wif','solana','dogwifhat (WIF)','Solana',170),
 ('trump','solana','TRUMP','Solana',180),
 ('pump','solana','PUMP','Solana',190),
 ('dai','ethereum','DAI','Ethereum (ERC20)',200)
on conflict (coin,network) do update set
  coin_label=excluded.coin_label,network_label=excluded.network_label,
  sort_order=excluded.sort_order;

create table if not exists public.gp_direct_wallets (
  coin text not null, network text not null,
  address text not null default '',
  destination_tag text not null default '',
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key(coin,network),
  foreign key (coin,network) references public.gp_supported_assets(coin,network)
);
create table if not exists public.gp_direct_prices (
  coin text not null, network text not null,
  days integer not null check(days in (1,7,30,90,365)),
  amount numeric(30,14) not null check(amount>0),
  primary key(coin,network,days),
  foreign key(coin,network) references public.gp_direct_wallets(coin,network)
);
create table if not exists public.gp_direct_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  coin text not null,
  network text not null,
  days integer not null check(days in (1,7,30,90,365)),
  expected_amount numeric(30,14) not null check(expected_amount>0),
  address_snapshot text not null,
  tag_snapshot text not null default '',
  status text not null default 'awaiting_transfer'
    check(status in ('awaiting_transfer','txid_submitted','approved','rejected')),
  txid text,
  txid_submissions integer not null default 0,
  submitted_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  foreign key(coin,network) references public.gp_supported_assets(coin,network)
);
create index if not exists gp_direct_orders_user_created
  on public.gp_direct_orders(user_id,created_at desc);
create index if not exists gp_direct_orders_admin_review
  on public.gp_direct_orders(created_at desc)
  where status in ('txid_submitted','awaiting_transfer');
create unique index if not exists gp_direct_order_unique_txid
  on public.gp_direct_orders(network,lower(txid)) where txid is not null;

create table if not exists public.gp_direct_payment_audit (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.gp_direct_orders(id),
  reviewer_id uuid not null references auth.users(id),
  customer_id uuid not null references auth.users(id),
  action text not null check(action in ('approve','reject')),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table public.gp_direct_wallets enable row level security;
alter table public.gp_direct_prices enable row level security;
alter table public.gp_direct_orders enable row level security;
alter table public.gp_direct_payment_audit enable row level security;
revoke all on public.gp_direct_wallets from public,anon,authenticated;
revoke all on public.gp_direct_prices from public,anon,authenticated;
revoke all on public.gp_direct_orders from public,anon,authenticated;
revoke all on public.gp_direct_payment_audit from public,anon,authenticated;
grant all on public.gp_direct_wallets,public.gp_direct_prices,
 public.gp_direct_orders,public.gp_direct_payment_audit to service_role;
-- All user writes happen in security-definer functions with an auth UID check.

-- Only published (admin-enabled, priced) wallet options are exposed.
create or replace function public.gp_direct_offers()
returns jsonb language sql stable security definer set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
    'coin',c.coin,'network',c.network,
    'coinLabel',c.coin_label,'networkLabel',c.network_label,
    'address',w.address,'tag',w.destination_tag,
    'prices',coalesce((select jsonb_object_agg(p.days::text,p.amount::text)
      from public.gp_direct_prices p
      where p.coin=w.coin and p.network=w.network),'{}'::jsonb)
  ) order by c.sort_order),'[]'::jsonb)
 from public.gp_supported_assets c
 join public.gp_direct_wallets w on w.coin=c.coin and w.network=c.network
 where auth.uid() is not null
   and w.enabled=true and length(w.address)>=12
   and exists(select 1 from public.gp_direct_prices p
     where p.coin=w.coin and p.network=w.network);
$$;

-- Admin-only view: all supported networks + own configured addresses + prices.
create or replace function public.gp_direct_admin_catalog()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_items jsonb;
begin
 if auth.uid() is null or not exists(
   select 1 from public.goldpick_admins where user_id=auth.uid()
 ) then raise exception '관리자 권한이 없습니다.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
   'coin',c.coin,'network',c.network,
   'coinLabel',c.coin_label,'networkLabel',c.network_label,
   'address',coalesce(w.address,''),'tag',coalesce(w.destination_tag,''),
   'enabled',coalesce(w.enabled,false),
   'prices',coalesce((select jsonb_object_agg(p.days::text,p.amount::text)
      from public.gp_direct_prices p where p.coin=c.coin and p.network=c.network),
     '{}'::jsonb)
  ) order by c.sort_order),'[]'::jsonb) into v_items
 from public.gp_supported_assets c left join public.gp_direct_wallets w
   on w.coin=c.coin and w.network=c.network;
 return v_items;
end;
$$;

-- The operator controls both an address and exact COIN AMOUNTS for each term.
create or replace function public.gp_direct_admin_save_wallet(
  p_coin text,p_network text,p_address text,p_tag text,
  p_enabled boolean,p_prices jsonb
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare
  v_coin text:=lower(pg_catalog.btrim(coalesce(p_coin,'')));
  v_network text:=lower(pg_catalog.btrim(coalesce(p_network,'')));
  v_address text:=pg_catalog.btrim(coalesce(p_address,''));
  v_tag text:=pg_catalog.btrim(coalesce(p_tag,''));
  v_days text; v_amount text; v_price numeric; v_count integer:=0;
begin
 if auth.uid() is null or not exists(
   select 1 from public.goldpick_admins where user_id=auth.uid()
 ) then raise exception '관리자 권한이 없습니다.' using errcode='42501'; end if;
 if not exists(select 1 from public.gp_supported_assets
   where coin=v_coin and network=v_network) then
   return jsonb_build_object('ok',false,'message','지원하지 않는 코인/네트워크입니다.');
 end if;
 if length(v_address)>180 or length(v_tag)>160 or
    (v_address<>'' and (length(v_address)<12 or v_address !~ '^[A-Za-z0-9:_/-]+$')) then
   return jsonb_build_object('ok',false,'message','입금 주소의 길이 또는 문자를 확인해 주세요.');
 end if;
 if coalesce(jsonb_typeof(p_prices),'null')<>'object' then
   return jsonb_build_object('ok',false,'message','이용권별 코인 수량이 올바르지 않습니다.');
 end if;
 for v_days,v_amount in select key,value from jsonb_each_text(p_prices) loop
   if v_days not in ('1','7','30','90','365')
      or v_amount !~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,14})?$' then
     return jsonb_build_object('ok',false,'message','이용 기간 또는 코인 수량의 형식이 올바르지 않습니다.');
   end if;
   v_price:=v_amount::numeric;
   if v_price<=0 or v_price>100000000 then
     return jsonb_build_object('ok',false,'message','코인 수량은 0보다 커야 합니다.');
   end if;
   v_count:=v_count+1;
 end loop;
 if coalesce(p_enabled,false) and (v_address='' or v_count=0) then
   return jsonb_build_object('ok',false,'message','주소와 한 개 이상의 이용권 가격을 입력해 주세요.');
 end if;
 insert into public.gp_direct_wallets(coin,network,address,destination_tag,enabled,updated_by)
 values(v_coin,v_network,v_address,v_tag,coalesce(p_enabled,false),auth.uid())
 on conflict(coin,network) do update set
   address=excluded.address,destination_tag=excluded.destination_tag,
   enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
 delete from public.gp_direct_prices where coin=v_coin and network=v_network;
 for v_days,v_amount in select key,value from jsonb_each_text(p_prices) loop
   insert into public.gp_direct_prices(coin,network,days,amount)
   values(v_coin,v_network,v_days::integer,v_amount::numeric);
 end loop;
 return jsonb_build_object('ok',true,'message','지갑 주소와 이용권 수량을 저장했습니다.');
end;
$$;

-- User can create an order only for an enabled, priced coin/network.
-- The snapshot amount/address is server generated and cannot be edited by browser.
create or replace function public.gp_direct_create_order(
  p_coin text,p_network text,p_days integer
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_user_id uuid:=auth.uid();
  v_wallet public.gp_direct_wallets%rowtype;
  v_amount numeric; v_order public.gp_direct_orders%rowtype;
begin
 if v_user_id is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if p_days is null or p_days not in (1,7,30,90,365) then
   return jsonb_build_object('ok',false,'message','이용 기간을 확인해 주세요.');
 end if;
 if exists(select 1 from public.gp_direct_orders
   where user_id=v_user_id and created_at>now()-interval '1 minute') then
   return jsonb_build_object('ok',false,'message','새 주문은 1분 간격으로 생성할 수 있습니다.');
 end if;
 select * into v_wallet from public.gp_direct_wallets
 where coin=lower(coalesce(p_coin,'')) and network=lower(coalesce(p_network,''))
   and enabled=true and length(address)>=12;
 if not found then return jsonb_build_object('ok',false,'message','해당 코인·네트워크는 결제할 수 없습니다.'); end if;
 select amount into v_amount from public.gp_direct_prices
 where coin=v_wallet.coin and network=v_wallet.network and days=p_days;
 if v_amount is null then
   return jsonb_build_object('ok',false,'message','선택한 이용 기간은 판매하지 않습니다.');
 end if;
 insert into public.gp_direct_orders(
  user_id,coin,network,days,expected_amount,address_snapshot,tag_snapshot
 ) values(
  v_user_id,v_wallet.coin,v_wallet.network,p_days,v_amount,
  v_wallet.address,v_wallet.destination_tag
 ) returning * into v_order;
 return jsonb_build_object('ok',true,'order',jsonb_build_object(
  'id',v_order.id,'coin',v_order.coin,'network',v_order.network,
  'days',v_order.days,'amount',v_order.expected_amount::text,
  'address',v_order.address_snapshot,'tag',v_order.tag_snapshot,
  'status',v_order.status,'createdAt',v_order.created_at,
  'expiresAt',v_order.expires_at,'txid',null
 ));
end;
$$;

create or replace function public.gp_direct_my_orders()
returns jsonb language sql stable security definer set search_path=''
as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'coin',o.coin,'network',o.network,'days',o.days,
  'amount',o.expected_amount::text,'address',o.address_snapshot,
  'tag',o.tag_snapshot,'status',o.status,'createdAt',o.created_at,
  'expiresAt',o.expires_at,'txid',o.txid
 ) order by o.created_at desc),'[]'::jsonb)
 from (select * from public.gp_direct_orders where user_id=auth.uid()
       order by created_at desc limit 20) o;
$$;

-- TXID is a request for human verification, NEVER proof of payment.
-- Solana / TON / EVM hashes vary; do not hardcode "64 hex" for every chain.
create or replace function public.gp_direct_submit_txid(
 p_order_id uuid,p_txid text
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_user_id uuid:=auth.uid();v_order public.gp_direct_orders%rowtype;
 v_hash text:=pg_catalog.btrim(coalesce(p_txid,''));
begin
 if v_user_id is null then raise exception '로그인이 필요합니다.' using errcode='42501'; end if;
 if length(v_hash)<16 or length(v_hash)>140
    or v_hash !~ '^[A-Za-z0-9:_/-]+$' then
   return jsonb_build_object('ok',false,'message','거래 ID 형식 또는 길이를 확인해 주세요.');
 end if;
 select * into v_order from public.gp_direct_orders
 where id=p_order_id and user_id=v_user_id for update;
 if not found then return jsonb_build_object('ok',false,'message','주문을 찾을 수 없습니다.'); end if;
 if v_order.status in ('approved','rejected') then
   return jsonb_build_object('ok',false,'message','처리가 완료된 주문입니다.');
 end if;
 if v_order.txid is not null and lower(v_order.txid)=lower(v_hash) then
   return jsonb_build_object('ok',true,'message','이미 접수된 TXID입니다.','status',v_order.status);
 end if;
 if v_order.txid_submissions>=3 then
   return jsonb_build_object('ok',false,'message','TXID 수정 횟수를 초과했습니다. 관리자에게 문의해 주세요.');
 end if;
 update public.gp_direct_orders set txid=v_hash,submitted_at=now(),
   txid_submissions=txid_submissions+1,status='txid_submitted'
 where id=p_order_id;
 return jsonb_build_object('ok',true,'message',
   '거래 ID가 접수됐습니다. 입금 확인 후 VIP 지급 여부가 결정됩니다.',
   'status','txid_submitted');
exception when unique_violation then
 return jsonb_build_object('ok',false,'message','이미 다른 주문에 등록된 거래 ID입니다.');
end;
$$;

create or replace function public.gp_direct_admin_orders()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_rows jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.goldpick_admins
   where user_id=auth.uid()) then
   raise exception '관리자 권한이 없습니다.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'email',a.email,'coin',a.coin,'network',a.network,
  'days',a.days,'amount',a.expected_amount::text,
  'address',a.address_snapshot,'tag',a.tag_snapshot,
  'status',a.status,'txid',a.txid,'createdAt',a.created_at,
  'reviewedAt',a.approved_at,'note',a.admin_note
 ) order by a.created_at desc),'[]'::jsonb) into v_rows
 from (select o.*,u.email from public.gp_direct_orders o
   join auth.users u on u.id=o.user_id
   order by case when o.status='txid_submitted' then 0 else 1 end,
     o.created_at desc limit 50) a;
 return v_rows;
end;
$$;

-- Admin confirms they independently checked the correct asset, network, address,
-- tag, amount, confirmations, no duplicate, and deposit ownership.
-- Approval is exactly-once, with two locks (order + user) to avoid duplicate VIP.
create or replace function public.gp_direct_admin_review(
 p_order_id uuid,p_approve boolean,p_note text
) returns jsonb language plpgsql volatile security definer set search_path=''
as $$
declare v_admin uuid:=auth.uid();v_order public.gp_direct_orders%rowtype;
 v_existing public.vip_memberships%rowtype;v_start timestamptz;v_end timestamptz;
 v_note text:=left(pg_catalog.btrim(coalesce(p_note,'')),500);
begin
 if v_admin is null or not exists(select 1 from public.goldpick_admins
   where user_id=v_admin) then
   raise exception '관리자 권한이 없습니다.' using errcode='42501'; end if;
 select * into v_order from public.gp_direct_orders where id=p_order_id for update;
 if not found then return jsonb_build_object('ok',false,'message','주문을 찾지 못했습니다.'); end if;
 if v_order.status in ('approved','rejected') then
   return jsonb_build_object('ok',false,'message','이미 처리된 주문입니다.');
 end if;
 if p_approve is null then
   return jsonb_build_object('ok',false,'message','검토 결과를 선택해 주세요.');
 end if;
 if p_approve and (v_order.status<>'txid_submitted' or v_order.txid is null
     or length(v_note)<10) then
   return jsonb_build_object('ok',false,
     'message','TXID를 접수하고 검증 근거를 10자 이상 기록한 뒤 승인하세요.');
 end if;
 if p_approve then
   perform 1 from auth.users where id=v_order.user_id for update;
   select * into v_existing from public.vip_memberships
     where user_id=v_order.user_id for update;
   if found and v_existing.expires_at>now() then
     v_start:=v_existing.starts_at;
     v_end:=v_existing.expires_at+pg_catalog.make_interval(days=>v_order.days);
   else
     v_start:=now();
     v_end:=v_start+pg_catalog.make_interval(days=>v_order.days);
   end if;
   insert into public.vip_memberships(user_id,starts_at,expires_at)
     values(v_order.user_id,v_start,v_end)
   on conflict(user_id) do update set
     starts_at=excluded.starts_at,expires_at=excluded.expires_at;
 end if;
 update public.gp_direct_orders set status=case when p_approve then 'approved' else 'rejected' end,
   approved_by=v_admin,approved_at=now(),admin_note=v_note where id=v_order.id;
 insert into public.gp_direct_payment_audit(order_id,reviewer_id,customer_id,action,note)
 values(v_order.id,v_admin,v_order.user_id,case when p_approve then 'approve' else 'reject' end,v_note);
 return jsonb_build_object('ok',true,'message',
  case when p_approve then '검증 완료한 주문에 VIP를 한 번 지급했습니다.'
       else '주문을 반려했습니다.' end);
end;
$$;

-- These RPCs are visible only to signed-in users; admin membership is checked
-- INSIDE every administrator function. No client can write order/entitlements.
revoke execute on function public.gp_direct_offers()
 from public,anon,authenticated;
revoke execute on function public.gp_direct_admin_catalog()
 from public,anon,authenticated;
revoke execute on function public.gp_direct_admin_save_wallet(text,text,text,text,boolean,jsonb)
 from public,anon,authenticated;
revoke execute on function public.gp_direct_create_order(text,text,integer)
 from public,anon,authenticated;
revoke execute on function public.gp_direct_my_orders()
 from public,anon,authenticated;
revoke execute on function public.gp_direct_submit_txid(uuid,text)
 from public,anon,authenticated;
revoke execute on function public.gp_direct_admin_orders()
 from public,anon,authenticated;
revoke execute on function public.gp_direct_admin_review(uuid,boolean,text)
 from public,anon,authenticated;
grant execute on function public.gp_direct_offers(),
 public.gp_direct_admin_catalog(),
 public.gp_direct_admin_save_wallet(text,text,text,text,boolean,jsonb),
 public.gp_direct_create_order(text,text,integer),
 public.gp_direct_my_orders(),
 public.gp_direct_submit_txid(uuid,text),
 public.gp_direct_admin_orders(),
 public.gp_direct_admin_review(uuid,boolean,text)
 to authenticated;
