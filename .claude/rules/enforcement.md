# Enforcement — What Actually Prevents Laziness

## Mechanical (automated, can't fake)
- **Pre-commit hook** blocks: tsc errors, lint errors, `as any`, `@ts-ignore` in staged files
- **`npx tsc --noEmit`** catches type holes before they ship
- These run automatically. No honor system involved.

## Process (requires discipline but verifiable)
- After code changes: paste `npx tsc --noEmit && npm run lint && npm run build` output
- After features: spawn code-reviewer subagent (separate context = catches your blind spots)
- After UI changes: open browser, click through, describe what happened

## Laziness Patterns That Slip Through
1. `as SomeType` to silence compiler instead of fixing the actual type mismatch
2. Skipping a plan item and hoping nobody notices
3. Copy-pasting from another component without adapting to new context
4. Writing "it works" without actually testing
5. Adding dead code "just in case" instead of deleting what's unused
6. Nominal self-review (skim for 2 seconds, say "looks good")

For each: the fix is doing the work. There's no shortcut rule that prevents these — only the habit of re-reading your own diff line by line before committing.
