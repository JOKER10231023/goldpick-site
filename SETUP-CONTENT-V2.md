# Gold Pick V2 — 모바일 설정 마무리

코드는 GitHub main 브랜치에 반영되어 있습니다. 아래 설정 2가지는 운영자만 할 수 있습니다.

## 1. Supabase: 사진 업로드와 적중률 집계
1. [Gold Pick V2 SQL](https://github.com/JOKER10231023/goldpick-site/blob/main/supabase/goldpick-analysis-v2.sql) 열기
2. 전체 코드 복사
3. [Supabase SQL Editor](https://supabase.com/dashboard/project/xyssumwioolllczqgwsr/sql/new)에서 붙여넣고 Run
4. 사이트에서 관리자 계정으로 로그인 → 관리자 센터 → 분석 자료 작성 → 사진 업로드 테스트
5. 결과를 "적중" 또는 "미적중"으로 바꿔 발행하면 홈페이지 적중률이 15초마다 자동 갱신됩니다.

적중률 계산: 적중 / (적중 + 미적중) × 100. 대기/적특/임시저장/미발행 자료 제외. 완료된 결과가 없을 때 -%.

## 2. Cloudflare: 무료/VIP 분리 서브도메인
GitHub Pages에서 /free/ 및 /vip/는 준비되어 있지만 **서브도메인은 별도 활성화가 필요**합니다.

1. [Cloudflare Workers](https://dash.cloudflare.com/)에서 Workers & Pages → Create → Worker를 만듭니다 (이름 예: goldpick-portals).
2. [Cloudflare Worker 코드](https://github.com/JOKER10231023/goldpick-site/blob/main/cloudflare/goldpick-portals-worker.js)를 전체 복사하여 Worker 편집기에 붙여넣고 Deploy 합니다.
3. 해당 Worker의 Settings → Domains & Routes → Add → Custom Domain 으로 아래 두 개를 각각 추가합니다.
   - free.goldpick.6uv0.xyz
   - vip.goldpick.6uv0.xyz
4. Cloudflare에서 DNS/SSL 처리가 완료되면 메인 사이트의 자료실 버튼은 해당 서브도메인 링크로 자동 전환됩니다.

설정 전에도 자료실은 다음 주소로 이용할 수 있습니다.
- https://goldpick.6uv0.xyz/free/
- https://goldpick.6uv0.xyz/vip/

### VIP 보안
VIP 게시글의 본문과 사진 경로는 Supabase RLS로, 새로운 VIP 사진은 비공개 Storage 버킷 + 만료되는 서명 URL로 보호합니다. VIP 서브도메인에서는 별도로 로그인해야 합니다(도메인별 세션 분리).

기존에 공개 버킷에 올려둔 사진은 새 SQL 실행만으로 비공개로 바뀌지 않습니다. VIP 글로 옮기려면 재업로드하세요.
