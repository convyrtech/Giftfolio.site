## Plan Audit Results — GIFTSSITE

**Last Updated:** 2026-02-20 (adversarial audit — 7 expert agents)

### First Audit (3 experts, 2026-02-19) — Fixed
1. NUMERIC(18,2) → BIGINT (Stars as integers, TON as nanotons)
2. Commission: dual model (flat Stars + permille ‰)
3. Next.js 14 → 15 everywhere (async cookies/headers/params)
4. Railway+both → Neon (DB) + Railway (app only)
5. Timezone: added to user_settings, AT TIME ZONE in all date queries
6. Gross_profit GENERATED column removed (profit never stored, computed via VIEW)
7. trade_currency added per trade (Stars OR TON, not mixed)

### MVP Simplification
- MVP = TON only, Stars deferred to Phase 6
- Fiat display = Variant B (historical rates at buy/sell time) — buy_rate_usd, sell_rate_usd

### Adversarial Audit (7 agents, 2026-02-20) — ALL FIXED

**CRITICAL:**
1. `definePlugin` → `satisfies BetterAuthPlugin` (check exports at npm install)
2. Server Actions DELETED — tRPC is ONLY mutation path (contradicted tRPC in plan)
3. Neon HTTP driver → neon-serverless (WebSocket) — HTTP has no transactions
4. superjson transformer in tRPC — BigInt not JSON-serializable

**HIGH:**
5. Drizzle: ALL bigint columns need `{ mode: "bigint" }` — default "number" loses precision
6. TON input: string arithmetic (not parseFloat * 1e9) — floating-point errors at scale
7. Partial unique index: WHERE sell_date IS NULL — prevents duplicate open positions

**MEDIUM:**
8. Empty state UX: Guided First Trade pattern — inline empty state + placeholder + toast + highlight
9. Exchange rates: Binance + OKX via Promise.any, stale cache, never block trade creation
10. Stars/USD rate is FIXED at $0.013 (Telegram fixed pricing — no fetching needed)
