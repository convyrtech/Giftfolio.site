# Security Rules

## Authentication
- Two-layer auth: middleware (redirect) + `requireAuth()` per route handler
- NEVER trust client-side auth state alone
- Telegram Login verification: HMAC-SHA256 with SHA256(bot_token), timingSafeEqual
- Session tokens: httpOnly, secure, sameSite=lax

## Data Access
- ALWAYS filter by `userId` in DB queries — NEVER return other users' data
- Use tRPC `protectedProcedure` for all authenticated endpoints
- Validate ALL inputs with Zod schemas at the tRPC layer
- Currency CHECK constraints: ensure price columns match `trade_currency`
- Branded types (`Stars`, `NanoTon`) prevent mixing currencies in TypeScript

## Environment
- NEVER commit `.env`, `.env.local`, or any file with secrets
- NEVER log secrets, tokens, or connection strings
- Use `process.env` only in server code, `NEXT_PUBLIC_` prefix for client

## Prevention
- NEVER use `dangerouslySetInnerHTML`
- NEVER construct SQL manually — use Drizzle query builder
- NEVER use `eval()` or `new Function()`
- Sanitize all user inputs before display
