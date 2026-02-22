# Deploy Check

Pre-deployment checklist before pushing to production.

## Instructions

Run all checks sequentially, stop on first failure:

1. **TypeScript**: `npx tsc --noEmit` — no type errors
2. **Lint**: `npm run lint` — no lint errors
3. **Build**: `npm run build` — successful production build
4. **Schema**: `npx drizzle-kit check` — migrations are in sync
5. **Environment**: Check `.env.example` has all required vars
6. **Security audit**: `npm audit --production` — no critical vulnerabilities
7. **Bundle size**: Check `.next/analyze` or build output for excessive bundles

## Report Format
```
Pre-deploy Check Results:
✅ TypeScript: passed
✅ Lint: passed
✅ Build: passed (X.Xs)
✅ Schema: in sync
✅ Env vars: all documented
⚠️ Audit: N warnings (describe)
📦 Bundle: XXkB total JS
```

If any check fails, provide fix instructions and do NOT approve deployment.
