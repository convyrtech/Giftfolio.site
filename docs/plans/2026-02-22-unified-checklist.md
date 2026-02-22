# GIFTSSITE — Unified Implementation Checklist

> **Date:** 2026-02-22
> **Sources:** plan-v4, pre-implementation-audit, architecture-design, adversarial-audit
> **Stack:** Next.js 16.1.6 + tRPC v11 + Drizzle 0.45.1 + Neon WS + Better Auth ~1.4.18 + Tailwind v4 + shadcn/ui + Zod v4

---

## Phase 1: Project Scaffold + Tooling — COMPLETE

All items verified and passing.

- [x] Create Next.js project (TS strict, Tailwind v4, App Router, src/)
- [x] ESLint + Prettier (flat config, strict TS rules, prettier integration)
  - Discovery: `next lint` broken in Next.js 16 — use `eslint src`
- [x] Environment validation (`src/env.ts` via @t3-oss/env-nextjs + Zod v4)
- [x] `.env.example` + `.env.local` (all vars documented)
- [x] Vitest setup (`vitest.config.ts`, @vitejs/plugin-react)
- [x] CI/CD (`.github/workflows/ci.yml`: lint + typecheck + test + format:check)
- [x] shadcn/ui init (tw-animate-css, oklch, @theme inline, tailwind-merge@3)
  - All 13 base components installed
- [x] Core dependencies installed (tRPC v11, Better Auth ~1.4.18, Drizzle 0.45.1, TanStack Table/Query, superjson, ws, Upstash)
- [x] Drizzle config (`drizzle.config.ts`)
- [x] DB client (`src/server/db/index.ts`):
  - [x] Pool: max=5, idleTimeout=30s, connectionTimeout=10s
  - [x] Graceful shutdown (SIGTERM/SIGINT, 2.5s timeout)
  - [x] Dual driver: WS pool (writes) + HTTP fallback (reads)
  - [x] `neonConfig.webSocketConstructor = ws`
- [x] tRPC scaffold (6 files):
  - [x] `src/server/api/trpc.ts` — context wrapped in `cache()`, superjson, protectedProcedure
  - [x] `src/server/api/root.ts` — health procedure (avoids empty router TS error)
  - [x] `src/lib/trpc/client.tsx` — `createTRPCReact<AppRouter>()`, Provider, httpBatchLink
  - [x] `src/lib/trpc/server.ts` — `createHydrationHelpers`, HydrateClient
  - [x] `src/lib/trpc/query-client.ts` — superjson serialize/deserialize for RSC hydration
  - [x] `src/app/api/trpc/[trpc]/route.ts` — `runtime = "nodejs"`
- [x] Health endpoint (`/api/health` — NO database hit, Neon cold start safe)
- [x] Utility modules:
  - [x] `currencies.ts` — Stars, NanoTon branded types, string arithmetic, `Intl.NumberFormat(bigint)`
  - [x] `exchange-rates.ts` — Binance+OKX `Promise.any`, cache TTL 5min, stale-while-revalidate
  - [x] `gift-parser.ts` — last hyphen split, PascalCase→display, null for invalid
  - [x] `formatters.ts` — DD.MM.YY, space separators, USD, percent
  - [x] `utils.ts` — cn() (shadcn)
- [x] `next.config.ts`:
  - [x] `output: "standalone"`
  - [x] `serverExternalPackages: ["ws"]`
  - [x] `outputFileTracingIncludes` for ws (top-level, NOT experimental — Next.js 16)
  - [x] `images.remotePatterns`: `nft.fragment.com`
- [x] Unit tests (59 passing):
  - [x] currencies.test.ts (30 tests)
  - [x] gift-parser.test.ts (16 tests)
  - [x] formatters.test.ts (13 tests)
- [x] `tsconfig.json`: target ES2020+ (BigInt literal support)
- [x] All verifications green: test, typecheck, lint, build, format:check

### Phase 1 — Audit Items Status

