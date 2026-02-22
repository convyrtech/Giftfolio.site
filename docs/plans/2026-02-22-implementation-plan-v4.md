# GIFTSSITE — Implementation Plan v4 (Final)

> **Status:** Ready for implementation
> **Date:** 2026-02-22
> **Based on:** Architecture (02-19) + Adversarial Audit (02-20) + Two review passes (02-21, 02-22)
> **Goal:** Full build plan with file-level detail. Each phase is self-contained and deployable.

---

## Phase 1: Project Scaffold + Tooling (Day 1)

Everything needed to write code, run `npm run dev`, and have CI catch mistakes.

### 1.1 — Create Next.js project

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir \
  --import-alias "@/*" --turbopack --use-npm
```

- TypeScript strict mode (`strict: true` in tsconfig)
- Tailwind CSS v4 (CSS-first, no tailwind.config.ts)
- App Router + `src/` directory

> **Compatibility check:** Before proceeding, verify shadcn/ui works with Tailwind v4 CSS-first config. If issues — fallback to Tailwind v3 + `tailwind.config.ts`. Decision takes 5 minutes.

### 1.2 — ESLint + Prettier (strict, unified)

**Install:**
```bash
npm install -D prettier eslint-config-prettier eslint-plugin-prettier \
  @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

**ESLint config** (flat config `eslint.config.mjs`):
- Extends: `next/core-web-vitals`, `next/typescript`, `prettier`
- Rules: `no-explicit-any: error`, `no-unused-vars: error`, `prefer-const: error`
- TypeScript strict: `@typescript-eslint/strict-type-checked`

**Prettier config** (`.prettierrc`):
```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100
}
```

**Scripts** (package.json):
```json
"lint": "next lint",
"format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
"format:check": "prettier --check \"src/**/*.{ts,tsx,css}\"",
"typecheck": "tsc --noEmit",
"test": "vitest run",
"test:watch": "vitest"
```

### 1.3 — Environment validation (@t3-oss/env-nextjs)

**Install:**
```bash
npm install @t3-oss/env-nextjs zod
```

**Create `src/env.ts`:**
```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // Rate limiting (optional — in-memory Map fallback in dev)
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    // Monitoring (optional, Phase 5)
    SENTRY_DSN: z.string().url().optional(),
  },
  client: {
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url(), // CSRF Origin check
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
});
```

**Create `.env.example`** (committed, no secrets):
```
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
BETTER_AUTH_SECRET=your-secret-at-least-32-chars-long
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=YourBotName
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Optional for dev (in-memory fallback used):
# UPSTASH_REDIS_REST_URL=https://...
# UPSTASH_REDIS_REST_TOKEN=...
# SENTRY_DSN=https://...@sentry.io/...
```

Build fails if required variables are missing or invalid.

### 1.4 — Testing setup (Vitest)

**Install:**
```bash
npm install -D vitest @vitejs/plugin-react
```

