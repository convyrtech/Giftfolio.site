# Code Review

Run a comprehensive code review on recent changes.

## Instructions

1. Check git diff for recent changes: `git diff HEAD~1` or staged changes
2. Launch the code-reviewer agent on all changed files
3. Launch the db-architect agent if any schema/query changes
4. Launch the nextjs-expert agent if any page/route changes
5. Summarize all findings grouped by severity (CRITICAL → WARNING → INFO)
6. For each CRITICAL issue, provide an immediate fix

## What to Review
- Type safety (no `any`, proper null handling)
- Security (auth guards, input validation, no injection)
- Performance (indexes, unnecessary re-renders, image optimization)
- Next.js patterns (RSC vs client, Server Actions, metadata)
- Tailwind/UI consistency (dark theme, design system colors)
- Commission calculation correctness
- Gift URL parsing edge cases