| # | Audit Fix | Status |
|---|-----------|--------|
| 1 | Pool config: max=5, timeouts | DONE |
| 2 | Graceful shutdown (SIGTERM/SIGINT) | DONE |
| 3 | `dbHttp` export for HTTP fallback | DONE |
| 4 | `createTRPCContext` wrapped in `cache()` | DONE |
| 5 | `outputFileTracingIncludes` for ws | DONE |
| 6 | `runtime = "nodejs"` on API routes | DONE |
| 14 | `tw-animate-css` (not tailwindcss-animate) | DONE |
| 15 | `tailwind-merge@3` | DONE |
| 16 | `formatStars` uses `Intl.NumberFormat(bigint)` | DONE |
| — | `query-client.ts` with superjson (new file) | DONE |
| — | Pin `better-auth: ~1.4.18` (tilde) | DONE |

### Phase 1 — Discoveries (affect later phases)

| # | Discovery | Impact |
|---|-----------|--------|
| 1 | Next.js 16.1.6 (not 15) | `outputFileTracingIncludes` top-level, `next lint` broken |
| 2 | tRPC v11.0.0 stable | `createTRPCReact()` (not `createTRPCContext` from shared) |
| 3 | `createHydrationHelpers` returns `{ trpc, HydrateClient }` only | `prefetch` is a method on procedures: `trpc.X.Y.prefetch()` |
| 4 | Zod v4.3.6 (not v3) | API may differ — verify schema transforms in Phase 2 |
| 5 | shadcn init auto-generates correct v4 patterns | All audit CSS items confirmed |
| 6 | React 19.2.3 | Check compatibility with Better Auth hooks |

---

## Phase 2: Database Schema + tRPC Routers

### 2.1 — Drizzle Schema (`src/server/db/schema.ts`)

- [ ] `users` table: id (BIGSERIAL), telegram_id (BIGINT UNIQUE), username, first_name, photo_url, created_at, updated_at
- [ ] `userSettings` table:
  - [ ] `default_commission_stars` BIGINT DEFAULT 0 — mode: "bigint"
  - [ ] `default_commission_permille` SMALLINT DEFAULT 0
  - [ ] `default_currency` TEXT ('STARS'|'TON') with CHECK
  - [ ] `timezone` TEXT DEFAULT 'UTC' (IANA)
  - [ ] NO `display_fiat_currency` — MVP is USD only
- [ ] `trades` table:
  - [ ] Gift fields: gift_link, gift_slug, gift_name, gift_number
  - [ ] Attribute fields: attr_model, attr_backdrop, attr_symbol, attr_*_rarity (all nullable)
  - [ ] `trade_currency` TEXT ('STARS'|'TON') with CHECK
  - [ ] Price fields: `buy_price`, `sell_price` — single BIGINT each, mode: "bigint"
  - [ ] `buy_date` DATE NOT NULL, `sell_date` DATE nullable
  - [ ] Commission override: `commission_flat_stars` BIGINT, `commission_permille` SMALLINT (both nullable)
  - [ ] USD rates: `buy_rate_usd` NUMERIC(12,8), `sell_rate_usd` NUMERIC(12,8)
  - [ ] NO `buy_rate_fiat` / `sell_rate_fiat` — MVP is USD only
  - [ ] Marketplace: `buy_marketplace`, `sell_marketplace` (separate columns, CHECK constraint)
  - [ ] `deleted_at` TIMESTAMPTZ — NULL=active, non-NULL=soft-deleted
  - [ ] `notes` TEXT
  - [ ] **ALL BIGINT columns use `{ mode: "bigint" }`** (Critical!)
  - [ ] CHECK: price_currency_check (buy price matches currency)
  - [ ] CHECK: sell_price_currency_check (sell price matches currency)

### 2.2 — VIEW `trade_profits` via `pgView(...).existing()`

- [ ] Declare `pgView("trade_profits", { ... }).existing()` in schema.ts for type safety
  - All columns typed: id, userId, giftSlug, tradeCurrency, buyPrice, sellPrice, commission fields, net_profit_stars, net_profit_nanoton, net_profit_usd, buy_value_usd, sell_value_usd, buyDate, sellDate, deletedAt
- [ ] Create custom migration: `drizzle-kit generate --custom --name=create-trade-profits-view`
- [ ] Fill migration with `CREATE OR REPLACE VIEW trade_profits AS ...`
- [ ] VIEW formula:
  - [ ] Stars profit: `sell - buy - flat - ROUND(sell * permille / 1000)`
  - [ ] TON profit: `sell - buy - ROUND(sell * permille / 1000)` (no flat — different currency)
  - [ ] USD profit: using historical `buy_rate_usd` / `sell_rate_usd`
  - [ ] Commission reads from trade row (locked at creation, NOT from user_settings via JOIN)
  - [ ] `WHERE deleted_at IS NULL` — soft-deleted trades excluded from all PnL
