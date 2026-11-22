# Gold Pick — 관리자 지갑 주소 방식 코인 결제

## 무엇이 바뀌었나요?
NOWPayments 자동결제 초안 대신 **코인/네트워크 선택 → 관리자가 등록한 주소 표시 → 송금 → TXID 접수 → 입금 독립 검증 → 수동 VIP 지급** 흐름을 구현했습니다.

**중요: 이는 자동 입금 승인 시스템이 아닙니다.** Shuffle 입금 주소를 수납 주소로 사용하는 것은 Shuffle의 제3자 입금 제한 정책과 충돌할 수 있습니다. 셔플과 같은 커스터디(타사 보관) 서비스의 입금 주소를 타인의 결제 수납용으로 사용하기 전에 **반드시 사업자 승인을 확인**하세요.

## 모바일에서 설정하는 순서

1. [Supabase SQL Editor](https://supabase.com/dashboard/project/xyssumwioolllczqgwsr/sql/new) 방문
2. [goldpick-direct-wallet.sql](https://github.com/JOKER10231023/goldpick-site/blob/main/supabase/goldpick-direct-wallet.sql)의 전체 SQL을 복사 → 붙여넣기 → **Run**
3. [Gold Pick](https://goldpick.6uv0.xyz/) 로그인 → 마이페이지 → **VIP 관리자 패널**
4. 아래의 **입금 지갑 설정**에서 코인과 네트워크를 선택
5. 해당 네트워크의 주소, 필요 시 XRP/TON 등 태그·메모 입력
6. VIP 기간(1/7/30/90/365일)별 **정확한 코인 수량** 입력. 판매하지 않을 기간은 빈칸
7. 지갑 주소와 수량, 제3자 입금 가능 여부를 충분히 확인한 경우에만 **구매자에게 공개** 체크 → 저장
8. 구매자는 코인 결제 화면에서 공개된 코인/네트워크를 고르고 해당 주소와 수량 확인

## 코인과 네트워크
Shuffle 공식 [2026-10-19 지원 자산 안내](https://help.shuffle.com/en/articles/6966242-assets-supported-for-deposits-and-withdrawals)에 근거해 마스터 선택 항목을 등록했습니다.

BTC / Bitcoin, ETH / Ethereum·BEP20·Base·Robinhood, SHFL / ERC20, CASH / Solana, LTC / Litecoin, USDT / ERC20·BEP20·TRC20·Polygon·Solana, USDC / ERC20·BEP20·Solana·Polygon·Base·Arbitrum, TRX / TRON, POL / Polygon·Ethereum, XRP / XRP Ledger, SOL / Solana, DOGE / Dogecoin, BNB / BSC, AVAX / Avalanche, GRAM / TON, SHIB / ERC20, BONK / Solana, WIF / Solana, TRUMP / Solana, PUMP / Solana, DAI / ERC20.

*실제 입금 가능 여부는 서비스의 현재 지갑 화면에서 다시 확인하세요.* 지원되는 코인 중 운영자가 주소를 등록하고 **활성화**한 코인만 구매 화면에 보입니다. USDC/Arbitrum은 Shuffle이 지정한 토큰 컨트랙트인지 꼭 확인하세요.

## 중요한 보안 규칙
- **고정 수납 주소는 고객을 식별할 수 없습니다.** 서로 다른 고객이 같은 주소로 같은 코인·금액을 보내면 자동으로 어느 주문인지 확정할 수 없습니다.
- TXID만 입력해도 VIP가 지급되는 구조는 아닙니다. 관리자 검토 대기 상태가 됩니다.
- 관리자 검토 화면에서 실제 거래내역, 수취 주소, 코인/체인, 금액, 태그, 확정 횟수, 다른 주문에 사용되지 않은 TXID를 확인한 후에만 **입금 검증 완료 · VIP 지급**을 선택하세요.
- 관리자가 승인한 주문은 DB에서 한 번만 지급하고 로그에 기록합니다.
- 고객의 송금 수량은 USD 가격의 자동 환산이 아니라 **운영자가 설정한 정액 코인 수량**입니다. 시장 가격 변동과 네트워크 수수료를 운영자가 관리해야 합니다.
- 실제 코인을 받기 전 입금 한도, 환불·분쟁 대응, 법률 및 세금 의무도 점검하세요.

## 자동 입금 감지까지 가려면?
일반 사용자들이 이용할 수 있는 **사업자 수납용 지갑** 또는 입금 추적 API/웹훅이 필요합니다. 특히 여러 사람에게 동일한 Shuffle 입금 주소를 보여주는 방식은 Shuffle의 내부 크레딧 기록을 읽을 수 없고, Shuffle이 구매자 TXID를 서버에 알려준다는 보장이 없어서 오입금/오지급 위험이 있습니다.

독립된 지갑 주소(주문별 고유 수납 주소) + 블록체인 확인 + 지급 시 원자적 중복 방지가 가장 안전한 자동결제 구조입니다. 기존 `payments-worker/` 코드는 NOWPayments의 **비활성화된 별도 초안**이며 현재 Gold Pick 홈페이지에서는 로드하지 않습니다.