**Create `vitest.config.ts`:**
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: { globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

**Write tests for pure functions immediately after creating them:**
- `src/lib/__tests__/currencies.test.ts` — parseTonInput, formatTon, parseStarsInput, formatStars, toNanoTon, edge cases
- `src/lib/__tests__/gift-parser.test.ts` — parseGiftUrl for normal slugs, multi-hyphen edge cases, invalid URLs, URL variants
- `src/lib/__tests__/formatters.test.ts` — formatDate, formatNumber, locale edge cases

These are pure functions with zero dependencies — trivial to test, critical to get right.

### 1.5 — CI/CD (GitHub Actions)

**Create `.github/workflows/ci.yml`:**
```yaml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test
      - run: npm run format:check
```

Every PR blocked if lint/types/tests fail.

### 1.6 — shadcn/ui + dark theme

```bash
npx shadcn@latest init
```

- Style: Default, Base color: Zinc (dark), CSS variables: Yes
- Dark theme as default in globals.css

Install base components:
```bash
npx shadcn@latest add button dialog drawer input label table card \
  toast sonner alert-dialog select tabs badge separator
```

Note: `drawer` for mobile trade forms, `alert-dialog` for delete confirmation.

### 1.7 — Core dependencies

```bash
# Database
npm install drizzle-orm @neondatabase/serverless ws
npm install -D drizzle-kit @types/ws

# tRPC + React Query
npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query superjson

# Auth
npm install better-auth

# Table
npm install @tanstack/react-table

# Rate limiting
npm install @upstash/ratelimit @upstash/redis
```

### 1.8 — Drizzle config

**Create `drizzle.config.ts`:**
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

**Create `src/server/db/index.ts`** — WebSocket driver (NOT neon-http):
```typescript
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";
import { env } from "@/env";

neonConfig.webSocketConstructor = ws; // Required for Node.js (Railway)
const pool = new Pool({ connectionString: env.DATABASE_URL });
export const db = drizzle(pool, { schema });
```

> **Fallback:** If `ws` fails on Railway standalone build, switch to `@neondatabase/serverless` HTTP driver. Lose transactions but app stays alive. Only user creation + bulk import need transactions.

### 1.9 — tRPC scaffold (with superjson + rate limiting + 401 handler)

**Create `src/server/api/trpc.ts`:**
- initTRPC with `superjson` transformer
- `protectedProcedure`: auth check + rate limit middleware (60 req/min/user)
- Rate limit: Upstash Redis if env vars present, in-memory Map fallback for dev

**Create `src/server/api/root.ts`** — app router (empty routers, stubs).

**Create `src/lib/trpc/client.ts`:**
- Client provider with superjson (must match server)
- Global 401 handler: session expired → toast + redirect to `/login`

```typescript
// Global error handler in QueryClient:
queryCache: new QueryCache({
  onError: (error) => {
    if (error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED") {
      toast.error("Сессия истекла, войдите снова");
      window.location.href = "/login";
    }
  },
}),
```

**Create `src/lib/trpc/server.ts`** — server caller for RSC pages.

**Create `src/app/api/trpc/[trpc]/route.ts`** — Next.js route handler.

### 1.10 — Utility modules

**Create `src/lib/currencies.ts`:**
- Branded types: `Stars`, `NanoTon`
- `parseTonInput()` — string arithmetic, no floats
- `formatTon()`, `formatStars()`, `parseStarsInput()`
- `toNanoTon()` — for external APIs

**Create `src/lib/exchange-rates.ts`:**
- `getTonUsdRate()` — Binance primary + OKX fallback via `Promise.any`
- In-memory cache, TTL 5 min, stale-while-revalidate on failure
- `STARS_USD_RATE = 0.013` (fixed)
- After Railway restart: first request cold (~100ms), never blocks trade creation (rate is nullable)

**Create `src/lib/gift-parser.ts`:**
- `parseGiftUrl()` — deterministic URL parsing, zero network calls
- Split on LAST hyphen (`lastIndexOf("-")`), PascalCase → display name
- Returns `null` for invalid URLs (not throw)

**Create `src/lib/formatters.ts`:**
```typescript
// Date formatting: DD.MM.YY (Russian standard)
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit", month: "2-digit", year: "2-digit",
  }).format(new Date(date));
}

// Number formatting: 1 234 567 (space separator, Russian standard)
export function formatNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

// Currency display conventions:
// Stars: "1 234 ★" (space separator, star symbol)
// TON: "3.50 TON" (dot decimal — crypto convention, NOT Russian comma)
// USD: "$12.34" (dot decimal, dollar sign prefix)
```

**Create `src/lib/utils.ts`:**
- `cn()` — classnames utility (shadcn standard)

### 1.11 — next.config.ts

- `output: "standalone"` (for Railway)
- `images.remotePatterns`: `nft.fragment.com` (gift images)
- `serverExternalPackages: ["ws"]`

### 1.12 — Git init + first commit

```bash
git init && git add -A && git commit -m "Phase 1: project scaffold"
```

### Phase 1 — Files created

| File | Purpose |
|------|---------|
| `src/env.ts` | Env validation (Zod + @t3-oss), all required + optional vars |
| `.env.example` | Template with all variables documented |
| `.prettierrc` | Prettier config |
| `vitest.config.ts` | Test config |
| `.github/workflows/ci.yml` | CI pipeline (lint + typecheck + test + format) |
| `drizzle.config.ts` | Drizzle Kit config |
| `src/server/db/index.ts` | Drizzle + Neon WebSocket |
| `src/server/db/schema.ts` | Stub (filled in Phase 2) |
| `src/server/api/trpc.ts` | tRPC init + superjson + rate limit |
| `src/server/api/root.ts` | tRPC app router |
| `src/lib/trpc/client.ts` | tRPC React provider + global 401 handler |
| `src/lib/trpc/server.ts` | tRPC server caller (RSC) |
| `src/app/api/trpc/[trpc]/route.ts` | tRPC HTTP handler |
| `src/lib/currencies.ts` | Stars/NanoTon branded types |
| `src/lib/__tests__/currencies.test.ts` | Unit tests for currencies |
| `src/lib/exchange-rates.ts` | TON/USD multi-source fetcher |
| `src/lib/gift-parser.ts` | Gift URL parser |
| `src/lib/__tests__/gift-parser.test.ts` | Unit tests for parser |
| `src/lib/formatters.ts` | Date/number formatting (ru-RU locale) |
| `src/lib/__tests__/formatters.test.ts` | Unit tests for formatters |
| `src/lib/utils.ts` | cn() utility |
| `next.config.ts` | standalone + images |

### Phase 1 — Verification

- [ ] `npm run dev` starts without errors
- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` — all currency + parser + formatter tests green
- [ ] `npm run build` fails if `.env` is missing (env validation works)
- [ ] CI pipeline runs on push

---

## Phase 2: Database Schema + tRPC Routers (Days 2-3)

Full backend: schema, VIEW, indexes, all CRUD routers with pagination and soft delete.

### 2.1 — Drizzle schema (`src/server/db/schema.ts`)

Three tables:

**`users`** — telegram_id, username, first_name, photo_url

**`userSettings`:**
- `default_commission_stars` BIGINT — flat fee in Stars
- `default_commission_permille` SMALLINT — permille (‰)
- `default_currency` TEXT — 'STARS' or 'TON'
- `timezone` TEXT — IANA timezone (e.g. "Europe/Moscow")
- No `display_fiat_currency` — MVP is USD only

**`trades`:**
- Full trade data with bigint mode, CHECK constraints
- `deleted_at TIMESTAMPTZ` — NULL = active, non-NULL = soft-deleted
- `buy_marketplace` and `sell_marketplace` — two separate columns
- `buy_rate_usd` and `sell_rate_usd` — historical USD rates locked at trade time
- No `buy_rate_fiat` / `sell_rate_fiat` — MVP is USD only

**Critical rules:**
- ALL bigint columns: `{ mode: "bigint" }`
- CHECK constraints: `price_currency_check`, `sell_price_currency_check`
- `trade_currency` enum: `'STARS' | 'TON'`
- All queries filter `WHERE deleted_at IS NULL` by default

### 2.2 — Commission lock on trade creation

When creating a trade, copy current commission defaults into the trade row:

```typescript
// In trades.add procedure:
const settings = await db.query.userSettings.findFirst({ where: eq(userId) });
await db.insert(trades).values({
  ...input,
  // Lock commission at creation time — prevents retroactive PnL changes
  commissionFlatStars: input.commissionFlatStars ?? settings.defaultCommissionStars,
  commissionPermille: input.commissionPermille ?? settings.defaultCommissionPermille,
});
```

**Why:** Changing default commission in settings does NOT retroactively change historical PnL. "Прибыль за январь" stays stable even if commission is changed in February.

### 2.3 — USD rate saved at trade time

```
trades.add:
  1. Parse gift URL (sync)
  2. Fetch current rate: getTonUsdRate() or STARS_USD_RATE
  3. INSERT trade with buy_rate_usd = fetched rate
  4. If fetch failed → buy_rate_usd = NULL → UI shows "—" for USD column

trades.update (close position / add sell):
  1. Fetch current rate
  2. UPDATE trade SET sell_rate_usd = fetched rate, sell_price = ..., sell_date = ...
  3. If fetch failed → sell_rate_usd = NULL
```

USD profit is always from **historical** rates locked per trade. No retroactive recalculation.

### 2.4 — Push schema + custom migration

```bash
npx drizzle-kit push
npx drizzle-kit generate
```

**Manual SQL migration:**
```sql
-- Prevent duplicate open positions for same gift per user.
-- deleted_at IS NULL is CRITICAL: without it, a user cannot reopen
-- a position on a gift after soft-deleting a previous open trade.
CREATE UNIQUE INDEX idx_trades_unique_open_position
  ON trades (user_id, gift_slug)
  WHERE sell_date IS NULL AND deleted_at IS NULL;

-- Exclude deleted trades from main query index
CREATE INDEX idx_trades_user_active
  ON trades (user_id, sell_date DESC NULLS LAST)
  WHERE deleted_at IS NULL;
```

### 2.5 — SQL VIEW `trade_profits`

Created via raw SQL migration (Drizzle doesn't support CREATE VIEW):
- `net_profit_stars`, `net_profit_nanoton`, `net_profit_usd`
- `buy_value_usd`, `sell_value_usd`
- **Filters `WHERE deleted_at IS NULL`** — soft-deleted trades excluded from all PnL
- Commission reads directly from trade row (locked at creation, no COALESCE needed)
- USD profit uses historical `buy_rate_usd` / `sell_rate_usd` from trade row

### 2.6 — tRPC routers

| Router | Procedures | Notes |
|--------|-----------|-------|
| `trades` | `list`, `add`, `update`, `softDelete`, `restore`, `getById` | Cursor pagination on list, soft delete, Zod validation |
| `stats` | `dashboard` | Single SQL per currency, timezone-aware |
| `gifts` | `parseUrl`, `fetchAttributes`, `fetchFloorPrice` | giftasset.pro integration |
| `market` | `floorPrices` | Cached 1h in-memory, rate limited |
| `settings` | `get`, `update` | Commission, timezone, default currency |

All routers use `protectedProcedure` (auth + rate limit).

**Pagination on `trades.list`:**
```typescript
// Input
{ cursor?: string; limit?: number; /* default 50, max 200 */ filters: {...} }
// Output
{ items: Trade[]; nextCursor: string | null; }
```

Cursor-based (by `id` DESC) — stable under concurrent inserts.

### 2.7 — PnL engine (`src/lib/pnl-engine.ts`)

Pure functions for dashboard stat calculations + unit tests.

**Create `src/lib/__tests__/pnl-engine.test.ts`:**
- Stars profit calculation (flat + permille)
- TON profit calculation (permille only)
- Edge cases: zero commission, max permille (1000 = 100%)
- Null handling (missing rates, unsold trades)

### 2.8 — Health check endpoint

**Create `src/app/api/health/route.ts`:**
```typescript
// GET /api/health → { status: "ok", db: "connected" }
// Checks: DB connection via simple SELECT 1
// Used by: Railway health checks, UptimeRobot
```

### Phase 2 — Files created/modified

| File | Action |
|------|--------|
| `src/server/db/schema.ts` | FILL — full schema with `deleted_at`, no fiat columns |
| `drizzle/0001_*.sql` | Generated migration |
| `drizzle/custom/view.sql` | trade_profits VIEW + indexes |
| `src/server/api/routers/trades.ts` | CREATE — CRUD + pagination + soft delete + rate lock |
| `src/server/api/routers/stats.ts` | CREATE |
| `src/server/api/routers/gifts.ts` | CREATE |
| `src/server/api/routers/market.ts` | CREATE |
| `src/server/api/routers/settings.ts` | CREATE |
| `src/server/api/root.ts` | UPDATE — register routers |
| `src/lib/pnl-engine.ts` | CREATE |
| `src/lib/__tests__/pnl-engine.test.ts` | CREATE |
| `src/app/api/health/route.ts` | CREATE |

### Phase 2 — Verification

- [ ] `npx drizzle-kit push` succeeds on Neon
- [ ] VIEW `trade_profits` returns correct columns
- [ ] `npm run test` — pnl-engine tests green
- [ ] trades.list returns paginated results (cursor works)
- [ ] trades.add locks commission + USD rate from current values
- [ ] Soft delete: trade disappears from list, stats update, can restore
- [ ] Partial unique index: duplicate open trade → error
- [ ] `/api/health` returns 200 with DB status

---

## Phase 3: Authentication (Day 4)

Telegram Login Widget → Better Auth → session → protected routes → CSRF protection.

### 3.1 — Check Better Auth API

```bash
node -e "console.log(Object.keys(require('better-auth')))"
```

Verify `BetterAuthPlugin` type exists. Use `satisfies`, not `definePlugin`.

### 3.2 — Telegram plugin (`src/server/auth/telegram-plugin.ts`)

- `verifyTelegramAuth()` — HMAC-SHA256 + `timingSafeEqual`
- Filter empty fields before hash computation
- `auth_date` expiry check (24h)
- `createUserOnFirstLogin()` — `db.transaction()` for users + user_settings (atomic)
- **Timezone from client:** server receives `timezone` field from auth request, stores in user_settings

### 3.3 — Better Auth config (`src/server/auth/index.ts`)

- Database adapter: Drizzle + Neon
- Session: httpOnly cookie, 7-day expiry, 5-min cache
- Plugin: custom `telegramPlugin`

### 3.4 — Auth API route

`src/app/api/auth/[...all]/route.ts` — Better Auth catch-all handler.

### 3.5 — CSRF protection

Better Auth uses `SameSite=lax` cookies by default. Additional measure:
- **Origin header check** in tRPC middleware: reject requests where `Origin` doesn't match `env.NEXT_PUBLIC_APP_URL`

```typescript
// In tRPC middleware:
if (req.headers.get("origin") !== env.NEXT_PUBLIC_APP_URL) {
  throw new TRPCError({ code: "FORBIDDEN" });
}
```

### 3.6 — Middleware (`src/middleware.ts`)

- Redirect unauthenticated users to `/login`
- Protect `/(dashboard)/*` routes
- **UX-only** — real security is `protectedProcedure` in tRPC

### 3.7 — Login page (`src/app/(auth)/login/page.tsx`)

- Telegram Login Widget (script embed)
- Dark theme, centered layout
- **Fallback** if widget fails to load: "Виджет не загрузился. Попробуйте другой браузер или отключите блокировщик рекламы."
- **Timezone detection:** client reads `Intl.DateTimeFormat().resolvedOptions().timeZone` and sends with auth request
- Redirect to `/trades?onboarding=1` on first login

### 3.8 — Auth provider (`src/components/providers/auth-provider.tsx`)

React context for session state on client.

### Phase 3 — Files created

| File | Action |
|------|--------|
| `src/server/auth/index.ts` | CREATE |
| `src/server/auth/telegram-plugin.ts` | CREATE |
| `src/app/api/auth/[...all]/route.ts` | CREATE |
| `src/middleware.ts` | CREATE |
| `src/app/(auth)/login/page.tsx` | CREATE |
| `src/components/providers/auth-provider.tsx` | CREATE |
| `src/server/api/trpc.ts` | UPDATE — add real auth + CSRF check to protectedProcedure |

### Phase 3 — Verification

- [ ] Telegram Login Widget renders on `/login`
- [ ] Widget failure → fallback text shown
- [ ] Login creates user + user_settings atomically (check DB)
- [ ] user_settings.timezone populated from client
- [ ] Unauthenticated → redirect to `/login`
- [ ] `protectedProcedure` rejects unauthenticated tRPC calls
- [ ] Cross-origin tRPC request → rejected (CSRF)
- [ ] Session cookie: httpOnly, secure, sameSite=lax

---

## Phase 4: UI — Table & Dashboard (Days 5-7)

The main product surface. Table + cards + dialogs + onboarding.

### 4.1 — Layout

- `src/app/(dashboard)/layout.tsx` — sidebar nav (desktop) + bottom nav (mobile < 768px)
- Navbar: logo, user avatar, settings link, logout
- Dark theme default

### 4.2 — Trades page (`src/app/(dashboard)/trades/page.tsx`)

Server Component. Fetches initial data via tRPC server caller.

### 4.3 — Summary Cards (`_components/SummaryCards.tsx`)

- **Row 1 (native):** Total Profit / Day / Week / Month (Stars or TON, tab selector)
- **Row 2 (fiat):** Total Profit USD / Buy Volume / Sell Volume / Portfolio Value
- **Hidden when trades.length === 0**
- Green/red coloring for profit/loss
- Loading skeletons while data fetches

### 4.4 — Trades Table (`_components/TradesTable.tsx`)

Client component (`"use client"`).

**Columns:** Gift (image+name+number+rarity) | Bought | Sold | Buy Price | Sell Price | Profit (abs + %) | Marketplace

**Image loading:**
```tsx
<Image
  src={`https://nft.fragment.com/gift/${slug.toLowerCase()}-${number}.webp`}
  alt={giftName}
  width={36}
  height={36}
  sizes="36px"
  loading="lazy"
  className="rounded"
/>
```

No blur placeholder needed — 36x36 icons. Fixed container prevents layout shift.

**Features:**
- TanStack Table v8 + shadcn `<Table>`
- Sorting (all columns)
- Sticky Gift column + sticky header (mobile)
- `tabular-nums` for price columns
- Row actions: edit, delete (44px touch targets)
- Column visibility toggle (mobile hides dates by default)
- **Infinite scroll** with cursor pagination (load more on scroll bottom)

**Delete flow:**
1. User clicks delete → **AlertDialog** shows: "Удалить сделку EasterEgg-52095?"
2. "Удалить" (destructive) / "Отмена"
3. On confirm → `softDelete` mutation → row disappears → **Undo toast** (5 seconds):

```typescript
toast("Сделка удалена", {
  action: {
    label: "Отменить",
    onClick: () => restoreTrade.mutate({ tradeId }),
  },
  duration: 5000,
});
```

Post-MVP: add "Show deleted" filter in toolbar for power users.

**Empty state (when trades.length === 0):**
- Gift box illustration (SVG or emoji)
- Heading: "Пока нет сделок"
- Subtext: "Добавь первую сделку, чтобы отслеживать прибыль"
- Primary CTA button: "Добавить сделку" → opens TradeFormDialog
- Secondary link: "Сначала настрой комиссию →" → `/settings`
- If `?onboarding=1` in URL → TradeFormDialog opens automatically

### 4.5 — Toolbar (`_components/TradesToolbar.tsx`)

```
[Search] [Status: All/Holding/Sold] [Currency: All/Stars/TON] [Date Range] [Clear]
                                                    [Columns ▼] [Export CSV]
```

Filters stored in URL via `useSearchParams` (shareable, survives refresh).

**Export CSV specification:**
```
Format: UTF-8 with BOM (0xEF 0xBB 0xBF) — required for Excel
Filename: trades_YYYY-MM-DD.csv
Separator: comma

Columns:
  Gift Name, Gift Number, Buy Date, Sell Date, Currency,
  Buy Price, Sell Price, Profit, Profit %, Marketplace (Buy), Marketplace (Sell)

Values:
  Dates: YYYY-MM-DD (ISO)
  Stars: integer (no formatting)
  TON: decimal with up to 9 places
  Empty cells: empty string (not "—" or "NULL")

Scope: all trades matching current filters (not just visible page)
Implementation: client-side generation, no server endpoint needed
```

### 4.6 — Add/Edit Trade Form (`_components/TradeFormDialog.tsx`)

**Responsive:** `<Dialog>` on desktop (>=768px), `<Drawer>` on mobile (<768px).
Same form component inside, different wrapper.

**Fields:**
1. URL field: placeholder `https://t.me/nft/EasterEgg-52095`, autofocus, helper text "Скопируй из Fragment или Telegram"
2. Auto-parse URL → fill gift name, number, image preview (instant, no API call)
3. Currency selector: Stars / TON
4. Buy price (required): Stars = integer input, TON = decimal input → `parseTonInput()`
5. Buy date (required): date picker, defaults to today
6. Sell price (optional): same as buy
7. Sell date (optional): date picker
8. **Buy marketplace:** Fragment / MRKT / Portals / Getgems / Other
9. **Sell marketplace** (shown when sell date present): Fragment / MRKT / Portals / Getgems / Other
10. Commission override (optional, collapsed by default): flat Stars + permille
11. Manual exchange rate (optional, collapsed): for backdated trades
12. Notes (optional)

**Form behavior in different modes:**
```
Add trade (buy):
  → Show buy_marketplace selector
  → sell fields optional (can add sell later)
  → sell_marketplace hidden unless sell_date filled

Close position (edit → add sell):
  → Sell fields become primary
  → Show sell_marketplace selector
  → buy_marketplace read-only

Edit trade:
  → All fields editable
  → Both marketplace selectors visible
```

**Mutation:**
```typescript
const addTrade = api.trades.add.useMutation({
  onSuccess: () => {
    utils.trades.list.invalidate();  // Full refetch — simple, correct
    utils.stats.dashboard.invalidate();
    toast.success("Сделка добавлена");
  },
});
```

No optimistic updates for MVP — `invalidateQueries` after mutation (~200ms refetch). True optimistic with `setInfiniteQueryData` deferred to Phase 6+.

Post-add: new row highlighted 2 seconds (`ring-2 ring-primary transition`).

### 4.7 — Settings page (`src/app/(dashboard)/settings/page.tsx`)

- Default commission: flat Stars + permille ‰
- Note: **"Комиссия применяется к новым сделкам. Существующие сделки не меняются."**
- Default currency: Stars / TON
- Timezone: auto-detected on first login + manual IANA selector
- Telegram account info (read-only: avatar, name, username)
- No fiat currency selector (MVP = USD only)

### 4.8 — Providers wrap

`src/components/providers/index.tsx`:
- tRPC provider (React Query + superjson + global 401 handler)
- Auth provider
- Theme provider (dark default)
- Sonner (toasts)

### Phase 4 — Files created

| File | Action |
|------|--------|
| `src/app/(dashboard)/layout.tsx` | CREATE |
| `src/app/(dashboard)/trades/page.tsx` | CREATE |
| `src/app/(dashboard)/trades/error.tsx` | CREATE — error boundary |
| `src/app/(dashboard)/trades/loading.tsx` | CREATE — loading skeleton |
| `src/app/(dashboard)/trades/_components/SummaryCards.tsx` | CREATE |
| `src/app/(dashboard)/trades/_components/TradesTable.tsx` | CREATE |
| `src/app/(dashboard)/trades/_components/TradesToolbar.tsx` | CREATE |
| `src/app/(dashboard)/trades/_components/TradeFormDialog.tsx` | CREATE — add + edit + responsive |
| `src/app/(dashboard)/trades/_components/DeleteTradeDialog.tsx` | CREATE — AlertDialog + undo toast |
| `src/app/(dashboard)/trades/_components/EmptyState.tsx` | CREATE |
| `src/app/(dashboard)/trades/_components/columns.tsx` | CREATE — column defs |
| `src/app/(dashboard)/settings/page.tsx` | CREATE |
| `src/app/(dashboard)/settings/error.tsx` | CREATE — error boundary |
| `src/app/(dashboard)/settings/loading.tsx` | CREATE — loading skeleton |
| `src/components/providers/index.tsx` | CREATE |
| `src/app/layout.tsx` | UPDATE — wrap with providers, noindex meta |

### Phase 4 — Verification

- [ ] Empty state shows on first login
- [ ] `?onboarding=1` → TradeFormDialog opens automatically
- [ ] Add trade → table refetches → row appears → toast
- [ ] Delete → AlertDialog → confirm → soft delete → undo toast (5s)
- [ ] Undo within 5s → trade restored
- [ ] PnL cards update after trade add/delete
- [ ] Sorting, filtering, search work
- [ ] Infinite scroll loads next page
- [ ] Export CSV downloads correctly (open in Excel, encoding OK)
- [ ] Mobile (375px): drawer opens instead of dialog, bottom nav, sticky column
- [ ] Settings: commission note explains "только для новых сделок"
- [ ] Dates formatted as DD.MM.YY, numbers with space separator

---

## Phase 5: Polish & Deploy (Day 8)

### 5.1 — Responsive audit

- 375px (iPhone SE) — all flows work, drawer for forms
- 768px (iPad) — table comfortable
- 1280px (desktop) — full columns, dialog for forms
- Touch targets: min 44px everywhere
- Empty state centered on all breakpoints

### 5.2 — Error handling

- Error boundaries per route segment (`error.tsx` — already created in Phase 4)
- Loading skeletons for table + cards (`loading.tsx` — already created in Phase 4)
- tRPC error → user-friendly toast (not raw error message)
- Network failure → "Нет соединения" banner (top of page)
- Telegram Widget failure → fallback text
- Session expired (401) → toast + redirect to `/login` (global handler from Phase 1)

### 5.3 — Floor price integration

- `market.floorPrices` router → giftasset.pro
- In-memory cache, TTL 1h, stale-while-revalidate
- Portfolio Value card = SUM(floor prices of held gifts)
- Failure → "N/A" (never blocks page)

### 5.4 — SEO prevention

No `robots.txt` needed (app behind auth). Only:
```tsx
// src/app/layout.tsx
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
```

### 5.5 — Railway deploy

- `output: "standalone"` already in next.config.ts
- Environment variables in Railway dashboard
- Neon DATABASE_URL (pooler connection string)
- TELEGRAM_BOT_TOKEN, BETTER_AUTH_SECRET, NEXT_PUBLIC_*
- Custom domain + SSL (automatic on Railway)
- Health check: `/api/health` for Railway readiness probe

### 5.6 — Monitoring

- Sentry (free tier) — error tracking + performance
- UptimeRobot → `/api/health` every 5 min
- `console.log` with context for auth events and API errors (structured enough for Railway logs)

### Phase 5 — Verification

- [ ] `npm run build` passes with 0 warnings
- [ ] `npm run test` — all tests green
- [ ] CI pipeline passes
- [ ] Railway deploy succeeds
- [ ] `/api/health` returns 200 on production
- [ ] Telegram Login works on production domain
- [ ] Lighthouse > 90 (Performance, Accessibility)
- [ ] Mobile: all core flows on 375px
- [ ] Sentry receives test error

---

## Phase 6+: Post-MVP (backlog)

Not part of initial build. Ordered by user value:

1. **Optimistic updates** — `setInfiniteQueryData` for instant add/edit UX
2. **RUB/EUR fiat display** — exchangerate.host or ECB API as source
3. **PnL chart** — bar chart profit by week/month (Recharts)
4. **Bulk CSV import** — parse on client, batch insert in transaction
5. **"Show deleted" filter** — view and restore soft-deleted trades
6. **Marketplace API import** — Portals `myActivity()`, MRKT history
7. **Collection grouping** — "all my Toy Bear trades"
8. **Watchlist** — track gifts not yet bought
9. **Telegram Mini App** — `initData` auth, mobile-optimized layout
10. **Live price feeds** — WebSocket from MRKT/Portals APIs
11. **Portfolio sharing** — public link with privacy controls
12. **Structured logging** — Pino when user base > 100

---

## Key Architecture Decisions

| # | Decision | Reason |
|---|----------|--------|
| 1 | Neon WebSocket, not HTTP | Transactions needed (user creation, bulk import) |
| 2 | superjson in tRPC | BigInt not JSON-serializable |
| 3 | `{ mode: "bigint" }` on all BIGINT cols | Default Drizzle mode loses precision |
| 4 | String arithmetic for TON input | `parseFloat("3.5") * 1e9` = broken |
| 5 | `@t3-oss/env-nextjs` | Build fails if env missing, not runtime crash |
| 6 | tRPC only, no Server Actions | Reusable for future Mini App, centralized auth |
| 7 | `satisfies BetterAuthPlugin` | `definePlugin` may not be exported |
| 8 | Profit NEVER stored | VIEW computes from locked commission + historical rates |
| 9 | Partial unique index | Prevents duplicate open positions (respects soft delete) |
| 10 | Binance + OKX fallback | Exchange rate always available |
| 11 | Soft delete (`deleted_at`) | No accidental data loss, undo toast for 5s |
| 12 | Commission locked at trade creation | Historical PnL stable; settings change = future trades only |
| 13 | USD rate locked at trade time | `buy_rate_usd` / `sell_rate_usd` saved per trade |
| 14 | Cursor pagination | Stable under concurrent inserts, no offset drift |
| 15 | Vitest for pure functions | currencies, parser, pnl-engine, formatters — critical to get right |
| 16 | Rate limiting (Upstash) | Prevent API spam; in-memory fallback for dev |
| 17 | Drawer on mobile, Dialog on desktop | 8+ field form doesn't fit 375px dialog |
| 18 | MVP = USD only | No reliable RUB/EUR source; add post-MVP |
| 19 | No optimistic updates in MVP | Cursor pagination + optimistic = complex; invalidate is simpler |
| 20 | Global 401 handler | Session expired → toast + redirect, not broken page |
| 21 | ru-RU locale for dates/numbers | DD.MM.YY, space separator; TON uses dot (crypto convention) |

---

## Risk Register

| Risk | Severity | Mitigation | Phase |
|------|----------|-----------|-------|
| Better Auth Telegram plugin doesn't work | HIGH | Check exports at install, fallback to raw cookie handler | 3 |
| BigInt serialization edge cases | HIGH | superjson + unit tests for branded types | 1 |
| shadcn + Tailwind v4 incompatibility | MEDIUM | Check before start, fallback to v3 in 5 min | 1 |
| ws fails on Railway standalone | MEDIUM | Fallback to neon-http (lose transactions, app stays alive) | 1 |
| Neon WebSocket cold start slow | LOW | Pool reuse on Railway (persistent process) | 1 |
| giftasset.pro API changes/down | LOW | Graceful degradation, attributes nullable | 2 |
| Drizzle doesn't support CREATE VIEW | LOW | Raw SQL migration, documented in schema comments | 2 |
| Upstash Redis not available | LOW | In-memory Map fallback for rate limiting | 1 |
| Telegram Widget blocked (adblockers) | LOW | Fallback text with browser recommendation | 3 |
| Railway restart kills in-memory cache | LOW | Stale-while-revalidate; first request cold but never blocks | 2 |
| Neon free tier compute hours | LOW | 190h/month = ~6.3h/day, sufficient for dev + early prod | — |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-02-19 | Initial architecture design |
| v2 | 2026-02-21 | Post-audit plan with file-level detail, env validation, ESLint |
| v3 | 2026-02-22 | +Testing, +rate limiting, +pagination, +CI/CD, +CSRF, +soft delete, +commission lock, +health check, +mobile drawer, +delete confirmation, +onboarding |
| v4 | 2026-02-22 | Merged errata: +complete env vars, +USD-only MVP (no RUB/EUR), +USD rate lock per trade, +undo toast, +401 handler, +no optimistic updates, +formatters.ts (ru-RU), +timezone at login, +two marketplaces, +CSV spec, +image strategy, +noindex meta only |