- [ ] VIEW column types must match actual SQL output exactly

### 2.3 — Indexes

- [ ] Partial unique index: `(user_id, gift_slug) WHERE sell_date IS NULL AND deleted_at IS NULL`
  - Prevents duplicate open positions
  - Respects soft delete (can reopen after soft-deleting previous)
  - Can define in schema.ts via `.where(sql\`...\`)` if Drizzle supports
- [ ] `idx_trades_user_active`: `(user_id, sell_date DESC NULLS LAST) WHERE deleted_at IS NULL`
- [ ] Other indexes as needed (gift_slug, marketplace, etc.)

### 2.4 — Migration Workflow

- [ ] Use `drizzle-kit generate` + `drizzle-kit migrate` (NOT `push` for production)
- [ ] `push` is ONLY for rapid prototyping
- [ ] Custom migrations for VIEW and partial indexes
- [ ] Test: `npx drizzle-kit migrate` succeeds on Neon

### 2.5 — Commission Lock on Trade Creation

- [ ] When creating trade: copy current commission defaults into trade row
  - `commissionFlatStars: input.commissionFlatStars ?? settings.defaultCommissionStars`
  - `commissionPermille: input.commissionPermille ?? settings.defaultCommissionPermille`
- [ ] Changing default commission does NOT affect existing trades
- [ ] Historical PnL stays stable

### 2.6 — USD Rate Lock at Trade Time

- [ ] `trades.add`: fetch rate → INSERT with `buy_rate_usd = fetched rate`
- [ ] `trades.update` (close position): fetch rate → UPDATE `sell_rate_usd = fetched rate`
- [ ] Fetch failed → rate = NULL → UI shows "—"
- [ ] NEVER block trade creation if rate unavailable

### 2.7 — tRPC Routers

- [ ] `trades` router:
  - [ ] `list` — cursor pagination (by id DESC), limit default 50 max 100
  - [ ] `add` — Zod validation, commission lock, rate lock, gift parse
  - [ ] `update` — edit trade, close position (add sell)
  - [ ] `softDelete` — set `deleted_at`
  - [ ] `restore` — clear `deleted_at`
  - [ ] `getById` — single trade
  - [ ] `exportCsv` — all trades matching filters (no pagination) for CSV export
  - [ ] **Server-side sort ONLY** (sort, sortDir params in input)
- [ ] `stats` router:
  - [ ] `dashboard` — single SQL per currency, timezone-aware (`AT TIME ZONE`)
  - [ ] Filter: day/week/month/total, currency
- [ ] `gifts` router:
  - [ ] `parseUrl` — sync, no network
  - [ ] `fetchAttributes` — giftasset.pro integration
  - [ ] `fetchFloorPrice` — cached
- [ ] `market` router:
  - [ ] `floorPrices` — giftasset.pro, cached 1h in-memory, rate limited
- [ ] `settings` router:
  - [ ] `get` — user settings
  - [ ] `update` — commission, timezone, default currency
- [ ] All routers use `protectedProcedure` (auth + rate limit)
- [ ] Register all routers in `src/server/api/root.ts`

### 2.8 — PnL Engine

- [ ] `src/lib/pnl-engine.ts` — pure functions for dashboard stat calculations
- [ ] `src/lib/__tests__/pnl-engine.test.ts`:
  - [ ] Stars profit calculation (flat + permille)
  - [ ] TON profit calculation (permille only)
  - [ ] Edge cases: zero commission, max permille (1000 = 100%)
  - [ ] Null handling (missing rates, unsold trades)

### 2.9 — Aggregate Queries

- [ ] Use `.mapWith(BigInt)` NOT `.mapWith(Number)` for all BigInt aggregations
  - Architecture doc has `mapWith(Number)` bug — do NOT follow it

### Phase 2 — Verification

