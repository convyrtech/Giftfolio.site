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

## Styling
- Tailwind classes only — NEVER inline styles or CSS modules
- Use `cn()` utility for conditional classes
- Dark theme is default — always test both themes
- Use shadcn/ui primitives, don't create custom base components
