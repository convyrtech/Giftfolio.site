# GIFTSSITE — Telegram Gift Trading Tracker

Steamfolio.com clone for tracking Telegram gift trade PnL. Dark theme, table-centric, inline editing.

## Rules
1. **NO `any`, NO `@ts-ignore`** — pre-commit hook blocks these. Use `unknown` + narrowing
2. **NO guessing** — read code, check docs (Context7/Tavily), or ask the user
3. **NO skipping plan items** — implement every item or document WHY it's deferred
4. **NO "it works" without proof** — paste actual command output, not words
5. **Code reviewer subagent** on changed files after every feature — fresh context catches your bias
6. **`/clear` between tasks** — stale context = stale thinking

## Verification (before every commit)
```bash
npx tsc --noEmit && npm run lint && npm run build
```
Paste last 5 lines of output. No paste = not verified.
Pre-commit hook enforces tsc + lint + blocks `as any`.

## Workflow
**STAR** → **THINK** (read code) → **PLAN** (file/function changes) → **EXECUTE** (one sub-task at a time) → **AUDIT** (types? tests? matches plan?)

One task at a time. Complete → audit → next.

## Tech Stack
- **Next.js 16** (App Router) + **tRPC** + **TypeScript** strict
- **Drizzle ORM** + **PostgreSQL** (Neon serverless)
- **Better Auth** + Telegram Login Widget
- **TanStack Table v8** + **shadcn/ui** + **Tailwind CSS v4**
- **Railway** (app) + **Neon** (DB) — separate providers

## Commands
```
npm run dev          # Dev server (turbopack)
npm run build        # Production build
npm run lint         # ESLint
npm run format       # Prettier
npm test             # Vitest
npx drizzle-kit push # Push schema to DB
npx drizzle-kit generate # Generate migration
npx drizzle-kit studio   # DB browser
```

## Verification (run before every commit)
```
npx tsc --noEmit && npm run lint && npm test && npm run build
```

## MCP Servers
**Core (always loaded):** Context7 (library docs), Tavily (web research), Serena (semantic code)
**Project-specific:** Drizzle, next-devtools, playwright
**On-demand (load when needed):** tailwindcss, tanstack, better-auth, neon

> Keep active MCP count low — each server eats ~2K tokens of tool definitions from context window.

## Skills (invoke via Skill tool)
- **brainstorming** → before new features; **writing-plans** → before multi-step work
- **test-driven-development** → when implementing; **systematic-debugging** → when debugging
- **verification-before-completion** → before claiming done; **code-review** → after features
- **subagent-driven-development** → for parallel independent tasks in same session
- **using-git-worktrees** → for feature isolation when working on multiple branches

## Key Rules
- Stars = BIGINT (integers), TON = BIGINT nanotons (1e9) — branded types, use type system to prevent mixing
- Commission: DUAL model (flat Stars + permille ‰). TON trades use only permille
- Profit computed via VIEW `trade_profits` — store raw data, compute derived values
- All PnL queries: `AT TIME ZONE user_settings.timezone`
- Next.js 16: `cookies()`, `headers()`, `params` are async — always await

## Key APIs
- Gift images: `nft.fragment.com/gift/{name_lower}-{number}.webp`
- Gift URLs: `t.me/nft/{PascalName}-{Number}` → split on LAST hyphen
- Metadata + floor prices: `giftasset.pro/api/v1/` (no auth)
- Attributes: `api.changes.tg` (no auth)

## Key Patterns (learned from audit)
- shadcn Select `onValueChange`: validate with `includes()` before narrowing
- TanStack Table meta: module augmentation `declare module "@tanstack/react-table"` for type-safe meta
- SQL toggles: atomic `sql\`NOT ${column}\`` in single UPDATE (TOCTOU-safe)
- Dialogs: lift to parent (single instance), pass callbacks via table meta
- Neon transactions: use pool driver (neon-serverless), not neon-http
- React Compiler: keep ref access out of render, derive state without useEffect
- Component remount: use `key` prop change to reset internal state (e.g. dialog pre-fill)
- aria-required: always string `"true"` / `"false"`

## Architecture
Full design: `docs/plans/2026-02-19-architecture-design.md`
See `.claude/rules/` for code conventions, security rules, and patterns.

## Memory
- Serena project memories: `read_memory` tool (project-overview, session-state, stack-patterns, etc.)
- Auto-memory: `C:/Users/paxalb/.claude/projects/E--giftsite/memory/MEMORY.md`
- Read relevant memories at session start for context recovery

## Implementation Status
- Phases 1-13: COMPLETE (core, auth, DB, UI, analytics, CSV import, wallet import, mobile, theme)
- Security audit (103 issues): ALL FIXED
- **Next:** Remaining features plan at `docs/plans/2026-03-05-remaining-features-plan.md`
  - Phase A: Inline editing + bulk actions (PRIORITY)
  - Phase B-G: Collections, analytics, Excel, i18n, stubs

## Context Management
- Use `/clear` between unrelated tasks to keep context fresh
- Delegate verbose operations (test runs, large file analysis) to subagents
- Limit parallel subagents to 3 for optimal results
- Use git worktrees for parallel feature branches (skill: `using-git-worktrees`)