- [ ] `npx drizzle-kit migrate` succeeds on Neon
- [ ] VIEW `trade_profits` returns correct columns
- [ ] `npm run test` — pnl-engine tests green
- [ ] trades.list returns paginated results (cursor works)
- [ ] trades.add locks commission + USD rate from current values
- [ ] Soft delete: trade disappears from list, stats update, can restore
- [ ] Partial unique index: duplicate open trade → error
- [ ] trades.list supports server-side sort (date, profit, price)
- [ ] Zod v4 transforms work correctly (verify `parseTonInput` in Zod transform)
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes

---

## Phase 3: Authentication

### 3.1 — Better Auth Setup

- [ ] Check Better Auth exports: `node -e "console.log(Object.keys(require('better-auth')))"`
- [ ] Verify `BetterAuthPlugin` type exists, `createAuthEndpoint` importable
- [ ] `src/server/auth/index.ts` — Better Auth config:
  - [ ] Database adapter: Drizzle + Neon
  - [ ] Session: httpOnly cookie, 7-day expiry
  - [ ] `cookieCache: { enabled: true, maxAge: 5 * 60 }` (5-min cache, avoid DB hit per request)
  - [ ] Plugin: custom `telegramPlugin`

### 3.2 — Telegram Plugin (`src/server/auth/telegram-plugin.ts`)

- [ ] `satisfies BetterAuthPlugin` (NOT `definePlugin`)
- [ ] `verifyTelegramAuth()`:
  - [ ] HMAC-SHA256 with SHA256(bot_token) as key
  - [ ] **Buffer length check BEFORE `timingSafeEqual`** (different length → return false)
  - [ ] Filter: `v !== undefined && v !== null` (NOT falsy — 0 is valid)
  - [ ] `auth_date` expiry check (24h)
  - [ ] HMAC verification MUST be first — before any DB access
