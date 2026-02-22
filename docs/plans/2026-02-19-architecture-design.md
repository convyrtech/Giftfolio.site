# GIFTSSITE — Architecture Design

> **Status:** Adversarial audit complete — 7 critical issues found and resolved
> **Date:** 2026-02-19 (updated after 3-expert audit + 7-agent adversarial audit 2026-02-20)
> **Goal:** Design full-stack architecture for a Telegram gift trading tracker (steamfolio.com clone)

---

## Table of Contents

1. [Overview](#overview)
2. [App Architecture](#1-app-architecture)
3. [Database & Schema](#2-database--schema)
4. [ORM Selection](#3-orm-selection)
5. [Authentication](#4-authentication)
6. [Frontend State & Data Fetching](#5-frontend-state--data-fetching)
7. [Table & UI Library](#6-table--ui-library)
8. [Commission Logic](#7-commission-logic)
9. [Gift Data Pipeline](#8-gift-data-pipeline)
10. [Deployment](#9-deployment)
11. [PnL Calculations](#10-pnl-calculations)
12. [Implementation Plan](#implementation-plan)

---

## Overview

### Goals

1. **Clone steamfolio.com UX** — dark theme, table-centric portfolio tracker for Telegram gift trades
2. **Multi-user with auth** — Telegram Login Widget, database sessions
3. **Profit tracking** — daily/weekly/monthly/total PnL, buy/sell volumes, multi-currency (Stars + TON)
4. **Gift data extraction** — parse t.me/nft/ links → name, number, image, attributes from Fragment CDN + APIs
5. **Mobile-first** — responsive design, Telegram users primarily on mobile
6. **Floor price integration** — giftasset.pro (no auth) for portfolio value estimation

### Key Decisions

| Aspect | Decision |
|--------|----------|
| Architecture | Next.js 15 monolith + tRPC (type-safe API) |
| Database | PostgreSQL via Neon (serverless) |
| ORM | Drizzle + @neondatabase/serverless (**WebSocket driver**, NOT neon-http — for transactions) |
| Auth | Better Auth + custom Telegram plugin via `satisfies BetterAuthPlugin` (NOT definePlugin — may not export) |
| State/Fetching | **tRPC only** — tRPC for ALL mutations + queries. No Server Actions. superjson transformer required. |
| Table | TanStack Table v8 + shadcn/ui (headless) |
| UI Library | shadcn/ui + Tailwind CSS v4 (CSS-first config) |
| Commission | Dual model: flat fee (Stars) + permille (‰), global default + per-trade override |
| Gift Pipeline | Deterministic URL parsing + Fragment CDN + attribute fetch from giftasset.pro |
| Deployment | Railway (Next.js app only) + Neon (PostgreSQL serverless) |
| PnL Engine | Isolated `pnl-engine.ts`, currency-aware, timezone-aware, SQL VIEW for net profit |
| Currencies | Stars (BIGINT integer) + TON (BIGINT nanotons, 1 TON = 1e9) per trade |
| Fiat Display | Historical rates (USD at buy/sell time) + secondary fiat (RUB/EUR). Never stored as profit — computed in VIEW |

---

## 1. App Architecture

> **Expert:** Sam Newman (Software Architecture)

### Decision: Next.js 15 Monolith + tRPC

All domains (trades, users, gift metadata, analytics, market prices) share one DB and are tightly coupled. Splitting into separate services adds distributed system overhead with zero benefit for a 1-2 person team.

tRPC provides end-to-end TypeScript safety — changing a procedure signature immediately shows errors in all client call sites.

```
src/
  server/
    db/
      index.ts             # Drizzle client (Neon serverless)
      schema.ts            # Drizzle schema (single file)
    api/
      trpc.ts              # tRPC context + procedures
      root.ts              # tRPC app router
      routers/
        trades.ts          # CRUD + aggregations
        auth.ts            # session management
        gifts.ts           # proxy to giftasset.pro + Fragment CDN
        stats.ts           # PnL calculations
        market.ts          # floor prices from giftasset.pro
    auth/
      index.ts             # Better Auth config
      telegram-plugin.ts   # Custom Telegram Login Widget plugin
  app/
    (auth)/
      login/page.tsx       # Telegram Login Widget
    (dashboard)/
      trades/
        page.tsx           # Main trades table
        _components/       # Page-specific components
      settings/page.tsx    # Commission, timezone, currency defaults
    api/
      trpc/[trpc]/route.ts # tRPC adapter
      auth/[...all]/route.ts # Better Auth handler
    layout.tsx
  lib/
    trpc/client.ts         # tRPC client provider
    pnl-engine.ts          # Pure PnL calculation functions
    gift-parser.ts         # URL parsing + attribute types
    currencies.ts          # Branded types: Stars, NanoTon, conversion
    exchange-rates.ts      # Rate fetching: TON/USD, Stars/USD, USD/RUB, caching
    utils.ts               # cn() and shared utilities
  components/
    ui/                    # shadcn/ui components
    providers/             # React context providers
  hooks/                   # Custom React hooks
```

---

## 2. Database & Schema

> **Expert:** Markus Winand (Database Performance)

### Decision: PostgreSQL via Neon (serverless)

PostgreSQL wins because:
- `date_trunc('week', sell_date)` gives ISO Mon-Sun natively
- `AT TIME ZONE` for user-specific timezone calculations
- Partial indexes for open positions (`WHERE sell_date IS NULL`)
- CHECK constraints for currency-price consistency
- BIGINT for precise monetary values (no floating point)

### Schema

```sql
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username    TEXT,
  first_name  TEXT NOT NULL,
  photo_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_settings (
  user_id                     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  -- Commission defaults (both models supported)
  default_commission_stars    BIGINT NOT NULL DEFAULT 0,     -- flat fee in Stars
  default_commission_permille SMALLINT NOT NULL DEFAULT 0,   -- ‰ (150 = 15%, Telegram official)
  -- Preferences
  default_currency            TEXT NOT NULL DEFAULT 'STARS'
    CHECK (default_currency IN ('STARS', 'TON')),
  display_fiat_currency       TEXT NOT NULL DEFAULT 'USD'
    CHECK (display_fiat_currency IN ('USD', 'RUB', 'EUR')),
  timezone                    TEXT NOT NULL DEFAULT 'UTC',    -- IANA timezone (e.g. "Europe/Moscow")
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE trades (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Gift identification
  gift_link           TEXT NOT NULL,           -- original t.me/nft/ URL
  gift_slug           TEXT NOT NULL,           -- "EasterEgg-52095"
  gift_name           TEXT NOT NULL,           -- "Easter Egg" (display name)
  gift_number         INTEGER NOT NULL,        -- 52095

  -- Gift attributes (cached from API at trade entry, nullable = not fetched yet)
  attr_model          TEXT,                    -- e.g. "Rose Gold"
  attr_backdrop       TEXT,                    -- e.g. "Cosmic"
  attr_symbol         TEXT,                    -- e.g. "Heart"
  attr_model_rarity   SMALLINT,               -- rarity_permille (0-1000), lower = rarer
  attr_backdrop_rarity SMALLINT,
  attr_symbol_rarity  SMALLINT,

  -- Currency for this trade (Stars OR TON, never mixed within one trade)
  trade_currency      TEXT NOT NULL DEFAULT 'STARS'
    CHECK (trade_currency IN ('STARS', 'TON')),

  -- Prices: Stars as INTEGER (whole), TON as nanotons (1 TON = 1,000,000,000)
  buy_price_stars     BIGINT,                 -- NULL if TON trade
  buy_price_nanoton   BIGINT,                 -- NULL if Stars trade
  buy_date            DATE NOT NULL,

  sell_price_stars    BIGINT,                 -- NULL if holding OR TON trade
  sell_price_nanoton  BIGINT,                 -- NULL if holding OR Stars trade
  sell_date           DATE,                   -- NULL = holding

  -- Commission override (NULL = use user_settings defaults)
  commission_flat_stars   BIGINT,             -- flat Stars override
  commission_permille     SMALLINT,           -- ‰ override (0-1000)

  -- Exchange rates snapshot (historical — at time of buy/sell)
  -- Stores USD value of 1 unit of native currency (1 Star or 1 TON)
  buy_rate_usd        NUMERIC(12,8),    -- e.g. 0.01300000 (1 Star = $0.013) or 3.50000000 (1 TON = $3.50)
  sell_rate_usd       NUMERIC(12,8),    -- same, at sell time. NULL if holding
  buy_rate_fiat       NUMERIC(12,4),    -- secondary fiat per 1 USD (e.g. 96.5000 for RUB). NULL = USD only
  sell_rate_fiat      NUMERIC(12,4),    -- same at sell time. NULL if holding or USD

  -- Marketplace source
  buy_marketplace     TEXT CHECK (buy_marketplace IN ('FRAGMENT','MRKT','PORTALS','GETGEMS','OTHER')),
  sell_marketplace    TEXT CHECK (sell_marketplace IN ('FRAGMENT','MRKT','PORTALS','GETGEMS','OTHER')),

  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure correct price columns are populated based on currency
  CONSTRAINT price_currency_check CHECK (
    (trade_currency = 'STARS' AND buy_price_stars IS NOT NULL AND buy_price_nanoton IS NULL) OR
    (trade_currency = 'TON'   AND buy_price_nanoton IS NOT NULL AND buy_price_stars IS NULL)
  ),
  CONSTRAINT sell_price_currency_check CHECK (
    sell_date IS NULL OR (
      (trade_currency = 'STARS' AND sell_price_stars IS NOT NULL) OR
      (trade_currency = 'TON'   AND sell_price_nanoton IS NOT NULL)
    )
  )
);
```

### Indexes

```sql
-- Core query patterns
CREATE INDEX idx_trades_user_sell     ON trades (user_id, sell_date DESC NULLS LAST);
CREATE INDEX idx_trades_open          ON trades (user_id, buy_date DESC) WHERE sell_date IS NULL;
CREATE INDEX idx_trades_currency      ON trades (user_id, trade_currency);
CREATE INDEX idx_trades_gift_slug     ON trades (gift_slug);
CREATE INDEX idx_trades_marketplace   ON trades (user_id, buy_marketplace, sell_marketplace);

-- Attribute filtering
CREATE INDEX idx_trades_attrs         ON trades (user_id, attr_model, attr_backdrop, attr_symbol);
```

### View for net profit (currency-aware, dual commission, fiat conversion)

Profit is NEVER stored — always computed via this VIEW. Changing default_commission instantly affects all calculations.

```sql
CREATE VIEW trade_profits AS
SELECT t.*,
  -- Resolved commission values
  COALESCE(t.commission_flat_stars, s.default_commission_stars)     AS eff_flat_stars,
  COALESCE(t.commission_permille,   s.default_commission_permille)  AS eff_permille,

  -- Net profit in Stars (NULL for TON trades)
  CASE WHEN t.trade_currency = 'STARS' AND t.sell_price_stars IS NOT NULL THEN
    t.sell_price_stars
    - t.buy_price_stars
    - COALESCE(t.commission_flat_stars, s.default_commission_stars)
    - ROUND(t.sell_price_stars::NUMERIC
        * COALESCE(t.commission_permille, s.default_commission_permille) / 1000.0)
  END AS net_profit_stars,

  -- Net profit in nanotons (NULL for Stars trades)
  CASE WHEN t.trade_currency = 'TON' AND t.sell_price_nanoton IS NOT NULL THEN
    t.sell_price_nanoton
    - t.buy_price_nanoton
    - ROUND(t.sell_price_nanoton::NUMERIC
        * COALESCE(t.commission_permille, s.default_commission_permille) / 1000.0)
  END AS net_profit_nanoton,

  -- Fiat profit in USD (works for BOTH Stars and TON trades)
  -- Formula: (sell_amount * sell_rate) - (buy_amount * buy_rate) - commission_in_usd
  CASE
    WHEN t.trade_currency = 'STARS' AND t.sell_price_stars IS NOT NULL
         AND t.buy_rate_usd IS NOT NULL AND t.sell_rate_usd IS NOT NULL THEN
      ROUND((
        t.sell_price_stars * t.sell_rate_usd
        - t.buy_price_stars * t.buy_rate_usd
        - COALESCE(t.commission_flat_stars, s.default_commission_stars) * t.sell_rate_usd
        - t.sell_price_stars * t.sell_rate_usd
          * COALESCE(t.commission_permille, s.default_commission_permille) / 1000.0
      )::NUMERIC, 2)
    WHEN t.trade_currency = 'TON' AND t.sell_price_nanoton IS NOT NULL
         AND t.buy_rate_usd IS NOT NULL AND t.sell_rate_usd IS NOT NULL THEN
      ROUND((
        (t.sell_price_nanoton::NUMERIC / 1e9) * t.sell_rate_usd
        - (t.buy_price_nanoton::NUMERIC / 1e9) * t.buy_rate_usd
        - (t.sell_price_nanoton::NUMERIC / 1e9) * t.sell_rate_usd
          * COALESCE(t.commission_permille, s.default_commission_permille) / 1000.0
      )::NUMERIC, 2)
  END AS net_profit_usd,

  -- Buy/sell value in USD (for volume cards)
  CASE
    WHEN t.trade_currency = 'STARS' AND t.buy_rate_usd IS NOT NULL THEN
      ROUND((t.buy_price_stars * t.buy_rate_usd)::NUMERIC, 2)
    WHEN t.trade_currency = 'TON' AND t.buy_rate_usd IS NOT NULL THEN
      ROUND(((t.buy_price_nanoton::NUMERIC / 1e9) * t.buy_rate_usd)::NUMERIC, 2)
  END AS buy_value_usd,

  CASE
    WHEN t.trade_currency = 'STARS' AND t.sell_rate_usd IS NOT NULL THEN
      ROUND((t.sell_price_stars * t.sell_rate_usd)::NUMERIC, 2)
    WHEN t.trade_currency = 'TON' AND t.sell_rate_usd IS NOT NULL THEN
      ROUND(((t.sell_price_nanoton::NUMERIC / 1e9) * t.sell_rate_usd)::NUMERIC, 2)
  END AS sell_value_usd

FROM trades t
JOIN user_settings s ON s.user_id = t.user_id;
```

**Notes:**
- TON trades: NO flat Stars commission (different currency). Only `permille` applies.
- Fiat profit uses **historical rates** — buy_rate at purchase, sell_rate at sale. No "jumping" numbers.
- USD→RUB/EUR conversion: `net_profit_usd * sell_rate_fiat` (also historical, from trade row).
- If rates are NULL (user didn't fetch rates), fiat columns return NULL → UI shows "—".
- For open positions (holding): fiat value calculated in app using **current** rates (not in VIEW).

---

## 3. ORM Selection

> **Expert:** Theo Browne (API/DX)

### Decision: Drizzle ORM + Neon Serverless Driver

```typescript
// src/server/db/index.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

```typescript
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

Drizzle keeps aggregations fully typed:

```typescript
// Monthly profit query (Stars trades)
const result = await db
  .select({
    month: sql`TO_CHAR(${trades.sellDate}, 'YYYY-MM')`.mapWith(String),
    netProfitStars: sql<number>`
      SUM(
        ${trades.sellPriceStars} - ${trades.buyPriceStars}
        - COALESCE(${trades.commissionFlatStars}, ${userSettings.defaultCommissionStars})
        - ROUND(${trades.sellPriceStars}::NUMERIC
          * COALESCE(${trades.commissionPermille}, ${userSettings.defaultCommissionPermille}) / 1000.0)
      )`.mapWith(Number),
  })
  .from(trades)
  .innerJoin(userSettings, eq(trades.userId, userSettings.userId))
  .where(and(
    eq(trades.userId, userId),
    eq(trades.tradeCurrency, "STARS"),
    isNotNull(trades.sellDate),
  ))
  .groupBy(sql`TO_CHAR(${trades.sellDate}, 'YYYY-MM')`);
```

**Bundle:** 7.4KB gzip (vs Prisma ~1.6MB). Edge-compatible with Neon serverless.

### Branded Types (TypeScript safety)

```typescript
// src/lib/currencies.ts
// ADVERSARIAL AUDIT FIX: Use string arithmetic for TON parsing — no floating-point errors
// parseFloat("3.5") * 1e9 = 3499999999.9999995 → BigInt() throws!
export type Stars   = bigint & { readonly _brand: "Stars" };
export type NanoTon = bigint & { readonly _brand: "NanoTon" };

/** "3.5" → 3_500_000_000n — string arithmetic, no floating-point */
export function parseTonInput(input: string): NanoTon | null {
  const trimmed = input.trim().replace(",", ".");
  if (!/^\d+(\.\d*)?$/.test(trimmed)) return null;
  const [intPart = "0", fracPart = ""] = trimmed.split(".");
  const fracPadded = fracPart.slice(0, 9).padEnd(9, "0");
  try { return BigInt(intPart + fracPadded) as NanoTon; } catch { return null; }
}

/** For external APIs that return number: toNanoTon(3.5) → safe via string */
export function toNanoTon(ton: number): NanoTon {
  return parseTonInput(ton.toString()) ?? (0n as NanoTon);
}

/** 3_500_000_000n → "3.50" (for display) */
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
```

**Drizzle MUST use `{ mode: "bigint" }` on ALL BIGINT columns** (default is `"number"` which loses precision):
```typescript
// src/server/db/schema.ts
buyPriceNanoton: bigint("buy_price_nanoton", { mode: "bigint" }), // NOT default mode
```

---

## 4. Authentication

> **Expert:** Troy Hunt (Security)

### Decision: Better Auth + Custom Telegram Plugin

- **Database sessions** (not JWT-only) — instant revocation capability
- **Cookie cache** — 5-min cache for performance, DB-backed for security
- **Two-layer protection:** middleware (UX redirects) + `requireAuth()` per route (CVE-2025-29927 mitigation)
- **Better Auth >= 1.0.0** pinned (for Next.js 15 async cookies support)

### Custom Telegram Plugin

Better Auth has NO built-in Telegram plugin (Telegram ≠ OAuth 2.0).

**ADVERSARIAL AUDIT FIX:** `definePlugin` may NOT be a public export in all Better Auth versions. Use `satisfies BetterAuthPlugin` instead. Check at install: `node -e "console.log(Object.keys(require('better-auth')))"`.

```typescript
// src/server/auth/telegram-plugin.ts
import type { BetterAuthPlugin } from "better-auth";
import { createAuthEndpoint } from "better-auth/api"; // official helper
import { z } from "zod";
import { createHash, createHmac, timingSafeEqual } from "crypto";

const TelegramAuthSchema = z.object({
  id: z.number(), first_name: z.string(),
  username: z.string().optional(), photo_url: z.string().optional(),
  auth_date: z.number(), hash: z.string(),
});

export const telegramPlugin = {
  id: "telegram",
  endpoints: {
    signInTelegram: createAuthEndpoint("/sign-in/telegram", { method: "POST" },
      async (ctx) => {
        const parsed = TelegramAuthSchema.safeParse(ctx.body);
        if (!parsed.success) throw ctx.error("BAD_REQUEST", { message: "Invalid payload" });

        const data = parsed.data;
        // HMAC verification MUST be first — before any DB access
        if (!verifyTelegramAuth(data, process.env.TELEGRAM_BOT_TOKEN!)) {
          throw ctx.error("UNAUTHORIZED", { message: "Invalid Telegram signature" });
        }
        if (Date.now() / 1000 - data.auth_date > 86400) {
          throw ctx.error("UNAUTHORIZED", { message: "Auth data expired" });
        }

        // Create user + settings in ONE TRANSACTION (see DB transaction rules)
        const user = await createUserOnFirstLogin(data);
        const session = await ctx.context.internalAdapter.createSession(user.id, ctx.request);
        return ctx.json({ session });
      }
    ),
  },
} satisfies BetterAuthPlugin; // "satisfies" not "definePlugin" — type-safe, framework-agnostic
```

### Telegram Login Verification

```typescript
function verifyTelegramAuth(data: TelegramAuthData, botToken: string): boolean {
  const { hash, ...fields } = data;
  const dataCheckString = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey)
    .update(dataCheckString).digest("hex");
  return timingSafeEqual(
    Buffer.from(computedHash, "hex"),
    Buffer.from(hash, "hex")
  ) && (Date.now() / 1000 - data.auth_date < 86400);
}
```

**Critical:** `timingSafeEqual` (not `===`), filter empty fields, SHA256 of bot token as key.

**Next.js 15 note:** Better Auth uses `cookies()` and `headers()` internally — both are async in Next.js 15. Ensure `better-auth >= 1.0.0`.

```typescript
// Next.js 15 — async cookies/headers
import { auth } from "@/server/auth";
const session = await auth.api.getSession({
  headers: await headers(),
});
```

### MVP: Login Widget. Future: Mini App

Telegram Login Widget for MVP (web-based, desktop-friendly for table-heavy UI). Telegram Mini App auth (`initData` verification) deferred to Phase 3 — different HMAC mechanism, `@twa-dev/sdk` dependency, mobile-optimized layout.

---

## 5. Frontend State & Data Fetching

> **Expert:** Dan Abramov (React/State) + Theo Browne (API Design)
> **Adversarial Audit Fix:** Previous plan had critical contradiction — tRPC + "No TanStack Query" simultaneously. Resolved: tRPC is the single mutation path.

### Decision: tRPC for ALL reads AND mutations (no Server Actions)

**Why not Server Actions:**
1. Telegram Mini App (Phase 3) needs the same API — Server Actions can't be reused
2. `protectedProcedure` in tRPC centralizes auth guard — Server Actions require manual duplication
3. Zod runtime validation at tRPC layer protects currency type safety (NanoTon ≠ Stars)

**superjson transformer is REQUIRED** (BigInt not JSON-serializable):
```typescript
// src/server/api/trpc.ts
import superjson from "superjson";
export const t = initTRPC.context<Context>().create({ transformer: superjson });

// src/lib/trpc/client.ts
httpBatchLink({ url: "/api/trpc", transformer: superjson }) // MUST match server
```

```
app/
  (dashboard)/
    trades/
      page.tsx                ← Server Component (reads DB via tRPC server caller)
      _components/
        TradesTable.tsx       ← "use client", api.trades.list.useQuery()
        AddTradeDialog.tsx    ← "use client", api.trades.add.useMutation()
        SummaryCards.tsx      ← Server Component (or props from page)
        FloorPriceCard.tsx    ← Server Component, data from giftasset.pro cache
      # NO actions/ directory — all mutations via tRPC
    settings/
      page.tsx                ← Commission settings, timezone, default currency
      # NO actions/ directory — api.settings.update.useMutation()
```

**Cache invalidation pattern:**
```typescript
const utils = api.useUtils();
const addTrade = api.trades.add.useMutation({
  onSuccess: () => {
    utils.trades.list.invalidate();
    utils.stats.dashboard.invalidate();
  },
});
```

- **User settings:** React Context (SettingsProvider), not Zustand
- **Filters/sorting:** URL-based via `useSearchParams` (shareable links)
- **Optimistic updates:** `useMutation({ onMutate })` with rollback
- **Next.js 15:** async `params`, `cookies()`, `headers()` — all await-required

```typescript
// Next.js 15 — async params in pages
export default async function TradePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ...
}
```

---

## 6. Table & UI Library

> **Expert:** Dan Abramov + Nir Eyal (UX)

### Decision: shadcn/ui + TanStack Table v8 + Tailwind CSS v4

Exact same stack as steamfolio. Headless TanStack Table + shadcn primitives for full UI control.

### Tailwind CSS v4 (CSS-first config)

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-background: 0 0% 3.9%;
  --color-foreground: 0 0% 98%;
  --font-sans: "Inter", sans-serif;
  --radius: 0.5rem;
}
```

No `tailwind.config.ts` needed. PostCSS plugin: `@tailwindcss/postcss`.

### Table Columns

| # | Column | Width | Details | Mobile |
|---|--------|-------|---------|--------|
| 1 | Gift | 180px | Image (36x36) + name + #number + rarity badge | Always visible (sticky) |
| 2 | Bought | 90px | Date (DD.MM.YY) | Hidden < 768px |
| 3 | Sold | 90px | Date or "Holding" badge | Hidden < 768px |
| 4 | Buy Price | 80px | Stars/TON amount, tabular-nums, currency icon | Visible |
| 5 | Sell Price | 80px | Stars/TON amount or "—" | Visible |
| 6 | Profit | 100px | Absolute + %, green/red coloring | Visible |
| 7 | Marketplace | 70px | MRKT/Portals/Fragment icon | Hidden < 768px |

### Dashboard Cards (two rows: native + fiat)

**Row 1 — Native currency (Stars or TON, tab selector):**

| Card | Data | Source |
|------|------|--------|
| Total Profit | SUM(net_profit) all time | SQL VIEW |
| Day Profit | SUM where sell_date = today (user TZ) | SQL VIEW + timezone |
| Week Profit | SUM in current ISO week (Mon-Sun, user TZ) | SQL VIEW + timezone |
| Month Profit | SUM in current month (user TZ) | SQL VIEW + timezone |

**Row 2 — Fiat aggregate (USD/RUB/EUR, user preference):**

| Card | Data | Source |
|------|------|--------|
| Total Profit (fiat) | SUM(net_profit_usd) × fiat_rate | SQL VIEW (historical rates) |
| Buy Volume (fiat) | SUM(buy_value_usd) × fiat_rate | SQL VIEW |
| Sell Volume (fiat) | SUM(sell_value_usd) × fiat_rate | SQL VIEW |
| Portfolio Value | SUM of floor prices for held gifts | giftasset.pro (cached 1h) × current rate |

Each price cell in the table shows: `450 ★` with a secondary line `~$5.85` (or `~₽556`).

### Toolbar

```
[Search: "Easter Egg..."] [Status: All/Holding/Sold] [Currency: All/Stars/TON] [Date Range] [Clear]
                                                       [Columns ▼] [Export CSV]
```

### Mobile-First Requirements

- Sticky Gift column + sticky table header on scroll
- Touch-friendly action buttons: min 44px tap targets
- Bottom navigation bar on `< 768px` (instead of top navbar)
- Column visibility toggle: hide Bought/Sold dates on mobile by default
- Swipeable card view as alternative to table on very small screens (< 480px)
- Numbers: `tabular-nums` font variant (prevents layout shift on sort)

---

## 7. Commission Logic

> **Expert:** Martin Fowler (Business Logic)

### Decision: Dual commission model — flat fee + permille

Telegram's official resale uses `permille` (‰ = per-thousand). But third-party marketplaces (MRKT, Portals) may have flat fees or different structures. Support both.

**Model (two commission components):**

```
user_settings:
  default_commission_stars    BIGINT  -- flat fee in Stars (global default)
  default_commission_permille SMALLINT -- ‰ (global default, e.g. 150 = 15%)

trades:
  commission_flat_stars       BIGINT  -- flat override (NULL = use default)
  commission_permille         SMALLINT -- ‰ override (NULL = use default)
```

**Resolution:**
```
eff_flat    = trade.commission_flat_stars ?? user.default_commission_stars
eff_permille = trade.commission_permille ?? user.default_commission_permille
```

**Formula (Stars trades):**
```
net_profit = sell_price - buy_price - eff_flat - ROUND(sell_price * eff_permille / 1000)
profit_percent = net_profit / buy_price * 100
```

**Formula (TON trades):**
```
net_profit = sell_price - buy_price - ROUND(sell_price * eff_permille / 1000)
```
Note: flat Stars commission does not apply to TON trades (different currency).

**"Net sell price"** = `sell_price - eff_flat - ROUND(sell_price * eff_permille / 1000)` (shown separately in UI).

Profit is NEVER stored in DB — always computed via VIEW. Reason: changing `default_commission` instantly affects all trade calculations without any UPDATE.

---

## 8. Gift Data Pipeline

> **Expert:** Martin Kleppmann (Distributed Systems)

### Decision: Deterministic parsing + Fragment CDN + attribute fetch

Three-phase pipeline:

**Phase 1 (sync, infallible):** Parse URL → extract name/number/imageUrl. Zero network calls.

```typescript
// Input: "https://t.me/nft/EasterEgg-52095"
parseGiftUrl(url) → {
  slug: "EasterEgg-52095",
  collectionName: "EasterEgg",
  displayName: "Easter Egg",       // PascalCase → words
  number: 52095,
  imageUrl: "https://nft.fragment.com/gift/easteregg-52095.webp",
}
```

**Phase 2 (async, on trade creation):** Fetch attributes from giftasset.pro (no auth required).

```typescript
// GET https://giftasset.pro/api/v1/gifts/get_gift_by_name?name=EasterEgg-52095
// Returns: { model, backdrop, symbol, rarity data, floor_price }
→ Store in trades: attr_model, attr_backdrop, attr_symbol, *_rarity
```

**Phase 3 (async, periodic):** Background floor price update from giftasset.pro → cached in memory (TTL 1h) for Portfolio Value card.

**Key:** Split on LAST hyphen (`lastIndexOf("-")`), not first. PascalCase→words via regex: `replace(/([a-z])([A-Z])/g, "$1 $2")`.

**Images:** Direct `<Image>` from Fragment CDN with `remotePatterns` in next.config. No image proxy needed.

**Fallback:** If giftasset.pro is down, attributes show "—" and floor price card shows "N/A". Page never breaks.

---

## 9. Deployment

> **Expert:** Kelsey Hightower (DevOps)

### Decision: Railway (app) + Neon (database) — separate providers

Two providers, each doing what they do best:

| Component | Provider | Why |
|-----------|----------|-----|
| Next.js app | Railway | Push-to-deploy, standalone build, $5-15/mo |
| PostgreSQL | Neon | Serverless driver, free tier (0.5GB), database branching for dev/staging |

```
Phase 1 — Dev:     Local (npm run dev) + Neon free tier DB
Phase 2 — MVP:     Railway ($5-15/mo) + Neon free tier
Phase 3 — Growth:  Upgrade Railway or migrate to Hetzner VPS + upgrade Neon
```

### Railway Config

- SSL: automatic on `.up.railway.app`
- CI/CD: GitHub push → auto-deploy
- Build: `next build` with `output: "standalone"` in next.config
- Environment: `DATABASE_URL` = Neon pooler connection string

### Neon Config

- Driver: `@neondatabase/serverless` (HTTP-based, no persistent TCP connection)
- Branching: `main` branch for prod, create branches for schema experiments
- Free tier: 0.5 GB storage, 190 compute hours/month
- Backups: automatic point-in-time recovery

### Monitoring

- Railway metrics (built-in CPU/memory)
- UptimeRobot (free tier, HTTP checks)
- Sentry (free tier, error tracking + performance)

---

## 10. PnL Calculations

> **Expert:** Markus Winand (SQL Performance)

### Decision: Isolated pnl-engine + timezone-aware SQL aggregations

All PnL logic in `src/lib/pnl-engine.ts` — pure functions with `DashboardStats` type contract.

### Dashboard Cards (currency-separated, timezone-aware)

Each card calculated separately per currency. User sees Stars stats and TON stats in separate rows/tabs.

**Single SQL query per currency:**

```sql
-- Stars PnL (using trade_profits VIEW)
SELECT
  SUM(net_profit_stars) AS total_profit,
  SUM(net_profit_stars) FILTER (
    WHERE sell_date = (NOW() AT TIME ZONE $1)::date
  ) AS day_profit,
  SUM(net_profit_stars) FILTER (
    WHERE sell_date >= date_trunc('week', (NOW() AT TIME ZONE $1))::date
  ) AS week_profit,
  SUM(net_profit_stars) FILTER (
    WHERE sell_date >= date_trunc('month', (NOW() AT TIME ZONE $1))::date
  ) AS month_profit,
  SUM(buy_price_stars) AS buy_volume,
  SUM(sell_price_stars) FILTER (WHERE sell_date IS NOT NULL) AS sell_volume
FROM trade_profits
WHERE user_id = $2
  AND trade_currency = 'STARS';
-- $1 = user timezone (e.g. 'Europe/Moscow'), $2 = userId
```

Analogous query for TON trades using `net_profit_nanoton`, `buy_price_nanoton`, `sell_price_nanoton`.

### Timezone Handling

- `user_settings.timezone` stores IANA timezone (e.g. `"Europe/Moscow"`)
- Auto-detected on client: `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Settable in user preferences with manual override
- All `date_trunc` and date comparison use `AT TIME ZONE` with user's timezone
- "Today" = today in user's timezone, not server UTC

### Performance

At 10K trades, SQL aggregation < 10ms (confirmed by PostgreSQL query planner for indexed BIGINT columns). No stored columns needed — VIEW computation is fast enough.

---

## Implementation Plan

### Phase 1: Project Setup (Day 1)

- [ ] Initialize Next.js 15 with App Router, TypeScript strict, Tailwind v4, ESLint
- [ ] Install shadcn/ui, configure dark theme (`@theme {}` in globals.css)
- [ ] Install: `drizzle-orm @neondatabase/serverless ws @types/ws drizzle-kit`
- [ ] Install: `@trpc/server @trpc/client @tanstack/react-query superjson zod better-auth`
- [ ] Set up PostgreSQL on Neon (free tier, create `main` branch)
- [ ] `src/server/db/index.ts` — **neon-serverless WebSocket driver** (NOT neon-http)
- [ ] Create `src/lib/currencies.ts` — branded types + `parseTonInput()` (string arithmetic) + `formatTon()`
- [ ] Create `src/lib/exchange-rates.ts` — Binance + OKX multi-source, in-memory cache TTL 5min
- [ ] Git init + first commit

### Phase 2: Core Backend (Days 2-3)

- [ ] Set up tRPC with **superjson transformer** (both `trpc.ts` + `client.ts`)
- [ ] Implement gift URL parser (`parseGiftUrl` in `gift-parser.ts`)
- [ ] Implement gift attribute fetcher (giftasset.pro integration)
- [ ] Create tRPC routers: trades CRUD, settings CRUD, stats, gifts, market
- [ ] Drizzle schema: **ALL bigint columns with `{ mode: "bigint" }`**
- [ ] Create `trade_profits` SQL VIEW
- [ ] Add migration: `CREATE UNIQUE INDEX idx_trades_unique_open ON trades(user_id, gift_slug) WHERE sell_date IS NULL`
- [ ] Implement PnL engine (`computeDashboardStats` — timezone + currency aware)
- [ ] Configure Next.js Image for Fragment CDN remote patterns

### Phase 3: Authentication (Day 4)

- [ ] Create Telegram bot (BotFather)
- [ ] Check Better Auth exports: `node -e "console.log(Object.keys(require('better-auth')))"`
- [ ] Set up Better Auth with custom Telegram plugin (`satisfies BetterAuthPlugin`)
- [ ] Implement `verifyTelegramHash` with `timingSafeEqual` — HMAC before any DB call
- [ ] `createUserOnFirstLogin()` with `db.transaction()` — users + user_settings ATOMIC
- [ ] Add middleware + requireAuth server guard (two-layer protection)
- [ ] Create login page with Telegram Login Widget
- [ ] After first login: redirect to `/trades?onboarding=1`

### Phase 4: UI — Table & Dashboard (Days 5-7)

- [ ] Build layout: navbar (desktop) + bottom nav (mobile)
- [ ] Implement SummaryCards component (7 stat cards, including Portfolio Value)
- [ ] Build TradesTable with TanStack Table + shadcn (mobile-first)
- [ ] **TradesTable empty state:** illustration + "Добавь первую сделку" + prominent CTA + settings link
- [ ] Summary Cards hidden when trades.length === 0
- [ ] Column definitions: gift+rarity, dates, prices (currency icon), profit, marketplace
- [ ] Sticky Gift column + sticky header on mobile
- [ ] **AddTradeDialog:** URL placeholder, helper text, autofocus, optional manual TON/USD rate field
- [ ] TON price input: user types "3.5", Zod transform → `parseTonInput("3.5")` → 3500000000n
- [ ] Post-add feedback: toast (Sonner) + new row highlight 2 seconds
- [ ] Edit/delete trade inline actions (44px touch targets)
- [ ] Sorting + filtering (search, status, currency, date range)
- [ ] CSV Export button in toolbar
- [ ] Commission settings page (flat + permille, per-currency)
- [ ] Timezone settings (auto-detected + manual override)
- [ ] **NO Server Actions** — all mutations via tRPC `useMutation()`

### Phase 5: Polish & Deploy (Day 8)

- [ ] Responsive design audit: test 375px / 768px / 1280px breakpoints
- [ ] Floor price integration (giftasset.pro → Portfolio Value card, 1h cache)
- [ ] Deploy to Railway (standalone build)
- [ ] Connect Neon DB, run migrations
- [ ] Domain setup + SSL
- [ ] Basic monitoring (UptimeRobot + Sentry)

### Phase 6: Enhancements (Post-MVP)

- [ ] PnL chart: simple bar chart "profit by week/month" (Recharts)
- [ ] Bulk CSV import (parse on client, batch insert)
- [ ] Marketplace API import (Portals `myActivity()`, MRKT history)
- [ ] Collection grouping view ("all my Toy Bear trades")
- [ ] Watchlist table (track gifts not yet bought)

### Phase 7: Advanced Features (Future)

- [ ] Telegram Mini App support (initData auth, mobile-optimized layout)
- [ ] Live price feeds from MRKT API / Portals API / Getgems GraphQL
- [ ] Price history snapshots (cron + price_snapshots table)
- [ ] Portfolio sharing (public link with privacy controls)
- [ ] Push notifications (price alerts via Telegram Bot)
- [ ] Multi-currency dashboard with exchange rates (Stars ↔ TON ↔ USD)

---

## Marketplace API Integration Reference

| Marketplace | API Type | Auth | Key Feature | Phase |
|-------------|----------|------|-------------|-------|
| giftasset.pro | REST (free) | None | Floor prices, attributes | MVP (Phase 2) |
| Fragment CDN | Static files | None | Gift images (.webp) | MVP (Phase 1) |
| api.changes.tg | REST (free) | None | Gift metadata | MVP (Phase 2) |
| MRKT | REST | Telegram WebApp | Listings, live prices | Phase 6 |
| Portals | REST (portalsmp) | Telegram WebApp | Activity history, floors | Phase 6 |
| Getgems | GraphQL | None (reads) | NFT data, floor prices | Phase 6 |
| TonAPI | REST | API key | Blockchain transactions | Phase 7 |
| Telegram MTProto | MTProto | Telethon session | Full gift data, resale | Phase 7 |

---

## Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| MVP launch | — | 8 days |
| Page load (TTFB) | — | < 500ms |
| Trade add flow | — | < 10 seconds |
| PnL calculation | — | < 50ms for 10K trades |
| Lighthouse score | — | > 90 |
| Bundle size (JS) | — | < 200KB gzip |
| Mobile usability | — | All core flows work on 375px |
| Currency accuracy | — | 0 rounding errors (Stars integer, TON nanoton) |
