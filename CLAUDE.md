# GIFTSSITE — Telegram Gift Trading Tracker

Steamfolio.com clone for tracking Telegram gift trade PnL. Dark theme, table-centric.

## Tech Stack
- **Next.js 15** (App Router) + **tRPC** + **TypeScript** strict
- **Drizzle ORM** + **PostgreSQL** (Neon serverless)
- **Better Auth** + Telegram Login Widget
- **TanStack Table v8** + **shadcn/ui** + **Tailwind CSS v4**
- **Railway** (app) + **Neon** (DB) — separate providers

## Commands
```
npm run dev          # Dev server
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier
npx drizzle-kit push # Push schema to DB
npx drizzle-kit generate # Generate migration
npx drizzle-kit studio   # DB browser
```

## MCP Workflow Rules
- **Context7** — ALWAYS use for library API docs (Next.js, Drizzle, shadcn, TanStack)
- **Tavily** — web research, NOT generic WebSearch
- **Serena** — ALL memory persistence, activate at session start
- **drizzle-mcp** — schema changes and migrations
- **next-devtools** — debugging Next.js build/runtime errors
- **tailwindcss** — Tailwind CSS docs and conversion
- **tanstack** — TanStack Table/Query documentation
- **better-auth** — auth setup and configuration docs
- **Playwright** — visual testing and gift page scraping
- **Neon** — database management (after setup)
- **Railway** — deployment management (after setup)

## Key Rules
- Stars = BIGINT (integers), TON = BIGINT nanotons (1e9) — branded types, never mix
- Commission: DUAL model (flat Stars + permille ‰). TON trades use only permille
- Profit NEVER stored — computed via VIEW `trade_profits`
- All PnL queries: `AT TIME ZONE user_settings.timezone`
- Next.js 15: `cookies()`, `headers()`, `params` are async — always await

## Key APIs
- Gift images: `nft.fragment.com/gift/{name_lower}-{number}.webp`
- Gift URLs: `t.me/nft/{PascalName}-{Number}` → split on LAST hyphen
- Metadata + floor prices: `giftasset.pro/api/v1/` (no auth)
- Attributes: `api.changes.tg` (no auth)

## Architecture
Full design: `docs/plans/2026-02-19-architecture-design.md`
See `.claude/rules/` for code conventions, security rules, and patterns.

## Memory (Serena)
- Project name: `GIFTSSITE`
- ALWAYS read `session-state` memory at session start
- ALWAYS update after milestones
- Key memories: project-overview, telegram-gifts-api, telegram-marketplaces-api, plan-audit-results, steamfolio-reference
