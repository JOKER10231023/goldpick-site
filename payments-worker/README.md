# Gold Pick — 암호화폐 VIP 자동결제 배포 안내

## 현재 상태
- GitHub Pages **결제 UI는 추가됨**. 결제 서버를 배포하지 않았으면 실제 입금 주소가 나오지 않음.
- **실제 결제는 기본 OFF, NOWPayments sandbox 기본 ON**.
- 기본 지원 코인: **USDT TRC20**, **LTC**. 사용 코인/네트워크는 운영자가 `PAY_COINS`로 제한.
- **가격은 임의로 정하지 않음**. 운영자가 달러(USD)로 기간별 가격을 설정해야 함.
- **결제 성공을 가장하지 말 것**: 실제 API 키·받을 지갑·웹훅 설정이 없는 한 자동결제는 가동되지 않음.

## 1. Supabase SQL 준비
Supabase Dashboard → SQL Editor에서 `supabase/goldpick-crypto.sql` 전체 실행.
기존 `supabase/goldpick-vip.sql`, `supabase/goldpick-vip-admin.sql` 설치를 전제로 함.
- `goldpick_crypto_orders`: 주문, 네트워크, 코인 금액, 송금 주소, TXID, 입금 상태, 지급 완료 시각.
- `goldpick_submit_payment_txid`: 해당 주문 소유자만 TXID 접수 가능. **권한 지급 불가능**.
- `goldpick_finalize_crypto_order`: 서버 전용 RPC. **실제 결제 ID / 코인 / 금액 / 주소 대조 + 행 잠금 + VIP 기간 갱신**을 원자적으로 실행.
- 모든 주문 내역은 RLS로 사용자 본인만 SELECT 가능하며 일반 클라이언트의 INSERT/UPDATE/DELETE 차단.

