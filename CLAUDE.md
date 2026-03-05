# GIFTSSITE — Telegram Gift Trading Tracker

Steamfolio.com clone for tracking Telegram gift trade PnL. Dark theme, table-centric.

## IRON RULES (NON-NEGOTIABLE — EVERY SESSION)
1. **NO LAZINESS** — never cut corners, never skip steps, never produce half-measures
2. **FACTS ONLY** — no assumptions; every decision must be based on verified facts from code, docs, or research
3. **RESEARCH OR ASK** — if info is insufficient: use Tavily/Context7 OR ask the user; never guess
4. **FULL CAPACITY** — work at maximum capacity; if a heavy tool gives better results, use it
5. **NO TOKEN ECONOMY** — never sacrifice quality to save tokens
6. **SELF-REVIEW** — after every feature/phase: review ALL changed files with code-reviewer agent
7. **VERIFY BEFORE DONE** — run full verification chain before any "done" claim

## MANDATORY WORKFLOW FOR EVERY TASK

### STAR (verbalize before EVERY task):
- **S**ituation — current state of code/system
- **T**ask — what exactly needs to be done and why
- **A**ction — concrete steps to be taken
- **R**esult — what success looks like (measurable)

### 6-Step Protocol (strict order, never skip):
1. **THINK** — read all relevant code, understand full scope and dependencies
2. **PLAN** — specific file/function changes written out
3. **CHECKLIST** — explicit numbered list of every sub-task
4. **SELF-AUDIT plan** — review for gaps, risks, edge cases BEFORE writing code
5. **EXECUTE** — strictly ONE sub-task at a time, no context switching
6. **SELF-AUDIT result** — after each sub-task: types? edge cases? tests? matches plan?

**ONE TASK AT A TIME — complete → audit → next. No parallel work.**

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

## MCP Workflow Rules
- **Context7** — ALWAYS use for library API docs (Next.js, Drizzle, shadcn, TanStack)
- **Tavily** — web research, NOT generic WebSearch
- **drizzle-mcp** — schema changes and migrations
- **next-devtools** — debugging Next.js build/runtime errors
- **tailwindcss** — Tailwind CSS docs and conversion
- **tanstack** — TanStack Table/Query documentation
- **better-auth** — auth setup and configuration docs
- **playwright** — visual testing and gift page scraping (added to .mcp.json)
- **neon** — database management, requires NEON_API_KEY env var
- **planning-with-files** skill — ALWAYS use for multi-step tasks

## Skills Workflow
- **brainstorming** — ALWAYS before any new feature/component
- **test-driven-development** — ALWAYS when implementing features
- **systematic-debugging** — ALWAYS when debugging
- **verification-before-completion** — ALWAYS before claiming done
- **frontend-design** — for UI/design work
- **planning-with-files** — for complex multi-step tasks
- **writing-plans** — for planning new phases
- **code-review** — after PRs

## Key Rules
- Stars = BIGINT (integers), TON = BIGINT nanotons (1e9) — branded types, never mix
- Commission: DUAL model (flat Stars + permille ‰). TON trades use only permille
- Profit NEVER stored — computed via VIEW `trade_profits`
- All PnL queries: `AT TIME ZONE user_settings.timezone`
- Next.js 15/16: `cookies()`, `headers()`, `params` are async — always await

## Key APIs
- Gift images: `nft.fragment.com/gift/{name_lower}-{number}.webp`
- Gift URLs: `t.me/nft/{PascalName}-{Number}` → split on LAST hyphen
- Metadata + floor prices: `giftasset.pro/api/v1/` (no auth)
- Attributes: `api.changes.tg` (no auth)

## Key Patterns (learned from audit)
- shadcn Select `onValueChange`: runtime narrowing with `includes()`, NEVER `as` cast
- TanStack Table meta: module augmentation `declare module "@tanstack/react-table"` for type-safe meta
- SQL toggles: `sql\`NOT ${column}\`` for atomic TOCTOU-safe toggle, NEVER SELECT→UPDATE
- Dialogs: lift to parent (single instance), pass callbacks via table meta — NOT per-row
- Neon transactions: only work with pool driver (neon-serverless), NOT neon-http
- React Compiler: no ref read/write during render, no setState in useEffect for derived state
- aria-required: always string `"true"` / `"false"`, never boolean
- Self-review before every commit — catches 2-3 bugs on average

## Architecture
Full design: `docs/plans/2026-02-19-architecture-design.md`
See `.claude/rules/` for code conventions, security rules, and patterns.

## Memory
- Persistent memory: `C:/Users/paxalb/.claude/projects/E--/memory/MEMORY.md`
- Deep project details: `C:/Users/paxalb/.claude/projects/E--/memory/giftfolio-project.md`
- ALWAYS read memory at session start via planning-with-files session-catchup

## Implementation Status
- Phases 1-13: ALL COMPLETE (core, auth, DB, UI, analytics, CSV import, mobile, theme)
- Phase 14: Export formats (Excel + PDF) — optional, NOT started
- Zero-trust security audit (103 issues) — ALL FIXED in Phases 7A-7D