- [ ] `createUserOnFirstLogin()`:
  - [ ] `db.transaction()` for users + user_settings (atomic)
  - [ ] Users: `onConflictDoUpdate` (update name/photo on re-login)
  - [ ] Settings: `onConflictDoNothing` (defaults don't change on re-login)
  - [ ] Timezone from client → stored in user_settings
- [ ] Wrap `internalAdapter.createSession()` in abstraction (internal API, may change)

### 3.3 — Auth API Route

- [ ] `src/app/api/auth/[...all]/route.ts` — Better Auth catch-all handler
- [ ] `export const runtime = "nodejs"` (ws compatibility)

### 3.4 — CSRF Protection

- [ ] Origin header check in tRPC middleware: `Origin !== env.NEXT_PUBLIC_APP_URL` → reject
- [ ] SameSite=lax cookies (Better Auth default)

### 3.5 — Middleware (`src/middleware.ts`)

- [ ] Redirect unauthenticated users to `/login`
- [ ] Protect `/(dashboard)/*` routes
- [ ] **UX-only** — real security is `protectedProcedure` in tRPC
- [ ] NEVER import from `@/server/db` (middleware runs in Edge, ws breaks)

### 3.6 — Login Page (`src/app/(auth)/login/page.tsx`)

- [ ] Telegram Login Widget (script embed)
- [ ] Dark theme, centered layout
- [ ] Fallback text if widget fails: "Виджет не загрузился..."
- [ ] Timezone detection: `Intl.DateTimeFormat().resolvedOptions().timeZone` → send with auth
- [ ] Redirect to `/trades?onboarding=1` on first login

### 3.7 — Update `src/server/api/trpc.ts`

- [ ] Real auth: `auth.api.getSession({ headers })` in context
- [ ] CSRF check in protectedProcedure middleware
- [ ] Rate limiting: Upstash Redis if env vars present, in-memory Map fallback

### 3.8 — Auth Provider

- [ ] `src/components/providers/auth-provider.tsx` — React context for session

### Phase 3 — Verification

- [ ] Telegram Login Widget renders on `/login`
- [ ] Widget failure → fallback text shown
- [ ] Login creates user + user_settings atomically (check DB)
- [ ] user_settings.timezone populated from client detection
- [ ] Re-login updates name/photo but NOT settings (onConflictDoUpdate/DoNothing)
- [ ] Unauthenticated → redirect to `/login`
- [ ] `protectedProcedure` rejects unauthenticated tRPC calls
- [ ] Cross-origin tRPC request → rejected (CSRF)
- [ ] Session cookie: httpOnly, secure, sameSite=lax
- [ ] Buffer length mismatch in hash → returns false (not throws)
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes

---

## Phase 4: UI — Table & Dashboard

### 4.1 — Layout

- [ ] `src/app/(dashboard)/layout.tsx` — sidebar nav (desktop) + bottom nav (mobile < 768px)
- [ ] Navbar: logo, user avatar, settings link, logout
- [ ] Dark theme default

### 4.2 — Providers

- [ ] `src/components/providers/index.tsx`:
  - [ ] TRPCReactProvider (React Query + superjson + global 401 handler)
  - [ ] Auth provider
  - [ ] Theme provider (dark default via next-themes)
  - [ ] Sonner (toasts)
- [ ] Global 401 handler in QueryClient:
  ```
  onError: if UNAUTHORIZED → toast "Сессия истекла" + redirect /login
  ```

### 4.3 — Trades Page (RSC)

- [ ] `src/app/(dashboard)/trades/page.tsx` — Server Component
- [ ] Prefetch via tRPC server caller: `void serverTrpc.trades.list.prefetchInfinite({ limit: 50 })`
- [ ] Wrap client component in `<HydrateClient>`
- [ ] `error.tsx` + `loading.tsx` (error boundary + skeleton)

### 4.4 — Summary Cards (`_components/SummaryCards.tsx`)

- [ ] Row 1 (native): Total Profit / Day / Week / Month (Stars or TON, tab selector)
- [ ] Row 2 (fiat): Total Profit USD / Buy Volume / Sell Volume / Portfolio Value
- [ ] Hidden when trades.length === 0
- [ ] Green/red coloring for profit/loss
- [ ] Loading skeletons while data fetches

### 4.5 — Trades Table (`_components/TradesTable.tsx`)

- [ ] Client component (`"use client"`)
- [ ] TanStack Table v8 + shadcn `<Table>`
- [ ] Columns: Gift (img+name+#num+rarity) | Bought | Sold | Buy Price | Sell Price | Profit (abs+%) | Marketplace
- [ ] Image: `<Image>` from `nft.fragment.com/gift/${slug.toLowerCase()}-${number}.webp`, 36x36, lazy
- [ ] **Server-side sort ONLY** (sort/sortDir in tRPC input, no client sort)
- [ ] Sticky Gift column + sticky header (mobile)
- [ ] `tabular-nums` for price columns
- [ ] Row actions: edit, delete (44px touch targets)
- [ ] Column visibility toggle (mobile hides dates by default)
- [ ] **Infinite scroll** with IntersectionObserver:
  - Sentinel element pattern
  - `rootMargin: "200px"` (prefetch before visible)
  - `useInfiniteQuery` with `getNextPageParam: (last) => last.nextCursor`
  - `data.pages.flatMap(p => p.items)` for all loaded trades
  - No virtualization for MVP (revisit at 2000+ trades)
- [ ] Custom BigInt sort function for TanStack Table
- [ ] `React.memo` on TradeRow (prevent re-renders on new page load)
- [ ] **Never render BigInt in JSX directly** — always through formatters

### 4.6 — Empty State (`_components/EmptyState.tsx`)

- [ ] Gift box illustration (SVG or emoji)
- [ ] "Пока нет сделок"
- [ ] "Добавь первую сделку, чтобы отслеживать прибыль"
- [ ] Primary CTA: "Добавить сделку" → opens TradeFormDialog
- [ ] Secondary: "Сначала настрой комиссию →" → `/settings`
- [ ] `?onboarding=1` in URL → TradeFormDialog opens automatically

### 4.7 — Toolbar (`_components/TradesToolbar.tsx`)

- [ ] Search, Status (All/Holding/Sold), Currency (All/Stars/TON), Date Range, Clear
- [ ] Columns toggle, Export CSV
- [ ] Filters stored in URL via `useSearchParams` (shareable, survives refresh)
- [ ] `<Suspense>` boundary required around components using `useSearchParams`
- [ ] Cursor never in URL — only sort/filter

### 4.8 — Add/Edit Trade Form (`_components/TradeFormDialog.tsx`)

- [ ] Responsive: `<Dialog>` desktop (>=768px), `<Drawer>` mobile (<768px)
- [ ] Same form component inside, different wrapper
- [ ] Fields:
  1. URL field: placeholder `https://t.me/nft/EasterEgg-52095`, autofocus, helper text
  2. Auto-parse URL → fill gift name, number, image preview (instant, no API)
  3. Currency selector: Stars / TON
  4. Buy price: Stars=integer, TON=decimal → `parseTonInput()`
  5. Buy date: date picker, default today
  6. Sell price (optional)
  7. Sell date (optional)
  8. Buy marketplace: Fragment / MRKT / Portals / Getgems / Other
  9. Sell marketplace (shown when sell date present)
  10. Commission override (collapsed by default)
  11. Manual exchange rate (collapsed, for backdated trades)
  12. Notes (optional)
- [ ] Form modes: Add (buy), Close position (add sell), Edit (all fields)
- [ ] TON input: user types "3.5", form state = string, submit → `parseTonInput("3.5")` → BigInt
- [ ] Mutation: `invalidateQueries` after success (no optimistic updates in MVP)
- [ ] Post-add: new row highlighted 2s (`ring-2 ring-primary transition`)
- [ ] Toast: "Сделка добавлена"

### 4.9 — Delete Trade (`_components/DeleteTradeDialog.tsx`)

- [ ] AlertDialog: "Удалить сделку {name}-{number}?"
- [ ] "Удалить" (destructive) / "Отмена"
- [ ] On confirm → `softDelete` mutation → row disappears → Undo toast (5s):
  ```
  toast("Сделка удалена", { action: { label: "Отменить", onClick: restore } })
  ```

### 4.10 — CSV Export

- [ ] Separate tRPC query: `trades.exportCsv` (all trades, no pagination)
- [ ] UTF-8 with BOM (0xEF 0xBB 0xBF) for Excel
- [ ] Filename: `trades_YYYY-MM-DD.csv`
- [ ] Columns: Gift Name, Number, Buy Date, Sell Date, Currency, Buy Price, Sell Price, Profit, Profit %, Marketplace (Buy), Marketplace (Sell)
- [ ] Scope: all trades matching current filters

### 4.11 — Settings Page (`src/app/(dashboard)/settings/page.tsx`)

- [ ] Default commission: flat Stars + permille (‰)
- [ ] Note: "Комиссия применяется к новым сделкам. Существующие сделки не меняются."
- [ ] Default currency: Stars / TON
- [ ] Timezone: auto-detected + manual IANA selector
- [ ] Telegram info (read-only: avatar, name, username)
- [ ] NO fiat currency selector (MVP = USD only)
- [ ] `error.tsx` + `loading.tsx`

### Phase 4 — Verification

- [ ] Empty state shows on first login
- [ ] `?onboarding=1` → TradeFormDialog opens automatically
- [ ] Add trade → table refetches → row appears → toast
- [ ] Delete → AlertDialog → confirm → soft delete → undo toast (5s)
- [ ] Undo within 5s → trade restored
- [ ] PnL cards update after trade add/delete
- [ ] Sorting (server-side), filtering, search work
- [ ] Infinite scroll loads next page (IntersectionObserver)
- [ ] Export CSV downloads correctly (open in Excel, encoding OK)
- [ ] Mobile (375px): drawer opens, bottom nav, sticky column
- [ ] Settings: commission note explains "только для новых сделок"
- [ ] Dates: DD.MM.YY, numbers: space separator, TON: dot decimal
- [ ] BigInt values never crash React (always through formatters)
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes

---

## Phase 5: Polish & Deploy

### 5.1 — Responsive Audit

- [ ] 375px (iPhone SE) — all flows work, drawer for forms
- [ ] 768px (iPad) — table comfortable
- [ ] 1280px (desktop) — full columns, dialog for forms
- [ ] Touch targets: min 44px everywhere
- [ ] Empty state centered on all breakpoints

### 5.2 — Error Handling

- [ ] Error boundaries per route segment (`error.tsx`)
- [ ] Loading skeletons (`loading.tsx`)
- [ ] tRPC error → user-friendly toast (not raw error)
- [ ] Network failure → "Нет соединения" banner
- [ ] Telegram Widget failure → fallback text
- [ ] Session expired (401) → toast + redirect `/login` (global handler)

### 5.3 — Floor Price Integration

- [ ] `market.floorPrices` → giftasset.pro
- [ ] In-memory cache, TTL 1h, stale-while-revalidate
- [ ] Portfolio Value card = SUM(floor prices of held gifts)
- [ ] Failure → "N/A" (never blocks page)

### 5.4 — SEO Prevention

- [ ] `robots: { index: false, follow: false }` in layout.tsx metadata (already done)
- [ ] No `robots.txt` needed (app behind auth)

### 5.5 — Railway Deploy

- [ ] `output: "standalone"` (already in next.config.ts)
- [ ] Set env vars in Railway:
  - [ ] `DATABASE_URL` (Neon pooler connection string)
  - [ ] `TELEGRAM_BOT_TOKEN`
  - [ ] `BETTER_AUTH_SECRET` (min 32 chars)
  - [ ] `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`
  - [ ] `NEXT_PUBLIC_APP_URL`
  - [ ] `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10`
  - [ ] Optional: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
  - [ ] Optional: `SENTRY_DSN`
- [ ] Custom domain + SSL (automatic on Railway)
- [ ] Health check: `/api/health` for Railway readiness probe

### 5.6 — Monitoring

- [ ] Sentry (free tier) — error tracking
- [ ] UptimeRobot → `/api/health` every 5 min
- [ ] `console.log` with context for auth events and API errors

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

## Cross-Cutting Rules (Apply to ALL Phases)

### Currency Safety

- Stars = BIGINT (whole integers, no decimals)
- TON = BIGINT nanotons (1 TON = 1,000,000,000)
- **Branded types** `Stars`, `NanoTon` prevent mixing in TypeScript
- **String arithmetic** for TON parsing — NEVER `parseFloat * 1e9`
- ALL BIGINT Drizzle columns: `{ mode: "bigint" }`
- Aggregate queries: `.mapWith(BigInt)` NOT `.mapWith(Number)`
- React rendering: NEVER `{trade.buyPrice}` directly — always formatters
- `Intl.NumberFormat.format()` natively accepts BigInt

### superjson Pipeline (3 symmetric places)

1. tRPC server: `initTRPC.create({ transformer: superjson })`
2. tRPC client: `httpBatchLink({ transformer: superjson })`
3. QueryClient: `serializeData: superjson.serialize` + `deserializeData: superjson.deserialize`

### tRPC v11 Patterns

- Client: `createTRPCReact<AppRouter>()`, `.Provider`, `.createClient()`
- Server RSC: `createCallerFactory(appRouter)(createTRPCContext)`
- Hydration: `createHydrationHelpers<AppRouter>(caller, getQueryClient)` → `{ trpc, HydrateClient }`
- Prefetch in RSC: `void trpc.trades.list.prefetchInfinite({ limit: 50 })`
- Use `httpBatchLink` (NOT `httpBatchStreamLink` — cookies issue)
- Context wrapped in React `cache()`

### Authentication Rules

- Two-layer auth: middleware (redirect) + `protectedProcedure` (real security)
- NEVER trust client-side auth alone
- HMAC verification BEFORE any DB access
- `timingSafeEqual` with buffer length check
- Session: httpOnly, secure, sameSite=lax
- `cookieCache` for performance (5-min TTL)
- CSRF: Origin header check in tRPC middleware

### Database Rules

- ALWAYS filter `WHERE deleted_at IS NULL` for active trades
- ALWAYS filter by `userId` — NEVER return other users' data
- Profit NEVER stored — computed via VIEW
- Commission locked at trade creation (not retroactive)
- USD rate locked at trade time (historical, not retroactive)
- Transactions for multi-table writes only
- External HTTP calls ALWAYS outside transaction boundary
- Migration workflow: `generate` + `migrate` (NOT `push` for production)
- VIEW managed via custom migration (`CREATE OR REPLACE VIEW`)

### Next.js 16 Specific

- `cookies()`, `headers()`, `params` are async — always await
- `outputFileTracingIncludes` is top-level config (NOT in `experimental`)
- Use `eslint src` (NOT `next lint`)
- `export const runtime = "nodejs"` on all API routes using ws/db

### Style / UI Rules

- Server Components by default — `"use client"` only for interactivity
- Tailwind classes only — no inline styles, no CSS modules
- Dark theme default, `cn()` for conditional classes
- `@theme inline` + oklch (NOT HSL, NOT `@theme` without inline)
- `tw-animate-css` (NOT `tailwindcss-animate`)
- `@tailwindcss/postcss` in PostCSS config

---

## Architecture Doc Fixes Needed (Non-Blocking)

These are documentation fixes — do NOT follow the incorrect patterns in implementation.

| File | Section | Fix |
|------|---------|-----|
| `architecture-design.md` | Section 3 | `.mapWith(Number)` → `.mapWith(BigInt)` |
| `architecture-design.md` | Section 6 | `@theme {}` + HSL → `@theme inline` + oklch |
| `architecture-design.md` | Section 3 | `formatStars` uses `Number(n)` → use `Intl.NumberFormat(bigint)` |
| `architecture-design.md` | Section 4 | Filter: `v !== ""` → `v !== undefined && v !== null` |
| `architecture-design.md` | Section 2 | Schema has `buy_price_stars`/`buy_price_nanoton` (separate) — plan v4 uses single `buy_price` |
| `architecture-design.md` | Section 2 | Schema has `display_fiat_currency`, `buy_rate_fiat` — removed in MVP (USD only) |
| `architecture-design.md` | Overview | Says Next.js 15 — actually 16.1.6 |

---

## Key Architecture Decisions (Quick Reference)

| # | Decision | Reason |
|---|----------|--------|
| 1 | Neon WebSocket, not HTTP | Transactions (user creation, bulk import) |
| 2 | superjson in tRPC | BigInt not JSON-serializable |
| 3 | `{ mode: "bigint" }` on all BIGINT | Drizzle default loses precision |
| 4 | String arithmetic for TON | `parseFloat * 1e9` = broken |
| 5 | `@t3-oss/env-nextjs` | Build fails if env missing |
| 6 | tRPC only, no Server Actions | Reusable for Mini App, centralized auth |
| 7 | `satisfies BetterAuthPlugin` | `definePlugin` may not export |
| 8 | Profit NEVER stored | VIEW computes from locked commission + historical rates |
| 9 | Partial unique index | Prevents duplicate open positions (respects soft delete) |
| 10 | Binance + OKX fallback | Rate always available |
| 11 | Soft delete (`deleted_at`) | Undo toast, no data loss |
| 12 | Commission locked at creation | Historical PnL stable |
| 13 | USD rate locked per trade | No retroactive recalculation |
| 14 | Cursor pagination | Stable under concurrent inserts |
| 15 | Server-side sort only | Client has partial data (loaded pages only) |
| 16 | Drawer mobile, Dialog desktop | 8+ fields don't fit 375px dialog |
| 17 | MVP = USD only | Add RUB/EUR post-MVP |
| 18 | No optimistic updates in MVP | Cursor + optimistic = complex |
| 19 | `pgView.existing()` | Type safety without Drizzle managing DDL |
| 20 | `generate + migrate` | Custom SQL for VIEW and partial indexes |

---

## Risk Register

| Risk | Severity | Mitigation | Phase |
|------|----------|-----------|-------|
| Better Auth Telegram plugin API | HIGH | Pin ~1.4.18, wrap internalAdapter, check exports at install | 3 |
| BigInt serialization edge cases | HIGH | superjson × 3, unit tests, branded types | 1 (DONE) |
| shadcn + Tailwind v4 | MEDIUM | Verified compatible, fallback to v3 in 10min | 1 (DONE) |
| ws on Railway standalone | MEDIUM | outputFileTracingIncludes + serverExternalPackages + HTTP fallback | 1 (DONE) |
| Neon cold start | LOW | Pool reuse, health check NO DB hit | 1 (DONE) |
| giftasset.pro API changes | LOW | Graceful degradation, nullable attributes | 2 |
| Drizzle VIEW management | LOW | Custom migrations, `CREATE OR REPLACE` | 2 |
| Telegram Widget blocked | LOW | Fallback text | 3 |
| Railway restart kills cache | LOW | Stale-while-revalidate, first request cold | 2 |
| Zod v4 API differences | LOW | Verify transforms work in Phase 2 | 2 |
