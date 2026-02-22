# Code Style & Conventions

## General
- Language: TypeScript (strict mode)
- Communication: Russian
- Code comments: English
- Framework: Next.js App Router

## Naming
- Components: PascalCase (e.g., GiftTable, ProfitSummary)
- Files: kebab-case for pages/routes, PascalCase for components
- Variables/functions: camelCase
- Types/Interfaces: PascalCase with prefix I for interfaces (optional)
- Constants: UPPER_SNAKE_CASE

## Styling
- Tailwind CSS classes (no inline styles, no CSS modules)
- Dark theme by default
- Mobile-responsive (but desktop-first for trading tracker)

## Components
- Prefer server components where possible
- Client components only when needed (interactivity, state)
- Colocate related files (component + types + utils)

## Patterns
- Space-efficient UI (future features: PnL charts, analytics)
- Table-centric layout (main view = gift trades table)
- Gift images: small thumbnails in table rows
