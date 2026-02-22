# Session State — 2026-02-22 14:56

## Current Task
Phase 2 COMPLETE. Moving to Phase 3 (Auth).

## What Was Done (Phase 2)
1. DB Schema: `src/server/db/schema.ts` — users, userSettings, trades tables with:
   - All BIGINT columns use `{ mode: "bigint" }`
   - CHECK constraints (price >= 0, permille 0-1000)
   - Partial unique index (prevent duplicate open positions)
   - Activity indexes
   - pgView trade_profits with .existing()
2. PnL Engine: `src/lib/pnl-engine.ts` — pure functions:
   - calculateCommission (Stars flat+permille, TON permille only)
   - calculateProfit (full P&L with USD)
   - aggregateStats (dashboard)
   - 19 tests, all passing
3. tRPC Routers (5 routers):
   - trades: list (cursor pagination, server-sort), add, update, softDelete, restore, exportCsv
   - settings: get, update
   - gifts: parseUrl
   - stats: dashboard (timezone-aware, period filter)
   - market: exchangeRates
4. VIEW Migration: `drizzle/0001_create_trade_profits_view.sql`
5. All registered in root.ts

## Verification
- 80/80 tests pass
- Lint clean
- Typecheck clean
- Build successful

## New Files
- src/server/db/schema.ts (full schema)
- src/lib/pnl-engine.ts
- src/lib/__tests__/pnl-engine.test.ts
- src/server/api/routers/trades.ts
- src/server/api/routers/settings.ts
- src/server/api/routers/gifts.ts
- src/server/api/routers/stats.ts
- src/server/api/routers/market.ts
- drizzle/0001_create_trade_profits_view.sql
- src/server/api/root.ts (updated)

## Next Steps
- Phase 3: Authentication (Better Auth + Telegram plugin)
- NOT committed yet — waiting for user approval

## Git State
- Last commit: ae45ffd (Phase 1)
- Phase 2 changes: unstaged
