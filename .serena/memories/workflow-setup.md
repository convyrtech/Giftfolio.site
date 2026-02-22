# GIFTSSITE — Full Workflow Setup

## Directory Structure
```
D:\GIFTSSITE\
├── .claude/
│   ├── settings.json          # Permissions, hooks (auto-format on save)
│   ├── agents/
│   │   ├── nextjs-expert.md   # Next.js App Router, RSC, tRPC expert
│   │   ├── db-architect.md    # PostgreSQL, Drizzle, schema, queries
│   │   ├── ui-designer.md     # Tailwind, shadcn/ui, dark theme design
│   │   ├── telegram-gifts.md  # Gift URL parsing, Fragment CDN, APIs
│   │   └── code-reviewer.md   # Type safety, security, perf review
│   └── commands/
│       ├── add-component.md   # /add-component — create shadcn component
│       ├── add-trade-field.md # /add-trade-field — add DB field + update all code
│       ├── review.md          # /review — comprehensive code review
│       ├── deploy-check.md    # /deploy-check — pre-deploy checklist
│       ├── parse-gift.md      # /parse-gift — test gift URL parsing
│       └── session-save.md    # /session-save — save state to Serena
├── .mcp.json                  # Project MCP servers (next-devtools, drizzle, tailwind)
├── CLAUDE.md                  # Project conventions and rules
├── docs/plans/
│   └── 2026-02-19-architecture-design.md  # Full architecture document
└── src/                       # Source code (to be initialized with Next.js)
```

## MCP Servers
### Global (user-level):
- Tavily (HTTP remote) — AI search
- Context7 — fresh docs
- Playwright — browser automation
- Sequential Thinking — structured reasoning
- Serena — code intelligence + memory

### Project-level (.mcp.json):
- next-devtools-mcp — Next.js dev tools
- drizzle-mcp — Drizzle ORM tools
- tailwindcss-mcp-server — Tailwind docs

## Custom Agents (5)
1. nextjs-expert — App Router, RSC, Server Actions, tRPC
2. db-architect — PostgreSQL, Drizzle schema, query optimization
3. ui-designer — Tailwind, shadcn/ui, dark theme matching steamfolio
4. telegram-gifts — Gift URL parsing, Fragment CDN, metadata APIs
5. code-reviewer — Type safety, security, performance checklist

## Slash Commands (6)
1. /add-component — create new shadcn/ui component
2. /add-trade-field — add field to DB + all related code
3. /review — comprehensive code review on changes
4. /deploy-check — pre-deployment checklist (types, lint, build, audit)
5. /parse-gift — test gift URL parsing pipeline
6. /session-save — save state to Serena memory

## Hooks
- PostToolUse (Write|Edit): auto-format with Prettier
- Stop: reminder to update Serena session-state

## Permissions
- Allow: Read/Edit/Write in src/, public/, docs/, .claude/
- Allow: npm, npx, git (non-destructive), node, ls, mkdir
- Deny: .env files, rm -rf, git push --force, git reset --hard, DROP TABLE/DATABASE
