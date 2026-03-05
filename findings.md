# Findings — Giftfolio.site

> Updated: 2026-03-05

## Project State

- All Phases 1-13 COMPLETE
- Phase 14 (Export: Excel + PDF) — optional, not started
- Latest commit: f1a57f7 — visual redesign (TON-first, semantic colors)
- ~86 Vitest tests passing

## MCP Servers Research Results

### Already in .mcp.json
| Server | Package | Purpose |
|--------|---------|---------|
| next-devtools | next-devtools-mcp@latest | Next.js debug |
| drizzle | drizzle-mcp | Schema/migrations |
| tailwindcss | tailwindcss-mcp-server | Tailwind docs |
| tanstack | @tanstack/cli mcp | TanStack docs |
| better-auth | @better-auth/mcp | Auth docs |

### Added to .mcp.json
| Server | Package | Purpose |
|--------|---------|---------|
| playwright | @playwright/mcp@latest | Visual testing + scraping |
| neon | @neondatabase/mcp-server-neon | DB management (needs NEON_API_KEY) |

### Global (Claude Code settings)
| Server | Purpose |
|--------|---------|
| Context7 | Library API docs |
| Tavily | Web research |

### Researched but NOT added (reasons)
| Server | Reason |
|--------|--------|
| Railway MCP | Community package, low downloads, needs Railway CLI installed; add when deployment work starts |
| GitHub MCP | Public preview, known bugs (crashes, pagination); add when PR/issues workflow needed |
| Serena | Requires `uvx` + Python uv; replaced by planning-with-files + MEMORY.md approach |

## Skills Available (most relevant for this project)

| Skill | Trigger |
|-------|---------|
| brainstorming | Before ANY new feature |
| test-driven-development | When implementing features |
| systematic-debugging | Any bug/test failure |
| verification-before-completion | Before claiming done |
| frontend-design | UI/design work |
| planning-with-files | Multi-step tasks (already active) |
| writing-plans | New phase planning |
| requesting-code-review | After implementation |

## Architecture Summary

- **DB:** PostgreSQL via Neon (serverless). VIEW `trade_profits` for all PnL.
- **Auth:** Better Auth + custom Telegram Login Widget plugin
- **API:** tRPC with React Query. Protected procedures for all authenticated endpoints.
- **UI:** TanStack Table v8, shadcn/ui, Tailwind v4. Dark theme default.
- **Types:** Stars=BIGINT integers, TON=BIGINT nanotons (1e9). Branded types.
- **Commission:** DUAL model — flat Stars + permille. TON = permille only.

## Key External APIs
- Floor prices: `giftasset.pro/api/v1/` (no auth, cache 1h)
- Attributes: `api.changes.tg` (no auth)
- Images: `nft.fragment.com/gift/{name_lower}-{number}.webp`
