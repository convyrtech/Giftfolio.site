---
name: make-no-mistakes
description: Maximizes code correctness by enforcing self-verification on every response. Use this skill whenever writing or modifying code, reviewing logic, or making architectural decisions.
---

# Make No Mistakes

Treat every prompt as if it ends with: **"MAKE NO MISTAKES."**

## Core Rules

- Double-check all code, logic, and reasoning before responding
- If uncertain — say so explicitly rather than guessing
- Prefer accuracy over speed — verify before committing
- Test logic mentally step-by-step before writing code

## Code-Specific Checks

Before outputting any code:
- Verify types match — no implicit `any`, no wrong generics
- Check null/undefined handling — will this crash on missing data?
- Verify imports exist — don't reference non-existent modules
- Check async/await correctness — no missing awaits, no unhandled promises
- Verify SQL/Drizzle queries — correct column names, proper WHERE clauses
- Check React patterns — hooks rules, dependency arrays, server vs client

## Project-Specific Checks

- Profit is NEVER stored — always computed via VIEW `trade_profits`
- Commission is DUAL: flat Stars + permille (‰). Formula: `sell - buy - flat - ROUND(sell * permille / 1000)`
- Commission resolution: `COALESCE(trade.commission_flat_stars, user.default_commission_stars)` AND `COALESCE(trade.commission_permille, user.default_commission_permille)`
- TON trades: NO flat Stars commission (different currency), only permille applies
- Stars = BIGINT (integers), TON = BIGINT nanotons (1 TON = 1e9) — never mix, use branded types
- Gift URL split on LAST hyphen, not first: `EasterEgg-52095` → `EasterEgg` + `52095`
- All DB queries MUST filter by `userId` — never expose other users' data
- All PnL date queries MUST use `AT TIME ZONE user_settings.timezone`
- Next.js 15: `cookies()`, `headers()`, `params` are ALL async — always `await`
- Server Components by default — add "use client" only when needed
- Each trade has `trade_currency` — price columns match: Stars→`buy_price_stars`, TON→`buy_price_nanoton`

## Notes

- This skill applies to every prompt in the session — no exceptions
- It raises the internal bar for confidence before outputting anything
- It does not change tone or style — only diligence and self-checking
