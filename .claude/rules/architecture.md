# Architecture Patterns

## Project Structure
```
src/
  app/                    # Next.js 15 App Router pages
    (auth)/               # Auth group (login)
    (dashboard)/          # Protected group (trades, settings)
      trades/
        _components/      # Page-specific components
        actions/           # Server Actions
        page.tsx
      settings/page.tsx
    api/
      trpc/[trpc]/        # tRPC handler
      auth/[...all]/      # Better Auth handler
    layout.tsx
    globals.css           # Tailwind v4 @import + @theme
  server/
    api/
      root.ts             # tRPC app router
      trpc.ts             # tRPC context + procedures
      routers/            # tRPC routers by domain (trades, auth, gifts, stats, market)
    auth/
      index.ts            # Better Auth config
      telegram-plugin.ts  # Custom Telegram Login Widget plugin
    db/
      index.ts            # Drizzle client (Neon serverless)
      schema.ts           # Drizzle schema (single file)
  components/
    ui/                   # shadcn/ui components
    providers/            # React context providers
  lib/
    trpc/                 # tRPC client + server helpers
    utils.ts              # cn() and shared utilities
    pnl-engine.ts         # Pure PnL calculation functions (timezone + currency aware)
    gift-parser.ts        # URL parsing + attribute types
    currencies.ts         # Branded types: Stars, NanoTon, formatters
  hooks/                  # Custom React hooks
```

## Data Flow
- RSC pages → tRPC server caller (direct DB access, no HTTP)
- Client components → tRPC React Query hooks (HTTP via /api/trpc)
- Mutations → Server Actions or tRPC mutations
- PnL calculations → pure functions in pnl-engine.ts, SQL VIEW `trade_profits`
- Floor prices → giftasset.pro (no auth, cached 1h in memory)

## Commission Model
- DUAL model: flat fee (Stars) + permille (‰ percentage)
- Global default per user + per-trade override for BOTH
- Resolution: `COALESCE(trade.commission_flat_stars, user.default_commission_stars)`
- Resolution: `COALESCE(trade.commission_permille, user.default_commission_permille)`
- Stars profit = sell - buy - flat - ROUND(sell * permille / 1000)
- TON profit = sell - buy - ROUND(sell * permille / 1000)  (no flat, different currency)

## Currency Model
- Stars = BIGINT (whole integers, no decimals)
- TON = BIGINT in nanotons (1 TON = 1,000,000,000)
- USD = never stored, convert in UI via exchange rate
- Each trade has `trade_currency` = 'STARS' or 'TON'
- Branded TypeScript types prevent mixing: `Stars`, `NanoTon`

## Database
- PostgreSQL via Neon (serverless, @neondatabase/serverless driver)
- Drizzle ORM — SQL-first, typed aggregations, neon-http driver
- Migrations: `drizzle-kit generate` + `drizzle-kit migrate`
- NEVER store computed values (profit) — always via VIEW `trade_profits`
- Timezone: `user_settings.timezone` (IANA), all date queries use `AT TIME ZONE`
- Deployment: Neon = DB, Railway = app only
