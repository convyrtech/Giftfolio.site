# GIFTSSITE — Pre-Implementation Technical Audit

> **Status:** Research complete
> **Date:** 2026-02-22
> **Goal:** Deep technical validation of 7 critical risk areas before Phase 1 implementation
> **Method:** 7 parallel expert agents via `think-through:deep-thinking`

---

## Table of Contents

1. [Overview](#overview)
2. [BigInt + superjson + Drizzle Pipeline](#1-bigint--superjson--drizzle-pipeline)
3. [Better Auth + Telegram Plugin](#2-better-auth--telegram-plugin)
4. [Neon WebSocket on Railway](#3-neon-websocket-on-railway)
5. [tRPC + Next.js 15 App Router](#4-trpc--nextjs-15-app-router)
6. [Tailwind v4 + shadcn/ui](#5-tailwind-v4--shadcnui)
7. [Cursor Pagination + TanStack Table](#6-cursor-pagination--tanstack-table)
8. [Drizzle ORM VIEW + Migrations](#7-drizzle-orm-view--migrations)
9. [Implementation Impact Summary](#implementation-impact-summary)
10. [Updated Code Patterns](#updated-code-patterns)

---

## Overview

### Goals

1. **Validate data pipeline** — BigInt flows from Zod input to React client without precision loss
2. **Verify auth stability** — Better Auth custom plugin API won't break on minor updates
3. **Confirm infra compatibility** — Neon WebSocket works in Railway standalone builds
4. **Establish tRPC patterns** — Correct v11 + Next.js 15 App Router integration
5. **Check CSS stack** — Tailwind v4 + shadcn/ui work together
6. **Design pagination** — Cursor pagination + TanStack Table + infinite scroll
7. **Plan VIEW lifecycle** — Drizzle-managed schema + hand-managed VIEW migrations

### Key Decisions

| Aspect | Decision |
|--------|----------|
| BigInt pipeline | superjson in 3 places: server, client link, QueryClient dehydrate/hydrate |
| Better Auth plugin | Pin `~1.4.0`, wrap `internalAdapter` in abstraction layer |
| Neon on Railway | `outputFileTracingIncludes` for ws, dual driver (WS + HTTP fallback) |
| tRPC version | v11 stable, `httpBatchLink` (not stream), `createCallerFactory` for RSC |
| Tailwind v4 | Fully compatible with shadcn, use `@theme inline` + oklch + `tw-animate-css` |
| Pagination | Server-side sort only, cursor pagination, IntersectionObserver for scroll |
| Drizzle VIEW | `pgView(...).existing()` + custom migration via `drizzle-kit generate --custom` |

---

## 1. BigInt + superjson + Drizzle Pipeline

> **Expert:** Matt Pocock (TypeScript types specialist)

### Critical Issues Found

#### 1.1 React Cannot Render BigInt Directly

React throws `TypeError: Cannot convert a BigInt value to a string` if you try to render `{trade.buyPrice}` in JSX.

**Fix:** ALWAYS use formatters before rendering:

```typescript
// WRONG — crashes React
<span>{trade.buyPrice}</span>

// CORRECT
<span>{formatStars(trade.buyPrice)}</span>
```

#### 1.2 `mapWith(Number)` Bug in Architecture Doc

The architecture doc (Section 3, aggregate queries) uses `.mapWith(Number)` which silently truncates BigInt values above `Number.MAX_SAFE_INTEGER`.

**Fix:** Use `.mapWith(BigInt)` everywhere:

```typescript
// WRONG (architecture doc)
.mapWith(Number)

// CORRECT
.mapWith(BigInt)
```

> **Action:** Fix `docs/plans/2026-02-19-architecture-design.md` before implementation.

#### 1.3 superjson Required in 3 Places

BigInt is not JSON-serializable. superjson must be configured symmetrically:

| Location | File | What |
|----------|------|------|
| tRPC server | `src/server/api/trpc.ts` | `initTRPC.create({ transformer: superjson })` |
| tRPC client | `src/lib/trpc/client.ts` | `httpBatchLink({ transformer: superjson })` |
| QueryClient | `src/lib/trpc/query-client.ts` | `serializeData: superjson.serialize` + `deserializeData: superjson.deserialize` |

**The third place (QueryClient) is NOT in plan v4.** This is required for RSC → client hydration of BigInt values.

#### 1.4 RSC → Client BigInt Hydration

When a Server Component fetches data with BigInt and passes it to a Client Component via `HydrateClient`, the dehydration/hydration must use superjson:

```typescript
// src/lib/trpc/query-client.ts (NEW FILE — missing from plan v4)
import { defaultShouldDehydrateQuery, QueryClient } from "@tanstack/react-query";
import superjson from "superjson";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30 * 1000 },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (q) =>
          defaultShouldDehydrateQuery(q) || q.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
```

#### 1.5 formatStars Must Use BigInt-Safe Formatting

```typescript
// WRONG — loses precision for large values
export function formatStars(n: Stars): string {
  return new Intl.NumberFormat("ru-RU").format(Number(n));
}

// CORRECT — BigInt natively supported by Intl.NumberFormat
export function formatStars(n: Stars): string {
  return `${new Intl.NumberFormat("ru-RU").format(n)} ★`;
}
```

`Intl.NumberFormat.format()` accepts BigInt natively — no conversion needed.

#### 1.6 TanStack Table Custom BigInt Sort

TanStack Table's default sorting uses `<` / `>` which works for BigInt, but custom sort functions must be explicit:

```typescript
const bigintSort: SortingFn<Trade> = (rowA, rowB, columnId) => {
  const a = rowA.getValue<bigint>(columnId);
  const b = rowB.getValue<bigint>(columnId);
  return a < b ? -1 : a > b ? 1 : 0;
};
```

#### 1.7 Test Suite for BigInt Pipeline

Must test the full pipeline: `string input → Zod → BigInt → superjson serialize → deserialize → BigInt`:

```typescript
// currencies.test.ts
test("round-trip through superjson", () => {
  const original = toNanoTon("3.500000001");
  const serialized = superjson.serialize(original);
  const deserialized = superjson.deserialize(serialized);
  expect(deserialized).toBe(original);
});
```

### Impact on Plan v4

- **New file:** `src/lib/trpc/query-client.ts` — add to Phase 1 file table
- **Fix:** `formatStars` must use `Intl.NumberFormat(bigint)` not `Number(n)`
- **Fix:** Architecture doc `mapWith(Number)` → `mapWith(BigInt)`
- **Rule:** Never render BigInt in JSX directly — always through formatters

---

## 2. Better Auth + Telegram Plugin

> **Expert:** Troy Hunt (Security specialist)

### Critical Issues Found

#### 2.1 `internalAdapter` is NOT Public API

The plan uses `context.internalAdapter.createSession()` in the Telegram plugin. This is an internal Better Auth API — not guaranteed stable across versions.

**Fix:** Wrap in abstraction layer + pin version:

```typescript
// Pin in package.json — tilde, not caret
"better-auth": "~1.4.0"

// Abstraction wrapper
async function createSessionForUser(
  ctx: AuthContext,
  userId: string,
): Promise<Session> {
  // If internalAdapter changes, fix only here
  return ctx.internalAdapter.createSession(userId, ctx.request);
}
```

#### 2.2 `timingSafeEqual` Buffer Length Crash

Current plan code throws if attacker sends hash of different byte length:

```typescript
// WRONG — throws TypeError if buffers are different length
return crypto.timingSafeEqual(
  Buffer.from(computedHash, "hex"),
  Buffer.from(receivedHash, "hex"),
);

// CORRECT — length check first
const computed = Buffer.from(computedHash, "hex");
const received = Buffer.from(receivedHash, "hex");
if (computed.length !== received.length) return false;
return crypto.timingSafeEqual(computed, received);
```

#### 2.3 Race Condition on First Login — Upsert Pattern

Two simultaneous first logins with the same Telegram account will race on user creation. Use upsert:

```typescript
// Users: upsert (update on conflict — handles name/photo changes)
const [user] = await tx
  .insert(users)
  .values({ telegramId, username, firstName, photoUrl })
  .onConflictDoUpdate({
    target: users.telegramId,
    set: { username, firstName, photoUrl, updatedAt: new Date() },
  })
  .returning();

// Settings: insert-or-ignore (defaults don't change on re-login)
await tx
  .insert(userSettings)
  .values({ userId: user.id, timezone: "Europe/Moscow" })
  .onConflictDoNothing();
```

#### 2.4 `cookieCache` for Performance

Enable cookie-based session cache to avoid DB hit on every request:

```typescript
export const auth = betterAuth({
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  // ...
});
```

#### 2.5 Filter Logic Inconsistency

Architecture doc and audit doc have different filter logic for `verifyTelegramAuth`:

```typescript
// WRONG (falsy check — excludes numeric 0 which is a valid Telegram field)
Object.entries(data).filter(([, v]) => v)

// CORRECT — only exclude undefined and null
Object.entries(data).filter(([, v]) => v !== undefined && v !== null)
```

> **Action:** Use the correct filter in implementation, regardless of what architecture doc says.

#### 2.6 tRPC protectedProcedure Integration

```typescript
// src/server/api/trpc.ts
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      session: ctx.session, // narrowed to non-null
      user: ctx.session.user,
    },
  });
});
```

### Impact on Plan v4

- **Add:** `cookieCache` configuration to Better Auth setup (Phase 3)
- **Fix:** Buffer length check in `verifyTelegramAuth`
- **Fix:** Use `onConflictDoUpdate` / `onConflictDoNothing` pattern
- **Fix:** Filter `v !== undefined && v !== null` (not falsy)
- **Add:** Pin `"better-auth": "~1.4.0"` in package.json

---

## 3. Neon WebSocket on Railway

> **Expert:** Kelsey Hightower (DevOps/Infrastructure specialist)

### Critical Issues Found

#### 3.1 `serverExternalPackages` Not Sufficient for ws

Plan v4 has `serverExternalPackages: ["ws"]` but this only prevents bundling — it doesn't ensure the ws binary is included in standalone output.

**Fix:** Add `outputFileTracingIncludes`:

```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ws"],
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./node_modules/ws/**/*"],
    },
  },
  images: {
    remotePatterns: [{ hostname: "nft.fragment.com" }],
  },
};
```

#### 3.2 Edge Runtime Cannot Use ws

Next.js middleware runs in Edge Runtime which has no native WebSocket module. Middleware must NOT import `db`.

**Fix:** All API routes must explicitly set Node.js runtime:

```typescript
// src/app/api/trpc/[trpc]/route.ts
export const runtime = "nodejs"; // Explicit — Edge would break ws

// src/middleware.ts — NEVER import from @/server/db
```

#### 3.3 Connection Pool Configuration

Neon free tier has limited connections. Conservative pool config:

```typescript
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,                      // Conservative for free tier
  idleTimeoutMillis: 30_000,   // Close idle connections after 30s
  connectionTimeoutMillis: 10_000, // Fail fast if can't connect
});

pool.on("error", (err) => {
  console.error("[db] Pool error:", err.message);
});
```

#### 3.4 Graceful Shutdown with Timeout

Railway sends SIGTERM, then SIGKILL after 10 seconds. Must drain pool within that window:

```typescript
// src/server/db/index.ts
async function shutdown(): Promise<void> {
  console.log("[db] Draining pool...");
  const timeout = setTimeout(() => {
    console.error("[db] Pool drain timeout, forcing exit");
    process.exit(1);
  }, 2500); // 2.5s — well within Railway's 10s window

  await pool.end();
  clearTimeout(timeout);
  console.log("[db] Pool drained");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

**Railway env var:** Set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10`

#### 3.5 HTTP Driver as Fallback for Reads

Add HTTP driver export for read-only operations (no pool needed, works anywhere):

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleHTTP } from "drizzle-orm/neon-http";

// HTTP fallback — stateless, no pool, works in Edge
export const dbHttp = drizzleHTTP(neon(env.DATABASE_URL), { schema });
```

#### 3.6 Health Check Should NOT Hit DB

Neon cold starts take up to 5 seconds. Health check that hits DB will timeout on cold start.

```typescript
// src/app/api/health/route.ts
export function GET(): Response {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  });
}
// NO database check — Neon cold start would fail health probes
```

### Impact on Plan v4

- **Fix:** Add `outputFileTracingIncludes` to next.config.ts (Section 1.11)
- **Fix:** Add pool configuration with `max: 5` and timeouts (Section 1.8)
- **Add:** Graceful shutdown handler in db/index.ts
- **Add:** `export const runtime = "nodejs"` to API routes
- **Add:** `dbHttp` export for read-only fallback
- **Add:** `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10` to Railway env vars
- **Fix:** Health check must NOT query database

---

## 4. tRPC + Next.js 15 App Router

> **Expert:** Theo Browne (API design specialist)

### Critical Issues Found

#### 4.1 Use tRPC v11 (Current Stable, Feb 2026)

tRPC v11 is the current stable version. Key API:
- `initTRPC` with `transformer: superjson`
- `createCallerFactory` for server-side calls
- `createHydrationHelpers` for RSC dehydration
- `httpBatchLink` (NOT `httpBatchStreamLink` — cookies issue)

#### 4.2 Use `httpBatchLink`, NOT `httpBatchStreamLink`

`httpBatchStreamLink` has issues with cookies in some cases. Use `httpBatchLink`:

```typescript
// src/lib/trpc/client.ts
links: [
  httpBatchLink({
    transformer: superjson,
    url: getBaseUrl() + "/api/trpc",
    headers: () => {
      const h = new Headers();
      h.set("x-trpc-source", "nextjs-react");
      return h;
    },
  }),
],
```

#### 4.3 `createTRPCContext` Must Be Wrapped in `cache()`

React's `cache()` deduplicates the context creation within a single RSC render pass:

```typescript
// src/server/api/trpc.ts
import { cache } from "react";
import { headers } from "next/headers";

export const createTRPCContext = cache(async () => {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  return { session, db };
});
```

#### 4.4 RSC Server Caller Pattern

```typescript
// src/lib/trpc/server.ts
import "server-only";
import { cache } from "react";
import { createCallerFactory, createTRPCContext } from "@/server/api/trpc";
import { appRouter } from "@/server/api/root";
import { createHydrationHelpers } from "@trpc/react-query/rsc";
import { makeQueryClient } from "./query-client";

export const getQueryClient = cache(makeQueryClient);
const caller = createCallerFactory(appRouter)(createTRPCContext);
export const { trpc, HydrateClient } = createHydrationHelpers<typeof appRouter>(
  caller,
  getQueryClient,
);
```

#### 4.5 Complete File Map (5 tRPC files)

| File | Purpose |
|------|---------|
| `src/server/api/trpc.ts` | Context + initTRPC + procedures (superjson, cache) |
| `src/server/api/root.ts` | App router merging all sub-routers |
| `src/lib/trpc/client.ts` | Client provider + httpBatchLink + 401 handler |
| `src/lib/trpc/server.ts` | RSC caller + HydrateClient |
| `src/lib/trpc/query-client.ts` | **NEW** — makeQueryClient with superjson serialize/deserialize |
| `src/app/api/trpc/[trpc]/route.ts` | Next.js route handler |

#### 4.6 RSC Page Pattern

```typescript
// src/app/(dashboard)/trades/page.tsx
import { trpc, HydrateClient } from "@/lib/trpc/server";
import { TradesPageClient } from "./_components/trades-page-client";

export default async function TradesPage() {
  // Prefetch on server — data dehydrated automatically
  void trpc.trades.list.prefetchInfinite({ limit: 50 });

  return (
    <HydrateClient>
      <TradesPageClient />
    </HydrateClient>
  );
}
```

### Impact on Plan v4

- **New file:** `src/lib/trpc/query-client.ts` — add to Phase 1
- **Fix:** `createTRPCContext` must be wrapped in `cache()`
- **Fix:** Use `httpBatchLink` not `httpBatchStreamLink`
- **Add:** `HydrateClient` RSC pattern to Phase 4 page examples
- **Clarify:** 6 files total for tRPC setup (was 5 in plan)

---

## 5. Tailwind v4 + shadcn/ui

> **Expert:** Dan Abramov (React/CSS specialist)

### Critical Issues Found

#### 5.1 Full Compatibility Confirmed

shadcn/ui fully supports Tailwind CSS v4 since February 2025. `npx shadcn@latest init` auto-detects v4 and generates correct config.

#### 5.2 Architecture Doc CSS is Outdated

The architecture design doc (Section 6) uses old CSS syntax:

```css
/* WRONG (architecture doc) */
@theme {
  --color-primary: hsl(210, 40%, 60%);
}

/* CORRECT (Tailwind v4 + shadcn) */
@theme inline {
  --color-primary: oklch(0.7 0.15 250);
}
```

Key differences:
- `@theme inline` not `@theme` (avoids scope issues)
- oklch color space, not HSL (shadcn default since v4)
- `@custom-variant dark (&:is(.dark *))` replaces `darkMode: 'class'`

#### 5.3 Deprecated Packages

| Old (DON'T use) | New (USE) |
|-----------------|-----------|
| `tailwindcss-animate` | `tw-animate-css` |
| `tailwind-merge@2` | `tailwind-merge@3` (breaking changes) |
| `tailwindcss` PostCSS plugin | `@tailwindcss/postcss` |

`postcss.config.mjs`:
```javascript
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

#### 5.4 Tailwind v3 Fallback (if needed)

If any shadcn component breaks with v4, fallback takes ~10 minutes:
1. `npm install tailwindcss@3 tailwindcss-animate`
2. Create `tailwind.config.ts` with `darkMode: 'class'`
3. Replace `@theme inline` with traditional config
4. Change PostCSS plugin back

**Decision:** Start with v4. Only fallback if specific component breaks during Phase 1.

#### 5.5 All Required Components Compatible

Verified: Button, Dialog, Drawer, AlertDialog, Input, Label, Table, Card, Sonner, Badge, Select, Tabs, Separator — all work with Tailwind v4 + oklch.

### Impact on Plan v4

- **Fix:** Architecture doc CSS section needs update (but not blocking — implementation uses shadcn init output)
- **Fix:** Use `tw-animate-css` not `tailwindcss-animate`
- **Fix:** Use `tailwind-merge@3` not v2
- **Fix:** PostCSS config uses `@tailwindcss/postcss`
- **No code changes needed** — shadcn init handles everything correctly

---

## 6. Cursor Pagination + TanStack Table

> **Expert:** Dan Abramov (React/State specialist)

### Critical Issues Found

#### 6.1 Server-Side Sort Only

For financial data, sorting MUST happen on the server (database) to ensure correctness across pages:

```typescript
// tRPC router
.input(z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  sort: z.enum(["date", "profit", "price"]).default("date"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  filter: z.object({
    giftSlug: z.string().optional(),
    currency: z.enum(["STARS", "TON"]).optional(),
    status: z.enum(["open", "closed"]).optional(),
  }).optional(),
}))
```

**Why not client sort:** Client only has loaded pages — sorting across 500 trades but only 50 loaded would show wrong results.

#### 6.2 Infinite Scroll with IntersectionObserver

```typescript
// Sentinel element pattern
function TradesTable() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    trpc.trades.list.useInfiniteQuery(
      { limit: 50, sort, sortDir, filter },
      { getNextPageParam: (last) => last.nextCursor },
    );

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" }, // Prefetch 200px before visible
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allTrades = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <TanStackTable data={allTrades} columns={columns} />
      <div ref={sentinelRef} />
      {isFetchingNextPage && <LoadingSpinner />}
    </>
  );
}
```

#### 6.3 No Virtualization for MVP

With target ~500 trades per user and 50 per page, `flatMap` of all loaded pages is fine. No need for `@tanstack/react-virtual` in MVP. Add in Phase 6 if user reports > 2000 trades.

#### 6.4 Query Key Auto-Resets on Filter Change

When `sort`, `sortDir`, or `filter` change, React Query automatically invalidates and refetches because they're part of the query input:

```typescript
// No manual invalidation needed — these are query inputs
trpc.trades.list.useInfiniteQuery(
  { limit: 50, sort, sortDir, filter }, // ← changing any of these triggers refetch
  { getNextPageParam: (last) => last.nextCursor },
);
```

#### 6.5 Cursor Never in URL

Cursor is internal to React Query's page tracking. Only sort/filter go to URL via `useSearchParams`:

```typescript
const [searchParams, setSearchParams] = useSearchParams();
const sort = searchParams.get("sort") ?? "date";
const sortDir = searchParams.get("dir") ?? "desc";
```

**Note:** `useSearchParams()` requires a `<Suspense>` boundary in the parent.

#### 6.6 CSV Export Needs Separate Endpoint

Export cannot use loaded pages (may be incomplete). Needs a dedicated tRPC query:

```typescript
// trades router
exportCsv: protectedProcedure
  .input(z.object({ filter: filterSchema.optional() }))
  .query(async ({ ctx, input }) => {
    // Fetch ALL trades (no pagination), format as CSV string
    const trades = await db.query.trades.findMany({
      where: and(eq(trades.userId, ctx.user.id), isNull(trades.deletedAt)),
      orderBy: desc(trades.buyDate),
    });
    return formatTradesAsCsv(trades);
  }),
```

#### 6.7 React.memo on TradeRow

Prevent re-renders when new pages load:

```typescript
const TradeRow = React.memo(function TradeRow({ trade }: { trade: Trade }) {
  // ...render row
});
```

### Impact on Plan v4

- **Clarify:** Server-side sort ONLY — mention explicitly in Phase 4
- **Add:** IntersectionObserver sentinel pattern to Phase 4
- **Add:** CSV export endpoint to Phase 4 (or Phase 5)
- **Add:** `<Suspense>` boundary around pages using `useSearchParams`
- **Confirm:** No virtualization for MVP — revisit at Phase 6

---

## 7. Drizzle ORM VIEW + Migrations

> **Expert:** Markus Winand (Database specialist)

### Critical Issues Found

#### 7.1 `pgView(...).existing()` for Type Safety

Drizzle ORM doesn't support creating VIEWs via `CREATE VIEW` in schema. Use `.existing()` for type-safe queries without Drizzle managing the DDL:

```typescript
// src/server/db/schema.ts
import { pgView } from "drizzle-orm/pg-core";

export const tradeProfits = pgView("trade_profits", {
  id: bigint("id", { mode: "bigint" }).notNull(),
  userId: text("user_id").notNull(),
  giftSlug: text("gift_slug").notNull(),
  tradeCurrency: text("trade_currency").notNull(),
  buyPrice: bigint("buy_price", { mode: "bigint" }),
  sellPrice: bigint("sell_price", { mode: "bigint" }),
  commissionFlatStars: bigint("commission_flat_stars", { mode: "bigint" }),
  commissionPermille: smallint("commission_permille"),
  netProfitStars: bigint("net_profit_stars", { mode: "bigint" }),
  netProfitNanoton: bigint("net_profit_nanoton", { mode: "bigint" }),
  netProfitUsd: numeric("net_profit_usd"),
  buyDate: timestamp("buy_date", { withTimezone: true }),
  sellDate: timestamp("sell_date", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}).existing();
```

`.existing()` means:
- Drizzle provides TypeScript types for SELECT queries
- drizzle-kit does NOT generate migration SQL for this VIEW
- VIEW DDL is managed via custom migration files

#### 7.2 Custom Migration for VIEW

Use `drizzle-kit generate --custom` to create a placeholder migration, then fill in VIEW SQL:

```bash
npx drizzle-kit generate --custom --name=create-trade-profits-view
```

This creates an empty migration file. Fill it with:

```sql
-- drizzle/XXXX_create-trade-profits-view.sql
CREATE OR REPLACE VIEW trade_profits AS
SELECT
  t.id,
  t.user_id,
  t.gift_slug,
  t.trade_currency,
  t.buy_price,
  t.sell_price,
  t.commission_flat_stars,
  t.commission_permille,
  -- Stars profit
  CASE WHEN t.trade_currency = 'STARS' AND t.sell_price IS NOT NULL THEN
    t.sell_price - t.buy_price
    - COALESCE(t.commission_flat_stars, 0)
    - ROUND(t.sell_price * COALESCE(t.commission_permille, 0) / 1000)
  END AS net_profit_stars,
  -- TON profit (nanotons)
  CASE WHEN t.trade_currency = 'TON' AND t.sell_price IS NOT NULL THEN
    t.sell_price - t.buy_price
    - ROUND(t.sell_price * COALESCE(t.commission_permille, 0) / 1000)
  END AS net_profit_nanoton,
  -- USD profit
  CASE WHEN t.sell_price IS NOT NULL AND t.sell_rate_usd IS NOT NULL THEN
    CASE
      WHEN t.trade_currency = 'STARS' THEN
        (t.sell_price - t.buy_price
         - COALESCE(t.commission_flat_stars, 0)
         - ROUND(t.sell_price * COALESCE(t.commission_permille, 0) / 1000))
        * 0.013  -- Fixed Stars/USD rate
      WHEN t.trade_currency = 'TON' THEN
        ((t.sell_price - t.buy_price
          - ROUND(t.sell_price * COALESCE(t.commission_permille, 0) / 1000))
         * t.sell_rate_usd / 1000000000.0)  -- nanoton → TON → USD
    END
  END AS net_profit_usd,
  t.buy_date,
  t.sell_date,
  t.deleted_at
FROM trades t;
```

#### 7.3 Partial Unique Index in schema.ts

Partial indexes CAN be defined in Drizzle schema with `.where()`:

```typescript
// src/server/db/schema.ts
export const uniqueOpenPosition = uniqueIndex("unique_open_position")
  .on(trades.userId, trades.giftSlug)
  .where(sql`${trades.sellDate} IS NULL AND ${trades.deletedAt} IS NULL`);
```

drizzle-kit will generate the correct `CREATE UNIQUE INDEX ... WHERE ...` SQL.

#### 7.4 Migration Workflow — generate + migrate (NOT push)

Plan v4 mentions both `drizzle-kit push` and `drizzle-kit generate` in different places. **Canonical workflow:**

```bash
# Development: generate SQL migration files
npx drizzle-kit generate

# For VIEW: generate custom (empty) migration, fill manually
npx drizzle-kit generate --custom --name=description

# Apply migrations to database
npx drizzle-kit migrate

# push is ONLY for rapid prototyping — NEVER for production
```

`push` skips migration files entirely. For a project with VIEWs and custom SQL, always use `generate + migrate`.

#### 7.5 `CREATE OR REPLACE VIEW` for Idempotent Updates

When modifying the VIEW formula (e.g., adding a column), use `CREATE OR REPLACE VIEW`:

```sql
-- Always safe to run — replaces existing or creates new
CREATE OR REPLACE VIEW trade_profits AS
SELECT ...
```

This is idempotent — no `DROP VIEW IF EXISTS` needed.

### Impact on Plan v4

- **Add:** `pgView(...).existing()` declaration pattern to Phase 2
- **Fix:** Remove `drizzle-kit push` as production workflow — use `generate + migrate`
- **Add:** Custom migration instructions for VIEW
- **Add:** Partial index `.where()` syntax in schema.ts
- **Clarify:** VIEW column types must match actual SQL output types exactly

---

## Implementation Impact Summary

### New Files (Not in Plan v4)

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/trpc/query-client.ts` | 1 | superjson serialize/deserialize for RSC hydration |

### Critical Fixes to Plan v4

| # | Section | Fix |
|---|---------|-----|
| 1 | 1.8 db/index.ts | Add `max: 5`, `idleTimeoutMillis`, `connectionTimeoutMillis` to Pool |
| 2 | 1.8 db/index.ts | Add graceful shutdown handler (SIGTERM/SIGINT) |
| 3 | 1.8 db/index.ts | Add `dbHttp` export for HTTP fallback |
| 4 | 1.9 trpc.ts | Wrap `createTRPCContext` in `cache()` |
| 5 | 1.11 next.config | Add `outputFileTracingIncludes` for ws |
| 6 | 1.11 next.config | Missing — add `export const runtime = "nodejs"` to API routes |
| 7 | 2.1 schema.ts | Add `pgView(...).existing()` for trade_profits |
| 8 | 2.x migration | Use `drizzle-kit generate --custom` for VIEW, not push |
| 9 | 3.x auth | Add `cookieCache` to Better Auth config |
| 10 | 3.x auth | Pin `"better-auth": "~1.4.0"` (tilde) |
| 11 | 3.x auth | Buffer length check before `timingSafeEqual` |
| 12 | 3.x auth | Use `onConflictDoUpdate` / `onConflictDoNothing` |
| 13 | 3.x auth | Filter: `v !== undefined && v !== null` |
| 14 | Phase 1 deps | Use `tw-animate-css` not `tailwindcss-animate` |
| 15 | Phase 1 deps | Use `tailwind-merge@3` |
| 16 | currencies.ts | `formatStars` must use `Intl.NumberFormat(bigint)` |

### Architecture Doc Fixes Needed

| File | Fix |
|------|-----|
| `architecture-design.md` Section 3 | `.mapWith(Number)` → `.mapWith(BigInt)` |
| `architecture-design.md` Section 6 | `@theme {}` + HSL → `@theme inline` + oklch |
| `architecture-design.md` | Filter logic: use `v !== undefined && v !== null` |

### Railway Environment Variables to Add

```
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10
```

---

## Updated Code Patterns

### Pattern 1: Complete db/index.ts

```typescript
import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleWS } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleHTTP } from "drizzle-orm/neon-http";
import ws from "ws";
import * as schema from "./schema";
import { env } from "@/env";

// WebSocket for Node.js runtime (Railway)
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  console.error("[db] Pool error:", err.message);
});

// Primary: WebSocket pool (transactions, writes)
export const db = drizzleWS(pool, { schema });

// Fallback: HTTP (stateless reads, works in Edge)
export const dbHttp = drizzleHTTP(neon(env.DATABASE_URL), { schema });

// Graceful shutdown
async function shutdown(): Promise<void> {
  console.log("[db] Draining pool...");
  const timeout = setTimeout(() => {
    console.error("[db] Pool drain timeout, forcing exit");
    process.exit(1);
  }, 2500);
  await pool.end();
  clearTimeout(timeout);
  console.log("[db] Pool drained");
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
```

### Pattern 2: Complete tRPC Context

```typescript
import { cache } from "react";
import { headers } from "next/headers";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const createTRPCContext = cache(async () => {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  return { session, db };
});

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const createCallerFactory = t.createCallerFactory;
export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { session: ctx.session, user: ctx.session.user },
  });
});
```

### Pattern 3: RSC + HydrateClient

```typescript
// src/app/(dashboard)/trades/page.tsx
import { trpc, HydrateClient } from "@/lib/trpc/server";
import { TradesPageClient } from "./_components/trades-page-client";

export default async function TradesPage() {
  void trpc.trades.list.prefetchInfinite({ limit: 50 });
  return (
    <HydrateClient>
      <TradesPageClient />
    </HydrateClient>
  );
}
```

### Pattern 4: Telegram Auth Verification

```typescript
import crypto from "crypto";

export function verifyTelegramAuth(
  data: Record<string, string>,
  botToken: string,
): boolean {
  const { hash, ...rest } = data;
  if (!hash) return false;

  const checkString = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  const computed = Buffer.from(hmac, "hex");
  const received = Buffer.from(hash, "hex");

  if (computed.length !== received.length) return false;
  return crypto.timingSafeEqual(computed, received);
}
```
