# Claude Code Workflow Best Practices (2026)

## CLAUDE.md Rules
- Keep under 100 lines — each line competes for LLM attention
- Use progressive disclosure: details in .claude/rules/ and docs/
- Only universally applicable rules — no situational instructions
- Imperative style: "ALWAYS", "NEVER", not descriptions
- Code style → delegate to linters/hooks, not CLAUDE.md

## .claude/rules/ Directory
Auto-loaded at equal priority with CLAUDE.md. Split by domain:
- code-conventions.md — naming, TypeScript, React, imports, styling
- security.md — auth, data access, env, prevention
- architecture.md — project structure, data flow, commission model, DB
- compaction-survival.md — recovery protocol after context loss

## Hooks (13 events available)
- PostToolUse (Write|Edit) → auto-format with Prettier
- PreToolUse (Bash) → block dangerous commands (exit 2 = block)
- Stop → reminder to update Serena memory
- UserPromptSubmit → validation/context injection
- PreCompact → save state before compaction (not yet supported in our setup)
- SessionStart → load context (not yet supported in our setup)

## Agents (5 custom)
- nextjs-expert — App Router, RSC, Server Actions
- db-architect — PostgreSQL, Drizzle, migrations
- ui-designer — Tailwind, shadcn/ui, dark theme
- telegram-gifts — Gift URL parsing, Fragment CDN
- code-reviewer — Read-only review agent

## Commands (6 custom)
- /add-component — Create shadcn/ui component
- /add-trade-field — Add DB field + update all code
- /review — Comprehensive code review
- /deploy-check — Pre-deployment checklist
- /parse-gift — Test gift URL parsing
- /session-save — Save state to Serena

## Context Recovery Protocol
1. activate_project("GIFTSSITE")
2. read session-state memory
3. list_memories for relevant context
4. Resume work
