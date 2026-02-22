# GIFTSSITE — Adversarial Architecture Audit

> **Status:** Complete
> **Date:** 2026-02-20
> **Goal:** Find everything we might have missed, under-thought, or that could break. Two experts debating: one defends, one attacks. Result: list of real problems with priorities.
> **Method:** 7 parallel expert agents analyzing critical risk areas

---

## Table of Contents

1. [Overview & Critical Findings](#overview)
2. [Better Auth + Telegram Plugin](#1-better-auth--telegram-plugin)
3. [tRPC vs Server Actions](#2-trpc-vs-server-actions-critical-contradiction)
4. [Neon HTTP Driver — No Transactions](#3-neon-http-driver--no-transactions)
5. [BigInt / TON in JavaScript](#4-bigint--ton-in-javascript)
6. [New User Onboarding & Empty State](#5-new-user-onboarding--empty-state)
7. [Exchange Rate Fetching](#6-exchange-rate-fetching)
8. [Gift Uniqueness + TON Price Input UX](#7-gift-uniqueness--ton-price-input-ux)
9. [Updated Implementation Plan](#updated-implementation-plan)
10. [Files to Create / Change](#files-to-create--change)

---

## Overview

### Critical Findings Summary

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | `definePlugin` may not exist in Better Auth — use `satisfies BetterAuthPlugin` | HIGH | Fix before implementation |
| 2 | Architecture contradicts itself: tRPC + "No TanStack Query for MVP" | **CRITICAL** | Delete Server Actions from plan |
| 3 | Neon HTTP driver has NO transactions — switch to WebSocket driver | HIGH | Switch before first write |
| 4 | BigInt not JSON-serializable — need superjson in tRPC | HIGH | Add superjson from day 1 |
| 5 | Empty state UX missing from plan — users will be lost on first login | MEDIUM | Add to Phase 4 |
| 6 | Exchange rate fetching has no fallback strategy | MEDIUM | Implement multi-source fallback |
| 7 | No UNIQUE constraint on open trades — duplicate positions corrupt PnL | HIGH | Add partial unique index |

### Key Decisions (Adversarial Audit)

| Aspect | Decision |
|--------|----------|
| Better Auth plugin | `satisfies BetterAuthPlugin` (not `definePlugin`), check exports at install |
| Data mutation | tRPC only — delete all Server Actions from plan |
| DB driver | `drizzle-orm/neon-serverless` (WebSocket), not neon-http |
| BigInt serialization | `superjson` transformer in tRPC (both server and client) |
| Drizzle bigint mode | `{ mode: "bigint" }` for ALL bigint columns |
| Empty state | Guided First Trade pattern (inline, no new pages) |
| Exchange rates | Binance primary + OKX fallback via `Promise.any`, in-memory cache TTL 5min |
| Gift uniqueness | Partial unique index `WHERE sell_date IS NULL` |
| TON input parsing | String arithmetic (no float), `parseTonInput()` in currencies.ts |
| Stars/USD rate | Fixed $0.013 (Telegram fixed pricing) |

---

## 1. Better Auth + Telegram Plugin

> **Expert:** Troy Hunt (Security) + Matt Pocock (TypeScript)

### Problem

`definePlugin` as a named export from `better-auth` — this is NOT a documented public API in all versions. The architecture document shows:

```typescript
import { definePlugin } from "better-auth"; // ← may not exist
export const telegramPlugin = definePlugin({ ... });
```

### Solution

Use `BetterAuthPlugin` type with `satisfies` instead:

```typescript
// src/server/auth/telegram-plugin.ts
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import { createHash, createHmac, timingSafeEqual } from "crypto";

const TelegramAuthSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});

export const telegramPlugin = {
  id: "telegram",
  endpoints: {
    signInTelegram: createAuthEndpoint(
      "/sign-in/telegram",
      { method: "POST" },
      async (ctx) => {
        const parsed = TelegramAuthSchema.safeParse(ctx.body);
        if (!parsed.success) {
          throw ctx.error("BAD_REQUEST", { message: "Invalid payload" });
        }
        const data = parsed.data;

        // 1. HMAC-SHA256 verification — MUST be first, before any DB call
        if (!verifyTelegramHash(data, process.env.TELEGRAM_BOT_TOKEN!)) {
          throw ctx.error("UNAUTHORIZED", { message: "Invalid Telegram signature" });
        }

        // 2. Check auth_date freshness (24h)
        if (Date.now() / 1000 - data.auth_date > 86400) {
          throw ctx.error("UNAUTHORIZED", { message: "Auth data expired" });
        }

        // 3. Upsert user + user_settings in a TRANSACTION (see section 3)
        const user = await createUserOnFirstLogin(data);

        const session = await ctx.context.internalAdapter.createSession(
          user.id,
          ctx.request
        );
        return ctx.json({ session });
      }
    ),
  },
} satisfies BetterAuthPlugin;

// CRITICAL: HMAC verification with timing-safe comparison
function verifyTelegramHash(data: Record<string, unknown>, token: string): boolean {
  const { hash, ...fields } = data as { hash: string; [k: string]: unknown };
  const checkString = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHash("sha256").update(token).digest();
  const computed = createHmac("sha256", secretKey).update(checkString).digest("hex");
  return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(hash, "hex"));
}
```

### Verification Step (at npm install time)

```bash
node -e "const ba = require('better-auth'); console.log(Object.keys(ba))"
# Check for: definePlugin, BetterAuthPlugin, createAuthEndpoint
# If definePlugin missing → use "satisfies BetterAuthPlugin" pattern above
```

### Risk

- `internalAdapter` is an internal API — wrap in `upsertTelegramUser()` with direct Drizzle as fallback
- Better Auth may require real email — `{id}@telegram.local` pattern handles this
- HMAC verification must be FIRST operation before any DB call

---

## 2. tRPC vs Server Actions — CRITICAL CONTRADICTION

> **Expert:** Theo Browne (API Design)

### Problem

Architecture document contradicts itself:

- **Section 1:** "Next.js 15 Monolith + tRPC"
- **Section 5:** "Server Actions + useOptimistic. **No TanStack Query needed for MVP.**"
- **Implementation Plan:** Both `actions/trade-actions.ts` AND tRPC routers

This is not a style issue — it's a fundamental architectural inconsistency that will create:
- Duplicate auth guards (`protectedProcedure` + manual wrappers)
- No Zod runtime validation on Server Actions
- Technical debt when Telegram Mini App arrives (Phase 3)

### Decision

**tRPC is the ONLY way to mutate data. Delete all Server Actions.**

```
tRPC = SINGLE path for all data changes
Server Actions = NOT used (remove from plan)

RSC pages → tRPC server caller (createCaller) for initial data
Client Components → api.X.Y.useMutation() for mutations
Cache invalidation → utils.X.Y.invalidate() in onSuccess
Auth → protectedProcedure everywhere, once
```

### Files to REMOVE from plan

```diff
- app/(dashboard)/trades/actions/trade-actions.ts   ← DELETE
- app/(dashboard)/settings/actions/settings-actions.ts ← DELETE
```

### tRPC Router Structure

```
src/server/api/routers/
  trades.ts    ← list, getById, add, update, delete, importCsv
  stats.ts     ← dashboard stats (PnL, volumes, count)
  gifts.ts     ← parseUrl, fetchAttributes
  market.ts    ← floorPrices (cached 1h in memory)
  settings.ts  ← getSettings, updateSettings
```

### Cache Invalidation Pattern

```typescript
// Client component mutation
const utils = api.useUtils();

const addTrade = api.trades.add.useMutation({
  onSuccess: () => {
    utils.trades.list.invalidate();
    utils.stats.dashboard.invalidate();
  },
});
```

---

## 3. Neon HTTP Driver — No Transactions

> **Expert:** Martin Kleppmann (Distributed Systems)

### Problem

`drizzle-orm/neon-http` (HTTP driver) does NOT support interactive transactions. `db.transaction()` will throw at runtime.

Operations that REQUIRE transactions in GIFTSSITE:
1. **User creation** — INSERT users + INSERT user_settings (must be atomic pair)
2. **Bulk CSV import** (Phase 6) — all rows or none
3. Any future multi-table write where partial success = corrupt state

### Solution: Switch to neon-serverless (WebSocket driver)

```typescript
// src/server/db/index.ts
// CHANGE from drizzle-orm/neon-http to drizzle-orm/neon-serverless

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import ws from "ws"; // npm install ws @types/ws

// Required for Node.js (Railway). Not needed in Edge Runtime.
neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const db = drizzle(pool, { schema });

// Graceful shutdown for Railway
process.on("SIGTERM", () => pool.end());
```

### Transaction Rules (Architecture Rule)

```
RULE: External HTTP calls ALWAYS outside transaction boundary
PATTERN: fetch external data → start db.transaction() → DB ops only → commit

Operations REQUIRING explicit transaction:
  1. users + user_settings creation (must both exist for PnL VIEW to work)
  2. Bulk CSV import (all or nothing)

Operations NOT needing explicit transaction:
  1. Single INSERT/UPDATE/DELETE (auto-committed)
  2. SELECT queries
```

### Implementation Patterns

```typescript
// PATTERN 1: User creation — atomic pair
async function createUserOnFirstLogin(telegramData: TelegramAuthData) {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({...}).returning();
    // MUST succeed atomically — user_settings drives all PnL VIEW calculations
    await tx.insert(userSettings).values({ userId: user.id, ...defaults });
    return user;
  });
}

// PATTERN 2: External calls BEFORE transaction
async function addTrade(input: AddTradeInput, userId: string) {
  // Step 1: External data BEFORE transaction (idempotent reads)
  const [attrs, rateUsd] = await Promise.allSettled([
    fetchGiftAttributes(parsed.slug),     // nullable on failure
    fetchExchangeRate(input.tradeCurrency), // nullable on failure
  ]);

  // Step 2: Atomic DB write — external failures don't rollback
  return db.transaction(async (tx) => {
    return tx.insert(trades).values({
      ...input, userId,
      attrModel: attrs.status === "fulfilled" ? attrs.value?.model : null,
      buyRateUsd: rateUsd.status === "fulfilled" ? rateUsd.value : null,
    }).returning();
  });
}
```

### Install

```bash
npm install ws
npm install -D @types/ws
```

---

## 4. BigInt / TON in JavaScript

> **Expert:** Matt Pocock (TypeScript) + Theo Browne (API Design)

### Problem

Four interconnected issues:
1. `JSON.stringify(42n)` → TypeError (tRPC HTTP transport breaks)
2. React `<input value={bigint}>` → TypeError
3. Drizzle default `bigint` mode returns `number` (precision loss for large values)
4. `parseFloat("3.5") * 1e9` = `3499999999.9999995` (floating-point error)

### Solutions

#### A. superjson in tRPC

```bash
npm install superjson
```

```typescript
// src/server/api/trpc.ts
import superjson from "superjson";
export const t = initTRPC.context<Context>().create({ transformer: superjson });

// src/lib/trpc/client.ts
httpBatchLink({ url: "/api/trpc", transformer: superjson })
```

MUST be symmetric on both server and client.

#### B. Drizzle bigint mode

```typescript
// src/server/db/schema.ts — ALL bigint columns must use mode: "bigint"
buyPriceNanoton: bigint("buy_price_nanoton", { mode: "bigint" }),
sellPriceNanoton: bigint("sell_price_nanoton", { mode: "bigint" }),
buyPriceStars:   bigint("buy_price_stars",   { mode: "bigint" }),
// ... ALL bigint fields
```

Default Drizzle mode is `"number"` — this silently loses precision for large values.

#### C. String arithmetic for TON input (no floating-point)

```typescript
// src/lib/currencies.ts

export type Stars   = bigint & { readonly _brand: "Stars" };
export type NanoTon = bigint & { readonly _brand: "NanoTon" };

/** "3.5" → 3_500_000_000n — string arithmetic, no floating-point */
export function parseTonInput(input: string): NanoTon | null {
  const trimmed = input.trim().replace(",", ".");
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return null;
  const [intPart = "0", fracPart = ""] = trimmed.split(".");
  const fracPadded = fracPart.slice(0, 9).padEnd(9, "0"); // 9 decimal places
  try {
    return BigInt(intPart + fracPadded) as NanoTon;
  } catch {
    return null;
  }
}

/** 3_500_000_000n → "3.5" */
export function formatTonInput(n: NanoTon): string {
  const str = n.toString().padStart(10, "0");
  const intPart = str.slice(0, -9) || "0";
  const fracPart = str.slice(-9).replace(/0+$/, "");
  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

/** 3_500_000_000n → "3.50 TON" */
export function formatTon(n: NanoTon, decimals = 2): string {
  const str = n.toString().padStart(10, "0");
  const intPart = str.slice(0, -9) || "0";
  const fracPart = str.slice(-9).slice(0, decimals).padEnd(decimals, "0");
  return `${intPart}.${fracPart}`;
}

export function parseStarsInput(input: string): Stars | null {
  if (!/^\d+$/.test(input.trim())) return null;
  try { return BigInt(input.trim()) as Stars; } catch { return null; }
}

export function formatStars(n: Stars): string {
  return Number(n).toLocaleString(); // Stars < 2^53 in practice — safe
}

// For external APIs that return number (giftasset.pro)
export function toNanoTon(ton: number): NanoTon {
  return parseTonInput(ton.toString()) ?? (0n as NanoTon);
}
```

#### D. React form pattern

```typescript
// AddTradeDialog.tsx
// RULE: input state = string, domain state = NanoTon
const [tonInput, setTonInput] = useState(""); // what user types

const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
  if (/^\d*\.?\d*$/.test(e.target.value)) setTonInput(e.target.value);
};

const handleSubmit = () => {
  const nanoTon = parseTonInput(tonInput);
  if (!nanoTon) return; // show validation error
  addTrade.mutate({ buyPriceNanoton: nanoTon, ... });
};
```

---

## 5. New User Onboarding & Empty State

> **Expert:** Nir Eyal (Hooked Model) + Yu-kai Chou (Gamification)

### Problem

MVP plan has NO onboarding flow. After Telegram login → user lands on empty table with 7 column headers and nothing else. Time-to-Value = infinite. First impression = broken product.

### Solution: Guided First Trade (inline, no new pages)

**Hooked Model for GIFTSSITE:**
```
Trigger:   "Вставь ссылку на подарок" (removes cognitive load)
Action:    paste URL → auto-parse → form fills itself (minimum effort)
Reward:    table appears, PnL cards come alive, row highlight (variable reward)
Investment: user added real data → has something to lose → will return
```

### Changes to Phase 4

```diff
# In src/app/(dashboard)/trades/_components/TradesTable.tsx
+ Empty state when trades.length === 0:
+   illustration (gift emoji or SVG)
+   text: "Добавь первую сделку"
+   prominent button (NOT ghost): "Добавить сделку"
+   link: "Сначала настрой комиссию →" (leads users to /settings they'd never find)
+   Summary Cards: hidden when trades.length === 0

# In AddTradeDialog.tsx
+ placeholder on URL field: "https://t.me/nft/EasterEgg-52095"
+ helper text: "Скопируй из Fragment или Telegram"
+ autofocus on URL field when dialog opens

# After first trade added
+ toast: "Сделка добавлена" (shadcn Sonner)
+ new row highlighted for 2 seconds (ring-2 ring-primary transition)

# After first login (Phase 3 — Auth)
+ auto-open AddTradeDialog via URL: /trades?onboarding=1
  (useEffect checks URL param and opens dialog)
```

**No schema changes needed** — no demo data, no `is_demo` flag.

**Estimated extra work:** 6-8 hours within Phase 4.

---

## 6. Exchange Rate Fetching

> **Expert:** Martin Kleppmann (Distributed Systems)

### Problem

Architecture mentions `exchange-rates.ts` with caching but no fallback strategy. External APIs can fail. CoinGecko has strict rate limits. No strategy for:
- API downtime
- Rate limit exceeded
- Stale data

### Solution: Multi-source fallback chain + stale-ok + manual override

```typescript
// src/lib/exchange-rates.ts

interface RateEntry { rate: number; fetchedAt: number; }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 2000;       // 2 seconds max
const cache = new Map<string, RateEntry>();

async function fetchFromBinance(): Promise<number> {
  const r = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT",
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const d = await r.json() as { price: string };
  return parseFloat(d.price);
}

async function fetchFromOkx(): Promise<number> {
  const r = await fetch("https://www.okx.com/api/v5/market/ticker?instId=TON-USDT",
    { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  const d = await r.json() as { data: Array<{ last: string }> };
  return parseFloat(d.data[0].last);
}

export async function getTonUsdRate(): Promise<{ rate: number | null; isStale: boolean }> {
  const cached = cache.get("TON_USD");
  const now = Date.now();

  // Fresh cache hit
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return { rate: cached.rate, isStale: false };
  }

  // Parallel fetch — first to respond wins
  try {
    const rate = await Promise.any([fetchFromBinance(), fetchFromOkx()]);
    cache.set("TON_USD", { rate, fetchedAt: now });
    return { rate, isStale: false };
  } catch {
    // All sources failed — return stale cache if available
    if (cached) return { rate: cached.rate, isStale: true };
    return { rate: null, isStale: false }; // null = trade saves without rate (UI shows "—")
  }
}

// Stars: Telegram sets fixed price — NOT volatile
export const STARS_USD_RATE = 0.013 as const; // $0.013 per Star
```

### API Sources (no auth required)

| Source | Endpoint | Rate limit | Latency |
|--------|----------|-----------|---------|
| **Binance** (primary) | `/api/v3/ticker/price?symbol=TONUSDT` | 1200 req/min | ~50ms |
| **OKX** (fallback) | `/api/v5/market/ticker?instId=TON-USDT` | 20 req/2sec | ~80ms |
| **Bybit** (tertiary) | `/v5/market/tickers?category=spot&symbol=TONUSDT` | 120 req/min | ~100ms |

### Rules

- **NEVER block trade creation** if rate is unavailable — `buy_rate_usd = NULL` is valid (UI shows "—")
- In-memory cache survives between requests on Railway (persistent Node.js process)
- Manual rate input as optional field in AddTradeDialog (for historical/backdated trades)
- Stars USD rate is fixed — no fetching needed

---

## 7. Gift Uniqueness + TON Price Input UX

> **Expert:** Martin Fowler (Domain Modeling) + Nir Eyal (UX)

### Problem A: No UNIQUE constraint on trades

Currently nothing prevents a user from accidentally adding the same open position twice. Duplicate open positions double-count PnL.

### Domain Analysis

Telegram NFT gifts are unique tokens. A user can:
- Buy `EasterEgg-52095` → hold → sell → buy again (rebuy = valid)
- Accidentally add `EasterEgg-52095` twice as "holding" (BUG)

Therefore: UNIQUE on `(user_id, gift_slug)` WHERE open (sell_date IS NULL).

### Solution: Partial Unique Index

```sql
-- Add to migration (Drizzle doesn't have built-in partial unique index syntax):
CREATE UNIQUE INDEX idx_trades_unique_open_position
  ON trades (user_id, gift_slug)
  WHERE sell_date IS NULL;
```

In schema.ts, add a comment:
```typescript
// NOTE: partial unique index added in migration:
// CREATE UNIQUE INDEX idx_trades_unique_open_position
//   ON trades (user_id, gift_slug)
//   WHERE sell_date IS NULL;
```

This:
- PREVENTS: two simultaneous holdings of `EasterEgg-52095`
- ALLOWS: buy → sell → buy again (rebuy) — one closed + one open
- ALLOWS: two fully closed positions for same slug (trade history)

### Problem B: TON input UX

User types "3.5" but the DB needs `3500000000` (nanotons as BIGINT).

### Solution: String arithmetic in Zod transform (server-side)

```typescript
// src/server/api/routers/trades.ts
const tonAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,9})?$/, "Введите корректную сумму TON (например: 3.5)")
  .transform((val) => {
    const [intPart = "0", fracPart = ""] = val.split(".");
    const fracPadded = fracPart.slice(0, 9).padEnd(9, "0");
    return BigInt(intPart + fracPadded) as NanoTon; // string arithmetic, no float
  });
```

Client form validates with same regex (without transform) for real-time feedback.

**Input → Output mapping:**
| User types | DB stores | Display |
|------------|-----------|---------|
| `"3.5"` | `3500000000` | `3.50 TON` |
| `"3"` | `3000000000` | `3.00 TON` |
| `"0.001"` | `1000000` | `0.001 TON` |
| `"3.123456789"` | `3123456789` | `3.12 TON` |

---

## Updated Implementation Plan

### Phase 1: Project Setup (Day 1) ← Updated

- [ ] `npx create-next-app@latest` with TypeScript strict
- [ ] Install dependencies: `drizzle-orm`, `@neondatabase/serverless`, `ws`, `@types/ws`, `better-auth`, `@trpc/server`, `@trpc/client`, `@tanstack/react-query`, `superjson`, `zod`
- [ ] Configure tRPC with `superjson` transformer (both server + client)
- [ ] Create `src/server/db/index.ts` with **neon-serverless** (WebSocket) driver
- [ ] Write `src/lib/currencies.ts` with branded types + `parseTonInput()` + `formatTon()`
- [ ] Write `src/lib/exchange-rates.ts` with Binance + OKX multi-source fetching
- [ ] Drizzle schema with `{ mode: "bigint" }` on ALL bigint columns

### Phase 2: Database Schema (Day 2) ← Updated

- [ ] Run `npx drizzle-kit generate` + `npx drizzle-kit push`
- [ ] **Add partial unique index migration:**
  ```sql
  CREATE UNIQUE INDEX idx_trades_unique_open_position
    ON trades (user_id, gift_slug)
    WHERE sell_date IS NULL;
  ```
- [ ] Verify VIEW `trade_profits` compiles in Neon

### Phase 3: Auth (Days 3-4) ← Updated

- [ ] Install better-auth and check exported API: `node -e "console.log(Object.keys(require('better-auth')))"`
- [ ] Implement `telegramPlugin` with `satisfies BetterAuthPlugin` (not `definePlugin`)
- [ ] Implement `verifyTelegramHash()` with `timingSafeEqual`
- [ ] `createUserOnFirstLogin()` with `db.transaction()` (users + user_settings atomic)
- [ ] After first login: redirect to `/trades?onboarding=1`

### Phase 4: UI — Table & Dashboard (Days 5-7) ← Updated

- [ ] **Remove Server Actions** — all mutations via tRPC
- [ ] TradesTable empty state: illustration + "Добавь первую сделку" + CTA button + settings link
- [ ] AddTradeDialog: URL placeholder, helper text, autofocus, optional manual rate field
- [ ] Post-add feedback: toast + 2-second row highlight
- [ ] Summary Cards: hidden when trades.length === 0

### Phase 5: Polish & Deploy (Day 8)

- [ ] Railway deployment + environment variables
- [ ] Mobile responsive check: buttons min 44px, empty state centered
- [ ] Error boundaries + loading states

---

## Files to Create / Change

| File | Action | Reason |
|------|--------|--------|
| `src/server/db/index.ts` | CREATE with neon-serverless | WebSocket driver for transactions |
| `src/lib/currencies.ts` | CREATE | Branded types + `parseTonInput()` + `formatTon()` |
| `src/lib/exchange-rates.ts` | CREATE | Multi-source rate fetching with cache |
| `src/server/auth/telegram-plugin.ts` | CREATE | `satisfies BetterAuthPlugin`, HMAC verification |
| `src/server/api/trpc.ts` | CREATE | superjson transformer |
| `src/lib/trpc/client.ts` | CREATE | superjson transformer (must match server) |
| `src/server/db/schema.ts` | CREATE | ALL bigint columns with `{ mode: "bigint" }` |
| `docs/plans/2026-02-19-architecture-design.md` | UPDATE | Fix tRPC contradiction, transaction rules |
| Migration SQL | ADD | Partial unique index on trades |
| `package.json` dependencies | ADD | `superjson`, `ws`, `@types/ws` |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Time to first trade added | < 60 seconds from login |
| Trade creation error rate | < 0.1% (no crashes from BigInt issues) |
| PnL calculation accuracy | 100% (no float rounding in BigInt path) |
| Auth security | HMAC-SHA256 + timingSafeEqual — zero bypass |
| Duplicate open positions | 0 (enforced by DB constraint) |
| Exchange rate availability | 99%+ (via multi-source fallback) |
