# Zero-Trust Audit Report — GIFTSSITE (Giftfolio)

**Date:** 2026-02-23
**Auditors:** 14 parallel Claude Opus 4.6 agents (cross-validated)
**Scope:** Full codebase — schema, security, PnL logic, tRPC API, TypeScript strictness, UI/a11y, performance, plan compliance

---

## Executive Summary

The codebase demonstrates **solid security fundamentals**: correct Telegram HMAC-SHA256, consistent `userId` scoping on every DB query, Zod validation at all tRPC boundaries, no `sql.raw()`, no `dangerouslySetInnerHTML`, no `eval()`. Environment variables are validated via `@t3-oss/env-nextjs`.

However, the audit uncovered **5 CRITICAL, 16 HIGH, ~25 MEDIUM** issues. The top systemic problems are:

1. **Three independent PnL calculation paths** that can diverge (TS engine, SQL VIEW, stats.ts inline SQL)
2. **Rounding mismatch** between TypeScript (half-up) and PostgreSQL (banker's rounding)
3. **Complete absence of rate limiting** despite Upstash packages being installed
4. **Soft-delete leaks** — `deletedAt` filter missing in 3 mutations
5. **Broken cursor pagination** when sorting by non-ID columns

### Aggregate Findings

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 5 | Rounding divergence, VIEW never queried, deletedAt leaks, unique index bug, missing CHECK |
| HIGH | 16 | Rate limiting, security headers, no transaction, TON best/worst, cursor pagination, a11y |
| MEDIUM | ~25 | Export no limit, settings race, CORS, date validation, branded types, contrast, etc. |
| LOW | ~20 | Missing return types, dead code, minor a11y, informational |
| INFO | ~10 | Positive patterns documented |

---

## CRITICAL Findings

### C-1. Rounding mismatch: TypeScript "half up" vs PostgreSQL "half to even"
**Confirmed by:** Schema#1, Schema#2, PnL#1, PnL#2 (4 agents)
**Files:** `src/lib/pnl-engine.ts:50` vs `drizzle/0002_add_quantity_columns.sql:57` vs `src/server/api/routers/stats.ts:55`

**TypeScript (round half up):**
```typescript
const permilleCommission = (sellPrice * BigInt(commissionPermille) + 500n) / 1000n;
```

**SQL VIEW + stats.ts (PostgreSQL banker's rounding):**
```sql
ROUND(t.sell_price * t.commission_permille / 1000.0)
```

**Divergence example:** `sellPrice=2500, permille=1` => TS: `3`, SQL: `2` (banker's rounds 2.5 to even=2).

**Impact:** Commission differs by 1 unit on trades where `sell * permille mod 1000 == 500`. Accumulates across many trades. Users see different profit in table vs dashboard.

**Fix:** Change SQL to `FLOOR(x + 0.5)` for half-up consistency, or implement banker's rounding in TypeScript.

---

### C-2. SQL VIEW `trade_profits` is NEVER queried — three independent PnL paths
**Confirmed by:** PnL#2, Schema#2 (2 agents)
**Files:** `src/server/db/schema.ts:213`, all router files

The VIEW exists in the DB and schema but is never queried. Three separate PnL implementations:
1. `src/lib/pnl-engine.ts` — TypeScript engine (client-side table display)
2. `drizzle/0002_add_quantity_columns.sql` — SQL VIEW (unused)
3. `src/server/api/routers/stats.ts:48-55` — inline SQL aggregation (dashboard)

**Impact:** Triple maintenance burden. The rounding divergence (C-1) already shows they don't match. Any change to one is silently missed in the others.

**Fix:** Either use the VIEW as the single source of truth for stats queries, or remove it entirely and document `calculateProfit()` as canonical.

---

### C-3. Missing `isNull(deletedAt)` filter in getById, update, toggleHidden
**Confirmed by:** Schema#1, tRPC#1, tRPC#2 (3 agents)
**Files:** `src/server/api/routers/trades.ts:91-102` (getById), `:217-270` (update), `:409-429` (toggleHidden)

```typescript
// getById — no deletedAt filter
.where(and(eq(trades.id, input.id), eq(trades.userId, userId)));

// update — no deletedAt filter on SELECT or UPDATE
// toggleHidden — no deletedAt filter
```

**Impact:** Soft-deleted trades can be fetched, modified, and toggled. A deleted trade loaded in edit form can be updated. Violates soft-delete invariant.

**Fix:** Add `isNull(trades.deletedAt)` to all three mutations' WHERE clauses.

---

### C-4. Unique index `uq_trades_user_gift_open` missing `giftNumber` — blocks buying multiple items of same gift type
**Confirmed by:** Schema#1
**File:** `src/server/db/schema.ts:181-183`

```typescript
uniqueIndex("uq_trades_user_gift_open")
  .on(table.userId, table.giftSlug)  // Missing giftNumber!
  .where(sql`... AND ${table.giftNumber} IS NOT NULL`)
```

**Impact:** A user cannot buy two different numbered items of the same gift (e.g. PlushPepe-123 AND PlushPepe-456). The index on `(userId, giftSlug)` prevents this since both have slug "PlushPepe". This is a **core trading flow blocker**.

**Fix:** Change to `.on(table.userId, table.giftSlug, table.giftNumber)`. Also fix the SQL migration.

---

### C-5. Missing price-currency CHECK constraints at SQL level
**Confirmed by:** Schema#1, Schema#2 (2 agents)
**File:** `src/server/db/schema.ts:146, 179-208`

No CHECK on `trade_currency` (Drizzle `{ enum: ... }` is TypeScript-only). No CHECK preventing TON trades from having `commission_flat_stars > 0`. No CHECK ensuring price ranges are reasonable per currency.

**Impact:** Any string can be inserted as `trade_currency` at DB level. TON trades with non-zero flat commission create divergent PnL between stats router (includes flat) and VIEW/TS engine (excludes flat).

**Fix:** Add:
```typescript
check("chk_trade_currency", sql`${table.tradeCurrency} IN ('STARS', 'TON')`),
check("chk_ton_no_flat", sql`${table.tradeCurrency} != 'TON' OR ${table.commissionFlatStars} = 0`),
```

---

## HIGH Findings

### H-1. No rate limiting anywhere
**Confirmed by:** Security#1, Security#2, tRPC#1, tRPC#2, Plan#1, Plan#2 (6 agents)
**Files:** `src/server/api/trpc.ts`, `src/app/api/trpc/[trpc]/route.ts`, `src/server/auth/telegram-plugin.ts`

`@upstash/ratelimit` and `@upstash/redis` are installed but never imported. Zero rate limiting on auth endpoints or tRPC mutations.

**Impact:** DoS via auth flooding, bulk operation abuse, DB pool exhaustion (max=5 on Neon).

**Fix:** Implement `@upstash/ratelimit` on auth callback (5/min per IP) and tRPC mutations (30/min per user).

---

### H-2. No security headers (CSP, HSTS, X-Frame-Options)
**Confirmed by:** Security#1, Security#2, Plan#1, Plan#2 (4 agents)
**Files:** `next.config.ts`, `src/middleware.ts`

No `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`.

**Impact:** Clickjacking, amplified XSS impact, SSL-stripping.

**Fix:** Add headers in `next.config.ts` `headers()` function.

---

### H-3. `bulkUpdate` currency-split not wrapped in transaction
**Confirmed by:** Schema#1, tRPC#1, tRPC#2, Performance (4 agents)
**File:** `src/server/api/routers/trades.ts:349-371`

Two separate UPDATE statements (STARS + TON) without `ctx.db.transaction()`. Partial failure leaves inconsistent state.

**Fix:** Wrap in `ctx.db.transaction(async (tx) => { ... })`.

---

### H-4. `aggregateStats` ignores TON trades for best/worst
**Confirmed by:** Schema#1, PnL#1, PnL#2 (3 agents)
**File:** `src/lib/pnl-engine.ts:180-188`

Only STARS trades update `bestTrade`/`worstTrade`. TON trades are completely excluded.

**Impact:** Users trading only in TON see null best/worst. Mixed portfolios only show Stars extremes.

**Fix:** Add `bestTradeStars`, `bestTradeNanoton`, `worstTradeStars`, `worstTradeNanoton` fields.

---

### H-5. Stats flat commission included for TON trades
**Confirmed by:** Schema#1, PnL#1, Schema#2, tRPC#1 (4 agents)
**File:** `src/server/api/routers/stats.ts:54`

```sql
totalCommissionFlat: coalesce(sum(commission_flat_stars * quantity), 0)
```

Sums flat commission for ALL trades including TON. The VIEW and TS engine correctly exclude flat for TON.

**Fix:** `sum(CASE WHEN trade_currency = 'STARS' THEN commission_flat_stars * quantity ELSE 0 END)`.

---

### H-6. No sell date >= buy date validation
**Confirmed by:** tRPC#1, tRPC#2 (2 agents)
**File:** `src/server/api/routers/trades.ts` (add + update)

No `.refine()` checking `sellDate >= buyDate`. Users can create logically impossible trades.

**Fix:** Add `.refine((d) => !d.sellDate || d.sellDate >= d.buyDate, ...)` to `tradeInput`.

---

### H-7. Health check doesn't verify DB connectivity
**Confirmed by:** tRPC#1, tRPC#2 (2 agents)
**Files:** `src/app/api/health/route.ts`, `src/server/api/root.ts:9`

Both health endpoints return `{ status: "ok" }` without testing the database. Railway health checks won't detect DB failures.

**Fix:** Add `await db.execute(sql\`SELECT 1\`)` with try/catch returning 503 on failure.

---

### H-8. `as any` in telegram-plugin.ts — only `any` in codebase
**Confirmed by:** TS#1, TS#2 (2 agents)
**File:** `src/server/auth/telegram-plugin.ts:141`

```typescript
await setSessionCookie(ctx, { session, user: user as any });
```

Completely bypasses type checking for the user object passed to Better Auth.

**Fix:** Create a `SessionUser` interface matching Better Auth's expected shape.

---

### H-9. Non-null assertions on `.returning()` results
**Confirmed by:** TS#1, TS#2 (2 agents)
**Files:** `src/server/api/routers/trades.ts:195,272`, `src/server/api/routers/settings.ts:31`

```typescript
return trade!;   // Could be undefined if concurrent delete
return updated!; // Could be undefined
return created!; // Could be undefined
```

**Fix:** Replace `!` with explicit null check + `TRPCError({ code: "NOT_FOUND" })`.

---

### H-10. Cursor pagination broken on non-ID sort columns
**Confirmed by:** tRPC#1, tRPC#2, Performance (3 agents)
**File:** `src/server/api/routers/trades.ts:68-82`

Cursor is `id`-based but ORDER BY uses `buyDate`, `sellPrice`, etc. When sort column has duplicates, rows are skipped or duplicated across pages.

**Fix:** Use compound cursor `(sortCol_value, id)` with `WHERE (sort, id) < (cursor_sort, cursor_id)`.

---

### H-11. Settings race condition on concurrent auto-create
**Confirmed by:** tRPC#1
**File:** `src/server/api/routers/settings.ts:19-35`

Two concurrent requests for a new user both try INSERT. Second fails with unhandled unique constraint violation.

**Fix:** Use `INSERT ... ON CONFLICT (user_id) DO NOTHING` or catch + re-select.

---

### H-12. Per-row dialog/mutation instances in TradeRowActions
**Confirmed by:** Performance
**File:** `src/app/(dashboard)/trades/_components/trade-row-actions.tsx:28-45`

Each row creates 2 mutation hooks + 2 dialog instances. 50 rows = 100 mutations + 100 dialogs in DOM.

**Fix:** Lift dialogs to parent `TradesTable`. Use a single shared dialog with selected trade state.

---

### H-13. Infinite scroll accumulates all pages without virtualization
**Confirmed by:** Performance
**File:** `src/app/(dashboard)/trades/_components/trades-table.tsx:52-55`

`useInfiniteQuery` keeps all pages in memory. 20 pages = 1000 rows rendered as DOM nodes. No `@tanstack/react-virtual`.

**Fix:** Add `useVirtualizer` from `@tanstack/react-virtual`. Consider `maxPages` option.

---

### H-14. No tRPC batch size limit
**Confirmed by:** tRPC#2
**File:** `src/app/api/trpc/[trpc]/route.ts`

No `batching.maxSize` config. Attacker can batch hundreds of calls in one HTTP request.

**Fix:** Add batch size limiting in tRPC fetch handler config.

---

### H-15. Accessibility CRITICAL — multiple a11y gaps
**Confirmed by:** UI/a11y audit
**Files:** Multiple UI components

- Logout button missing `aria-label` (dashboard-shell.tsx)
- Trades table missing `<caption>` (trades-table.tsx)
- Dialog missing `DialogDescription` (trade-form-dialog.tsx)
- Loading spinner has no ARIA announcement (trades-table.tsx)
- Bulk delete has no confirmation dialog (bulk-actions-bar.tsx)
- Hidden rows `opacity-50` fails WCAG contrast (trades-table.tsx)
- Form validation uses only toast, no inline errors (trade-form-dialog.tsx)
- Settings form has no `<form>` element (settings/page.tsx)
- Labels not associated with Select components (trade-form-dialog.tsx)

---

### H-16. `formatStars` untested for negative BigInt values
**Confirmed by:** PnL#1, PnL#2 (2 agents)
**File:** `src/lib/currencies.ts:98-100`

Relies on `Intl.NumberFormat` handling negative BigInt (works in V8 but untested). `formatTon` has explicit sign handling; `formatStars` does not.

**Fix:** Add explicit negative handling or at minimum test coverage.

---

## MEDIUM Findings (summarized)

| # | Finding | File(s) | Agents |
|---|---------|---------|--------|
| M-1 | `exportCsv` returns ALL trades, no LIMIT | trades.ts:446 | tRPC#1, tRPC#2, Perf |
| M-2 | Attribute string fields no `.max()` | trades.ts:28-33 | Sec#1, Sec#2, tRPC#1, tRPC#2, TS#1 |
| M-3 | `buyPrice` bigint has no upper bound | trades.ts:16 | Sec#1 |
| M-4 | `gifts.parseUrl` is public procedure | gifts.ts:6 | Sec#1, Sec#2, tRPC#2, Schema#2 |
| M-5 | Missing `noUncheckedIndexedAccess` in tsconfig | tsconfig.json | TS#1, TS#2 |
| M-6 | Unsafe `as` casts on API responses (exchange-rates.ts) | exchange-rates.ts:41,52 | TS#1, TS#2 |
| M-7 | `photo_url` stored without URL validation | telegram-plugin.ts:12 | Sec#1, Sec#2 |
| M-8 | Telegram auth replay 24h window (should be 5min) | telegram-plugin.ts:49 | Sec#2 |
| M-9 | `update` allows sellDate without sellPrice | trades.ts:198 | tRPC#1, tRPC#2 |
| M-10 | Sell rate not re-locked when only sellPrice changes | trades.ts:230 | PnL#1, tRPC#2 |
| M-11 | `portfolioValue` mixes TON+STARS positions | stats.ts:88-137 | PnL#1 |
| M-12 | Commission editable after creation (plan says "locked") | trades.ts:250 | PnL#1, Schema#2 |
| M-13 | Stats runs 2 separate aggregation queries | stats.ts:48-70 | Perf |
| M-14 | No CORS config on tRPC handler | route.ts | tRPC#1 |
| M-15 | `restore` doesn't handle unique constraint violation | trades.ts:299 | Schema#1, tRPC#1 |
| M-16 | `settings.update` silent no-op if settings don't exist | settings.ts:67 | tRPC#1, tRPC#2 |
| M-17 | Trades page is `"use client"` — no SSR prefetch | trades/page.tsx | Perf, UI/a11y |
| M-18 | `SummaryCards` period switch flashes skeleton | summary-cards.tsx | Perf |
| M-19 | Profit computed per-row on every render (no memoization) | columns.tsx:24-37 | Perf |
| M-20 | Connection pool max=5, no pooler endpoint documented | db/index.ts:11 | Perf |
| M-21 | Exchange rate fetch blocks trade mutation (no inflight dedup) | trades.ts:149 | Perf |
| M-22 | No `trade_currency` SQL CHECK constraint | schema.ts:146 | Schema#1, Schema#2 |
| M-23 | `userSettings` has no CHECK constraints | schema.ts:104-116 | Schema#2 |
| M-24 | `NetworkBanner` lacks `role="alert"` | network-banner.tsx | UI/a11y |
| M-25 | Color-only profit indication (green/red) | columns.tsx, summary-cards.tsx | UI/a11y |

---

## LOW Findings (summarized)

| # | Finding | File(s) |
|---|---------|---------|
| L-1 | BigInt->Number overflow risk in `computeUsdValue` | pnl-engine.ts:139,142 |
| L-2 | Migration 0002 not idempotent (`ADD COLUMN IF NOT EXISTS`) | 0002_add_quantity_columns.sql |
| L-3 | `giftNumber` uses bigint (overkill for gift numbers) | schema.ts:132 |
| L-4 | `userSettings.id` bigserial on a 1:1 table — userId could be PK | schema.ts:105 |
| L-5 | `dbHttp` exported but never imported (dead code) | db/index.ts:28 |
| L-6 | Health endpoint exposes git commit SHA | health/route.ts:7 |
| L-7 | Session cookie cache 5min delays session revocation | auth/index.ts:18 |
| L-8 | `date-fns` imported only for one format call | trade-form-dialog.tsx:7 |
| L-9 | `refetchOnWindowFocus` default fires 3+ queries on tab switch | query-client.ts |
| L-10 | `settings.update` returns `{ success: true }` not updated object | settings.ts:72 |
| L-11 | `restore` doesn't check if trade was actually deleted | trades.ts:300 |
| L-12 | Sell rate locked to current moment, not to `sellDate` | trades.ts:153 |
| L-13 | Duplicate type definitions (CurrencyFilter, SortColumn, SortDir) | page.tsx, toolbar.tsx |
| L-14 | Missing composite index for stats aggregation | schema.ts |
| L-15 | `TradeProfit` type exported but never imported | schema.ts:247 |
| L-16 | No `onError` handler in tRPC fetch handler | route.ts |
| L-17 | Two separate health check endpoints (tRPC + API route) | root.ts:9, health/route.ts |
| L-18 | Skeleton components lack `aria-hidden` | skeleton.tsx |
| L-19 | Missing `aria-current="page"` on nav links | dashboard-shell.tsx |
| L-20 | `telegramPlugin` missing explicit return type | telegram-plugin.ts:27 |

---

## Positive Security Patterns

These are worth acknowledging as correctly implemented:

1. **Every DB query filters by `userId`** — zero IDOR vulnerabilities across all routers
2. **Telegram HMAC-SHA256** — correct algorithm, `timingSafeEqual`, Zod-validated hash format
3. **No `sql.raw()`** — all SQL via Drizzle parameterized templates
4. **No `dangerouslySetInnerHTML`**, no `eval()`, no `new Function()`
5. **Environment validation** via `@t3-oss/env-nextjs` with strict Zod schemas
6. **`.env` properly .gitignored**, Docker runs as non-root
7. **Race condition handling** in user creation (catch + retry pattern)
8. **DB connection string sanitization** before logging
9. **Mass assignment prevented** — update mutations only accept specific fields
10. **DB CHECK constraints** on quantity, prices, commission ranges
11. **SuperJSON BigInt serialization** consistent on server and client
12. **Good a11y practices** in some areas: checkbox `aria-label`, toggle `aria-pressed`, row menu descriptive labels, safe-area padding

---

## Prioritized Action Plan

### Phase 7A: Critical Fixes (do first)

| Priority | Fix | Effort |
|----------|-----|--------|
| 1 | **C-4** Fix unique index to include `giftNumber` | S |
| 2 | **C-3** Add `isNull(deletedAt)` to getById/update/toggleHidden | S |
| 3 | **C-1** Align rounding (change SQL `ROUND()` to `FLOOR(x+0.5)`) | M |
| 4 | **C-5** Add CHECK constraints (trade_currency, ton_no_flat) | S |
| 5 | **C-2** Decide: use VIEW in stats, or remove it | M |

### Phase 7B: High Priority

| Priority | Fix | Effort |
|----------|-----|--------|
| 6 | **H-1** Implement rate limiting (auth + tRPC) | M |
| 7 | **H-2** Add security headers in next.config.ts | S |
| 8 | **H-3** Wrap bulkUpdate in transaction | S |
| 9 | **H-5** Fix stats flat commission for TON | S |
| 10 | **H-6** Add sell date >= buy date validation | S |
| 11 | **H-7** Add DB check to health endpoint | S |
| 12 | **H-10** Fix cursor pagination (compound cursor) | M |
| 13 | **H-8** Replace `as any` with typed interface | S |
| 14 | **H-9** Replace `!` assertions with null checks | S |

### Phase 7C: Performance & UX

| Priority | Fix | Effort |
|----------|-----|--------|
| 15 | **H-12** Lift dialogs to parent component | M |
| 16 | **H-13** Add row virtualization | M |
| 17 | **M-1** Add LIMIT to exportCsv | S |
| 18 | **M-2** Add `.max()` to attribute fields | S |
| 19 | **M-17** Split trades page into RSC + client | M |
| 20 | **M-19** Memoize profit computation | S |

### Phase 7D: Hardening & Polish

| Priority | Fix | Effort |
|----------|-----|--------|
| 21 | **M-5** Add `noUncheckedIndexedAccess` to tsconfig | M |
| 22 | **M-6** Validate external API responses with Zod | S |
| 23 | **M-8** Reduce Telegram auth window to 5min | S |
| 24 | **H-15** Fix a11y CRITICAL issues | M |
| 25 | **H-4** Track best/worst trade per currency | S |
| 26 | **H-11** Fix settings race condition | S |

**Effort key:** S = small (<30 min), M = medium (30-120 min), L = large (>2 hours)

---

## Cross-Validation Matrix

Findings confirmed by multiple independent agents (higher confidence):

| Finding | Agents confirming | Confidence |
|---------|-------------------|------------|
| Rounding mismatch (C-1) | 4 agents | Very High |
| deletedAt leak (C-3) | 3 agents | Very High |
| No rate limiting (H-1) | 6 agents | Very High |
| bulkUpdate no transaction (H-3) | 4 agents | Very High |
| Stats flat for TON (H-5) | 4 agents | Very High |
| Cursor pagination (H-10) | 3 agents | Very High |
| Attribute fields no .max() (M-2) | 5 agents | Very High |
| VIEW never queried (C-2) | 2 agents | High |
| No security headers (H-2) | 4 agents | Very High |
| as any telegram (H-8) | 2 agents | High |
