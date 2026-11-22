# Gold Pick LTC automatic payments — SETUP (2026-11-22)

## Status
**NOT LIVE.** GitHub code exists; Supabase migration and Cloudflare Worker deployment are not performed by this commit. Do not accept real customer funds until tested.

## Architecture
1. Existing Gold Pick admin selects Litecoin (LTC) / Litecoin network, enters an **authorized receiving address** and base LTC prices for 1/7/30/90/365 days.
2. `supabase/goldpick-ltc-auto.sql` replaces `gp_direct_create_order` so new LTC orders receive a unique exact **satoshi amount** (base + 1..999 satoshis). Other assets keep the existing manual flow.
3. Cloudflare `ltc-watcher` runs every 2 minutes and queries the BlockCypher LTC mainnet API for each active address.
4. It checks an output to the exact address, the exact integer satoshi amount, the transaction timestamp relative to order creation and **at least 6 confirmations**.
5. The watcher alone calls the service-role-restricted `gp_ltc_finalize` RPC, which locks the order and customer and adds VIP **exactly once**.
6. TXID input remains a fallback for manual admin review; submitting a TXID never credits VIP by itself.

## Mobile deployment order
1. Confirm `supabase/goldpick-vip.sql`, `supabase/goldpick-vip-admin.sql`, and `supabase/goldpick-direct-wallet.sql` were already executed.
2. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/xyssumwioolllczqgwsr/sql/new).
3. Copy all of [goldpick-ltc-auto.sql](https://github.com/JOKER10231023/goldpick-site/blob/main/supabase/goldpick-ltc-auto.sql), paste, **Run**.
4. In GitHub Codespaces terminal:
   ```bash
   cd ltc-watcher
   npx wrangler login
   npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   npx wrangler deploy
   ```
   **Enter secret in the secure terminal prompt, never in chat or GitHub.** Optional `BLOCKCYPHER_TOKEN` for provider quota.
5. For a small controlled test, use an address you own and are authorized to use. Set an LTC base price in VIP Admin, enable Litecoin, create a test order, send the exact quoted satoshi amount and wait for >=6 confirmations. **The worker remains OFF until enabled**, so manually validate API responses and DB first.
6. After validating provider output parsing, test end-to-end in a controlled environment. In `ltc-watcher/wrangler.toml`, set `LTC_AUTOPAY_ENABLED = "true"`, then deploy again.
7. Verify the order changes to `approved` exactly once and VIP expiry increases only once. Re-run the watcher and check for no double grant.

## Important limitations
- **Shuffle's custodial deposit address is NOT verified as an authorized merchant receiving address.** Do not use it for customer funds without written permission. An on-chain transaction does not prove Shuffle credited the deposit.
- A shared address and unique amounts are a heuristic, not proof of customer identity. Someone else can send the same amount; address reuse, payments sent after the 48-hour scanning window, insufficient funds, network fees and provider downtime can cause errors.
- The BlockCypher endpoint `/v1/ltc/main/addrs/{address}/full?limit=50` is the integration target, but its live response and quotas have **not** been tested here. The watcher fails closed if a page reports `hasMore`. High-volume addresses need pagination, independent indexing or a dedicated merchant provider before production.
- Avoid accepting payments until the user-facing checkout and the actual Worker have passed a complete test. Existing orders created before the SQL migration do not have unique satoshi amounts and are NOT automatically payable.
- No exchange-rate conversion is implemented. The admin sets **fixed LTC prices**; they will not follow the current USD rate.
- A transaction with multiple matching outputs or conflicting orders must be investigated manually. The service-role key must remain secret.
- The provider may rate limit or become unavailable. Watcher errors are logged; there is no guaranteed immediate settlement.
- For production-grade merchant processing use unique per-order receiving addresses, a licensed payment processor or an independently operated wallet indexer.