## 2. NOWPayments 준비
1. NOWPayments 판매자 계정을 만들고 수취 지갑과 정산 코인을 설정함.
2. API Key와 **IPN Secret** 발급.
3. [NOWPayments API 공식 안내](https://nowpayments.zendesk.com/hc/en-us/articles/21345824322717-API-and-endpoint-description)에서 지원 코인, 결제 최소 금액, 정산 수수료를 확인.
4. [NOWPayments IPN 설정](https://nowpayments.zendesk.com/hc/en-us/articles/21395546303389-IPN-and-how-to-setup) 확인. Worker가 결제 생성 시 콜백 URL을 자동 등록함.

**최소 송금액 주의:** 수수료·네트워크 조건 때문에 1일 VIP 요금처럼 소액 결제는 API에서 거절될 수 있음. 본 시스템은 거절 시 주소를 발급하지 않고 오류를 안내함.

## 3. Cloudflare Worker 배포
GitHub 저장소 `payments-worker/` 폴더에 모든 Worker 소스가 있음. GitHub Codespaces 터미널이나 PC에서 다음 명령으로 배포 가능.

```bash
cd payments-worker
npx wrangler login
npx wrangler deploy
```

Worker `wrangler.toml` 기본 설정:
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SITE_ORIGIN`: 이미 기록됨 (공개 가능한 값)
- `PAYMENTS_ENABLED = "false"`: **실제 결제 주소 발급 차단**
- `NOWPAYMENTS_ENVIRONMENT = "sandbox"`: 테스트용. **sandbox 완료는 실서비스 VIP 지급 안 함**
- `PAY_COINS = "usdttrc20,ltc"`: 지원 코인
- `VIP_PLANS_JSON = "{}"`: 가격 설정 전

기간별 실제 판매 가격을 정하면 `VIP_PLANS_JSON` 예시처럼 설정:

```toml
# 예시 금액이므로, 그대로 사용하지 말 것. 실제 판매 가격으로 바꿔야 함.
VIP_PLANS_JSON = '{"1":5.00,"7":25.00,"30":70.00,"90":180.00}'
```

소수점 2자리까지만, 1~3650일 중 제공 기간은 1/7/30/90/365일 중에서 설정 가능. 현재 UI/DB는 1/7/30/90/365일만 허용함. 가격 최소 USD 1은 앱 측 형식 검증용이며 NOWPayments 실제 최소액과 다를 수 있음.

**시크릿 설정** (절대 GitHub, 대화방, 클라이언트 코드에 쓰지 말 것):

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put NOWPAYMENTS_API_KEY
npx wrangler secret put NOWPAYMENTS_IPN_SECRET
```

새 형식 Supabase `sb_secret_...`를 위에 넣을 수 있으며, 구형 service_role JWT도 지원. Worker만 접근.

NOWPayments 계정이 결제 상태 GET 호출에 Bearer JWT를 요구하는 경우에만 아래 시크릿 추가:

```bash
npx wrangler secret put NOWPAYMENTS_EMAIL
npx wrangler secret put NOWPAYMENTS_PASSWORD
```

Cloudflare Dashboard → Workers & Pages에서 Worker의 **Environment Variables and Secrets**, **Cron Triggers**를 모바일 브라우저로 직접 설정해도 됨. 2분마다 자동 상태 확인을 권장 (`*/2 * * * *`). IPN 웹훅을 차단하는 Cloudflare 방화벽 규칙이 없어야 함.

## 4. 테스트 순서
1. Supabase SQL 적용 확인
2. NOWPayments Sandbox API Key + IPN Secret 사용
3. `NOWPAYMENTS_ENVIRONMENT=sandbox`, `PAYMENTS_ENABLED=true`, 테스트 가격 설정
4. Github Pages의 `payment-config.js`에서 다음을 편집:
   `window.GOLDPICK_PAYMENT_CONFIG={apiBase:"https://<실제 Worker URL>"};`
5. Gold Pick에 로그인 → 마이페이지 → 코인으로 VIP 구매·연장 → 기간/코인 선택
6. 결제 주소와 코인 수량 표시 및 IPN 수신 확인. **sandbox 주소로 실제 돈을 송금하지 말 것.**
7. TXID 입력 시 서버가 API 결제 상태를 재조회하는지 확인.
8. 운영 허용 여부·정산 지갑·판매가·환불 정책·수수료·법률/세무 요건을 검토한 후에만 실서비스 설정으로 전환.

## 5. 실서비스 전환
- NOWPayments **실서비스** API Key/IPN Secret과 수취 지갑으로 교체.
- `NOWPAYMENTS_ENVIRONMENT="live"`; `PAYMENTS_ENABLED="true"`.
- 가격·사용 코인·최소 금액 재확인, 실제 소액 결제 1건으로 API→웹훅→RLS→VIP 전체 체인 테스트.
- 테스트 이후에만 일반 고객에게 결제 기능 공개.

## 6. 구매자 결제 흐름
1. Gold Pick 로그인 → 마이페이지 → 코인 결제.
2. 기간과 코인/네트워크 선택, 발급된 **해당 주문 전용 입금 주소와 수량** 확인.
3. 정확한 코인/네트워크로 송금. 메모/태그가 있으면 함께 입력.
4. IPN 웹훅 또는 **2분 주기 상태 조회**로 NOWPayments `finished` 및 **실제 입금 수량 ≥ 발급 수량**을 확인.
5. DB에 기록된 주문 ID·결제 ID·코인·주소·금액을 **서버에서 다시 대조**하고 한번만 VIP 기간 추가.
6. 자동 감지가 늦으면 TXID(64자리 16진수)를 입력. TXID는 담당 주문에만 기록되고 결제 서비스 재조회 및 수동 확인 자료로 활용함. **TXID 문자열만으로는 절대 VIP 지급 안 됨.**
7. 여러 번 알림이 도착해도 `fulfilled_at` 체크와 행 잠금으로 중복 지급 방지.

## 주의
- NOWPayments의 `finished`만 신뢰하는 게 아니라 서버 GET으로 재검증함.
- 입금 부족, 잘못된 네트워크, provider 정보 누락·불일치는 **자동 승인하지 않고 검토 대기**로 처리함.
- 사용자의 TXID가 블록체인에서 실제로 확인됐는지 직접 검증하지는 않음. 제공자 API에 기록되지 않은 송금은 운영자가 별도 확인해야 함.
- 입금 취소/환불/장애 대응은 운영 정책 및 별도 관리자 검토가 필요함.
- 한국에서 유료 스포츠 분석과 가상자산 결제를 운영하는 데 필요한 법률/세금/표시 의무는 판매 전에 별도로 확인할 것.
