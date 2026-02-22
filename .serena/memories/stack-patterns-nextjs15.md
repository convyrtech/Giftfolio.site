# Next.js 15 Stack Patterns (Feb 2026)

## Project Structure
```
src/
  app/                    # Pages (App Router)
    (auth)/               # Auth group
    (dashboard)/          # Protected group
      trades/_components/ # Page-specific components
    api/trpc/[trpc]/      # tRPC handler
    api/auth/[...all]/    # Better Auth handler
  server/
    api/root.ts           # tRPC app router
    api/trpc.ts           # tRPC context + procedures
    api/routers/          # Domain routers
    auth/                 # Better Auth config
    db/index.ts           # Drizzle client
    db/schema.ts          # Drizzle schema
  components/ui/          # shadcn/ui
  components/providers/   # Context providers
  lib/trpc/              # tRPC client + server
  lib/pnl-engine.ts      # Pure PnL functions
  hooks/                 # Custom hooks
```

## Key Patterns

### Drizzle + Neon
- Driver: `@neondatabase/serverless` with `neon-http` for queries
- Connection: pooler URL with `?sslmode=require`
- Dev: `drizzle-kit push`, Prod: `drizzle-kit generate` + `migrate`

### Better Auth + Telegram
- `drizzleAdapter(db, { provider: "pg" })`
- Telegram Login: HMAC-SHA256 verification, manual session creation
- Cookie: `better-auth.session_token`, httpOnly, secure, sameSite=lax

### tRPC
- Server caller via `createCallerFactory` for RSC (no HTTP round-trip)
- Client via `createTRPCReact` + React Query
- API route: `fetchRequestHandler` in route handler
- Context: session from Better Auth headers

### TanStack Table + tRPC
- `manualSorting`, `manualPagination`, `manualFiltering` = true
- Map TanStack sorting state → tRPC query params
- Debounce search input (300ms)

### Tailwind v4
- `@import "tailwindcss"` instead of @tailwind directives
- `@theme {}` for custom tokens (no tailwind.config.ts needed)
- `@tailwindcss/postcss` plugin
- Auto content detection (no content config)

### shadcn/ui
- Style: new-york, CSS variables, zinc base
- Dark theme via next-themes (`attribute="class"`, `defaultTheme="system"`)
- `npx shadcn@latest add` for components

### Railway Deploy
- `output: "standalone"` in next.config.ts (critical!)
- Start: `npm run db:migrate:prod && npm start`
- Health check: `/api/health`
- Env: DATABASE_URL (Neon pooler), BETTER_AUTH_SECRET, TELEGRAM_BOT_TOKEN
