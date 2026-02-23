# Code Conventions

## Naming
- Components: PascalCase (`GiftCard.tsx`)
- Utilities/hooks: camelCase (`useDebounce.ts`, `parseGiftUrl.ts`)
- Database tables/columns: snake_case (`buy_price`, `sell_date`)
- Constants: UPPER_SNAKE_CASE (`MAX_IMPORT_ROWS`)
- Types/interfaces: PascalCase with `I` prefix NEVER used

## TypeScript
- NEVER use `any` — use `unknown` + type narrowing
- Prefer `interface` for object shapes, `type` for unions/intersections
- All functions must have explicit return types in server code
- Use Zod for runtime validation at system boundaries

## React / Next.js
- Server Components by default — add "use client" only for interactivity
- Prefer Server Actions for mutations over API routes
- Co-locate components with their pages in `_components/` subdirectories
- NEVER use `useEffect` for data fetching — use tRPC + React Query

## Imports
- Absolute imports via `@/` alias
- Order: react → next → external libs → internal → types → styles
- NEVER use barrel exports (index.ts re-exports) — direct imports only

## Bug Fix Protocol
When fixing a bug, ALWAYS search the entire codebase for the same pattern before closing:
- `Record<string, unknown>` in Drizzle `.set()` → use `Partial<TableType>`
- `throw new Error(...)` in tRPC routers → use `TRPCError` with proper code
- `sql.raw(...)` → replace with parameterized `sql` template
- `process.env.X` in server code → use `env.X` from `@/env` (validated)
- Manual cookie/session handling → use framework's official API
- `z.string()` for constrained values → add `.regex()`, `.refine()`, or `.int()/.positive()`
- Untyped adapter results (`as unknown`) → type-assert to specific interface
- Missing unique indexes on columns with `.unique()` → add explicit `uniqueIndex()` in table callback
- `as SomeType` in shadcn Select handlers → runtime `includes()` validation
- `useRef` for dialog animation state → conditional render (React Compiler forbids ref in render)
- SELECT + UPDATE toggle → atomic `sql\`NOT ${column}\`` in single UPDATE
- Missing `.limit()` on export queries → add `MAX_EXPORT_ROWS` constant
- Duplicate async calls (e.g. rate fetch) → deduplicate into single variable

## Styling
- Tailwind classes only — NEVER inline styles or CSS modules
- Use `cn()` utility for conditional classes
- Dark theme is default — always test both themes
- Use shadcn/ui primitives, don't create custom base components
