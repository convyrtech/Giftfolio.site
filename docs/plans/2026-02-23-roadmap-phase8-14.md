# GIFTSSITE Roadmap: Phases 8-14

> **Status:** Research complete
> **Date:** 2026-02-23
> **Goal:** Довести приложение от MVP до production-ready продукта

---

## Table of Contents

1. [Overview](#overview)
2. [Floor Prices & Unrealized PnL](#1-floor-prices--unrealized-pnl)
3. [Analytics & Charts](#2-analytics--charts)
4. [Gift Search/Autocomplete](#3-gift-searchautocomplete)
5. [CSV Import](#4-csv-import)
6. [Theme Toggle & PWA](#5-theme-toggle--pwa)
7. [Mobile UX](#6-mobile-ux)
8. [Onboarding](#7-onboarding)
9. [Tech Debt](#8-tech-debt)
10. [Implementation Plan](#implementation-plan)
11. [Success Metrics](#success-metrics)

---

## Overview

### Goals

1. **Unrealized PnL** — показать floor prices и потенциальную прибыль для открытых позиций
2. **Analytics** — графики PnL по времени, portfolio composition, win rate
3. **Gift Autocomplete** — быстрый поиск подарков в форме через shadcn Command
4. **CSV Import** — массовый импорт сделок с preview и валидацией
5. **Polish** — theme toggle, PWA, mobile UX, onboarding

### Key Decisions

| Aspect | Decision |
|--------|----------|
| Chart library | Recharts via `npx shadcn add chart` (CSS vars `--chart-1..5` уже в globals.css) |
| Floor prices merge | Client-side через TableMeta + отдельный useQuery (staleTime 1h) |
| CSV parsing | Client-side без Papa Parse + tRPC `bulkImport` mutation |
| Gift autocomplete | shadcn Command (cmdk) + `gifts.catalog` endpoint |
| Theme | next-themes (уже установлен), `defaultTheme="dark"` |
| PWA | manifest.json + minimal passthrough SW (no offline caching) |
| Mobile table | Column hiding via `columnVisibility` + `useMediaQuery` |
| Onboarding | Enriched EmptyState + Settings nudge (no wizard) |
| Row virtualization | SKIP — shadcn `<Table>` несовместим без div-grid rewrite; аудитория < 300 trades |
| RSC/Client split | SKIP — app за auth, React Query cache достаточен |
| noUncheckedIndexedAccess | DO — 15-25 fixable errors, реальная защита от undefined |

---

## 1. Floor Prices & Unrealized PnL

> **Experts:** Dan Abramov (React), Matt Pocock (TypeScript), Markus Winand (DB)

### Architecture: Client-side merge via TableMeta

Floor prices загружаются ОДНИМ `useQuery` в `TradesTable`, передаются через `table.options.meta.floorPrices`. Unrealized PnL считается pure function в `pnl-engine.ts`.

```
market.floorPrices (1 fetch, cache 1h)
  ↓
TradesTable.tableMeta.floorPrices: Record<string, number>
  ↓
columns.tsx → calculateUnrealizedPnl() per row
```

### New pure function in pnl-engine.ts

```typescript
export function calculateUnrealizedPnl(
  buyPrice: bigint,
  tradeCurrency: "STARS" | "TON",
  floorPriceStars: number,
  commissionPermille: number,
  quantity: number,
): UnrealizedPnlResult
```

- Stars trades: `(floorPrice - buyPrice/qty - commission) * qty`
- TON trades: return `null` (cross-currency — floor prices only in Stars)
- Tooltip for TON: "Floor price in Stars. TON PnL requires exchange rate conversion."

### Gift Attributes Display

Данные `attrModel`, `attrBackdrop`, `attrSymbol`, `attrModelRarity` уже в схеме — показать как badge/tooltip в Gift колонке. Rarity → color (rare=gold, common=gray).

### Files

| File | Change |
|------|--------|
| `src/lib/pnl-engine.ts` | Add `calculateUnrealizedPnl()` + `UnrealizedPnlResult` |
| `src/app/(dashboard)/trades/_components/columns.tsx` | Add Floor/Unrealized PnL column + attributes badges |
| `src/app/(dashboard)/trades/_components/trades-table.tsx` | Add `trpc.market.floorPrices.useQuery()`, pass to meta |
| `src/lib/pnl-engine.test.ts` | Tests for unrealized PnL |

---

## 2. Analytics & Charts

> **Experts:** Dan Abramov (React), Markus Winand (DB), Martin Fowler (Architecture)

### Chart Library: Recharts via shadcn

```bash
npx shadcn@latest add chart
```

CSS variables `--chart-1..5` already defined in `globals.css` for both themes. shadcn provides `<ChartContainer>`, `<ChartTooltip>`, `<ChartLegend>` wrappers.

### Page Structure: Dedicated `/analytics`

Отдельная страница — Analytics и Trades это разные use cases (read-only visualization vs CRUD). Nav item добавляется в `dashboard-shell.tsx`.

### Data: SQL-level aggregation (NOT client-side)

```sql
SELECT
  DATE_TRUNC('day', sell_date AT TIME ZONE $tz)::date AS period,
  SUM(net_profit_stars) FILTER (WHERE trade_currency = 'STARS') AS profit_stars,
  SUM(net_profit_nanoton) FILTER (WHERE trade_currency = 'TON') AS profit_nanoton
FROM trade_profits
WHERE user_id = $userId AND sell_date IS NOT NULL
  AND deleted_at IS NULL AND exclude_from_pnl = false
GROUP BY 1 ORDER BY 1
```

### Charts MVP (3 charts)

1. **Cumulative PnL area chart** — period selector (week/month/3mo/all), recharts `<AreaChart>`
2. **Portfolio donut** — top-10 gifts by value + "Other", recharts `<PieChart>`
3. **Win rate** — large number with subtitle (not gauge — antipattern for data density)

Sparklines — deferred (no historical floor price data source).

### New tRPC Router: analyticsRouter

Отдельный от `statsRouter` (bounded context).

```typescript
// src/server/api/routers/analytics.ts
pnlTimeSeries: protectedProcedure.input(z.object({
  granularity: z.enum(["day", "week", "month"]).default("day"),
  range: z.enum(["7d", "30d", "90d", "1y", "all"]).default("30d"),
  currency: z.enum(["STARS", "TON"]).optional(),
})).query(...)

portfolioComposition: protectedProcedure.query(...)
tradeOutcomes: protectedProcedure.input(z.object({
  period: z.enum(["week", "month", "total"]).default("total"),
})).query(...)
```

BigInt → Number conversion in router (not UI). Timezone from `userSettings`.

### Files

| File | Change |
|------|--------|
| `src/server/api/routers/analytics.ts` | NEW — 3 endpoints |
| `src/server/api/root.ts` | Register analyticsRouter |
| `src/app/(dashboard)/analytics/page.tsx` | NEW — RSC with prefetch |
| `src/app/(dashboard)/analytics/loading.tsx` | NEW — skeleton |
| `src/app/(dashboard)/analytics/_components/pnl-area-chart.tsx` | NEW |
| `src/app/(dashboard)/analytics/_components/portfolio-donut-chart.tsx` | NEW |
| `src/app/(dashboard)/analytics/_components/trade-outcomes-card.tsx` | NEW |
| `src/app/(dashboard)/analytics/_components/chart-period-selector.tsx` | NEW |
| `src/app/(dashboard)/_components/dashboard-shell.tsx` | Add "Analytics" nav item |

---

## 3. Gift Search/Autocomplete

> **Experts:** Dan Abramov (React), Matt Pocock (TypeScript), Martin Fowler (Architecture)

### Approach: shadcn Command (cmdk) + gifts.catalog endpoint

~500 gift types — small enough for client-side filter. Prefetch on form open, cache 1h.

```bash
npx shadcn@latest add command
```

### New endpoint: gifts.catalog

```typescript
// src/server/api/routers/gifts.ts
catalog: protectedProcedure.query(async () => {
  const prices = await getFloorPrices();
  return Object.entries(prices).map(([name, floorStars]) => ({
    name,                              // "PlushPepe"
    nameLower: name.toLowerCase(),     // "plushpepe"
    displayName: pascalCaseToSpaces(name), // "Plush Pepe"
    floorStars,                        // 1234
  }));
}),
```

### GiftNameCombobox component

- Popover + Command + CommandInput + CommandList
- Each item: thumbnail `{nameLower}-1.webp` (20x20) + displayName + floor price badge
- On select: auto-fill giftName + show preview image
- Fallback: if catalog fails to load → plain `<Input>` (graceful degradation)

### Files

| File | Change |
|------|--------|
| `src/components/ui/command.tsx` | NEW via shadcn add |
| `src/server/api/routers/gifts.ts` | Add `catalog` procedure |
| `src/lib/gift-parser.ts` | Export `pascalCaseToSpaces` |
| `src/app/(dashboard)/trades/_components/gift-name-combobox.tsx` | NEW |
| `src/app/(dashboard)/trades/_components/trade-form-dialog.tsx` | Replace Collection Input with GiftNameCombobox |

---

## 4. CSV Import

> **Experts:** Martin Fowler (Architecture), Troy Hunt (Security), Markus Winand (DB)

### Approach: Client-side parse + Preview + tRPC bulkImport

No Papa Parse needed — CSV format is simple (no nested quotes in prices). Manual parser (~30 LOC) with BOM/CRLF handling.

### Flow

```
Upload CSV → FileReader.readAsText()
  ↓
Parse rows → Zod validate each → RowResult[]
  ↓
Preview table (TanStack Table) — errors highlighted red
  ↓
Confirm → trades.bulkImport mutation
  ↓
Result: { inserted: N, skipped: M, errors: RowError[] }
```

### CSV Format (compatible with exportCsv output)

```
gift_url,gift_name,currency,buy_price,buy_date,sell_price,sell_date,quantity,buy_marketplace,sell_marketplace
```

- `gift_url` OR `gift_name` required
- `currency` = STARS|TON required
- TON prices: human format "3.5" → `parseTonInput()`
- Dates: ISO `YYYY-MM-DD`

### Limits & Security

- `MAX_IMPORT_ROWS = 500`
- File size check: `file.size > 1_000_000` → reject client-side
- Separate rate limiter: 5 imports/hour/user (not competing with 30/min mutation limit)
- Duplicate detection: rely on DB `uniqueIndex("uq_trades_user_gift_open")`
- `skipErrors: boolean` flag — insert valid rows, return errors for rest
- Batch insert: chunks of 100 in single transaction

### Server re-validation

Server NEVER trusts client parsing. Re-validates through same Zod schema + `parseGiftUrl()`.

### Files

| File | Change |
|------|--------|
| `src/lib/csv-parser.ts` | NEW — pure CSV parser |
| `src/lib/csv-schema.ts` | NEW — Zod schema + types |
| `src/server/api/routers/trades.ts` | Add `bulkImport` procedure |
| `src/lib/rate-limit.ts` | Add `importRateLimit` |
| `src/app/(dashboard)/trades/_components/import-csv-dialog.tsx` | NEW — upload + preview + confirm |
| `src/app/(dashboard)/trades/_components/import-preview-table.tsx` | NEW — error-highlighted preview |
| `src/app/(dashboard)/trades/_components/trades-toolbar.tsx` | Add "Import CSV" button |

---

## 5. Theme Toggle & PWA

> **Experts:** Dan Abramov (React), Troy Hunt (Security)

### Theme: next-themes (already installed)

```tsx
// providers/index.tsx
<ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
```

- Remove `className="dark"` from `<html>`, add `suppressHydrationWarning`
- Toggle button in `dashboard-shell.tsx` header (Sun/Moon icon)
- `sonner.tsx` already uses `useTheme()` — will work automatically after ThemeProvider
- Light theme: shadcn defaults in `:root` already defined — works out of box
- `@custom-variant dark (&:is(.dark *))` in globals.css — fully compatible with next-themes

### PWA: Manifest + minimal SW (no offline)

```json
// public/manifest.json
{
  "name": "Giftfolio — Gift Trading Tracker",
  "short_name": "Giftfolio",
  "start_url": "/trades",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [{ "src": "/icon-192.png", "sizes": "192x192" }, ...]
}
```

```js
// public/sw.js — passthrough, enables install prompt
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => e.respondWith(fetch(e.request)));
```

No workbox, no importScripts — passes CSP `script-src 'self'`.

### Files

| File | Change |
|------|--------|
| `src/components/providers/index.tsx` | Add ThemeProvider + SW registration |
| `src/app/layout.tsx` | Remove `className="dark"`, add `suppressHydrationWarning`, add manifest to metadata |
| `src/app/(dashboard)/_components/dashboard-shell.tsx` | Add theme toggle button |
| `public/manifest.json` | NEW |
| `public/sw.js` | NEW |
| `public/icon-192.png` | NEW (need to create) |
| `public/icon-512.png` | NEW (need to create) |

---

## 6. Mobile UX

> **Experts:** Dan Abramov (React), Nir Eyal (UX)

### Column Hiding (high impact, low effort)

```typescript
// trades-table.tsx
const isMobile = useMediaQuery("(max-width: 767px)");
const columnVisibility = useMemo(() => ({
  tradeCurrency: !isMobile,
  buyDate: !isMobile,
  sellDate: !isMobile,
  buyPrice: !isMobile,
  sellPrice: !isMobile,
}), [isMobile]);
```

Mobile shows: checkbox + gift + profit + actions. Price details via edit action.

### Other Fixes

- **Tap target**: `TradeRowActions` button → `min-h-[44px] min-w-[44px]`
- **BulkActionsBar z-conflict**: `bottom-0` → `bottom-14 md:bottom-0` (above mobile nav)
- **overflow-x-auto**: wrapper on table div for any remaining scroll
- **Toolbar collapse**: On mobile, show only "Add trade" + "Filters" button → bottom sheet with selects

### Deferred

- Card layout on mobile (high effort, questionable ROI)
- Swipe actions (conflicts with horizontal scroll)
- Summary cards carousel (2x2 grid already works)

### Files

| File | Change |
|------|--------|
| `src/app/(dashboard)/trades/_components/trades-table.tsx` | columnVisibility + overflow-x-auto |
| `src/app/(dashboard)/trades/_components/trade-row-actions.tsx` | Fix tap target |
| `src/app/(dashboard)/trades/_components/bulk-actions-bar.tsx` | Fix bottom positioning |
| `src/app/(dashboard)/trades/_components/trades-toolbar.tsx` | Mobile filters collapse |

---

## 7. Onboarding

> **Experts:** Dan Abramov (React), Nir Eyal (UX/Product)

### Approach: Enriched EmptyState + Settings Nudge

No wizard, no DB flag. Target audience = Telegram gift traders who know what they want.

### Changes

1. **EmptyState**: Add settings query → if commission = 0, show warning badge "Commission not set"
2. **EmptyState**: Compact checklist (localStorage): `[x] Timezone set` / `[ ] Commission` / `[ ] First trade`
3. **Settings page**: "Use browser timezone" button → one-click auto-fill + save
4. **Dismissible**: checklist hidden after first trade OR manual dismiss

### Files

| File | Change |
|------|--------|
| `src/app/(dashboard)/trades/_components/empty-state.tsx` | Add settings query, commission warning, checklist |
| `src/app/(dashboard)/settings/page.tsx` | "Use browser timezone" button |

---

## 8. Tech Debt

> **Experts:** Martin Fowler (Refactoring), Matt Pocock (TypeScript), Kent C. Dodds (Testing)

### DO (ordered by ROI)

| # | Task | Effort | Benefit |
|---|------|--------|---------|
| 1 | Global `app/error.tsx` | S (15min) | Covers root layout errors |
| 2 | `noUncheckedIndexedAccess` | S-M (1-2h) | Prevents undefined access, 15-25 fixes |
| 3 | Delete `aggregateStats()` dead code | S (15min) | Remove unused code + dead tests |
| 4 | Extract `CommissionOverrideSection` | S (30min) | Localize state, reduce TradeForm by ~45 LOC |
| 5 | `maxPages: 20` safety net | S (5min) | Cap DOM at 1000 rows |

### SKIP

| Task | Reason |
|------|--------|
| Row virtualization | shadcn `<Table>` = semantic HTML, incompatible with virtualizer without div-grid rewrite. Audience < 300 trades. |
| Full TradeForm split | 552 LOC but well-structured with section comments. 40% Add/Edit overlap makes split inefficient. |
| RSC/Client split | App behind auth, `robots: noindex`. React Query cache sufficient. Zero real benefit. |

---

## Implementation Plan

### Phase 8: Floor Prices + Gift Attributes (M — 1 day)
- [ ] 8.1 Add `calculateUnrealizedPnl()` to `pnl-engine.ts`
- [ ] 8.2 Add tests for unrealized PnL calculations
- [ ] 8.3 Add `floorPrices` to TableMeta interface (module augmentation)
- [ ] 8.4 Add `trpc.market.floorPrices.useQuery()` in `trades-table.tsx`
- [ ] 8.5 Add "Floor / Unrealized PnL" column in `columns.tsx`
- [ ] 8.6 Add gift attributes badges (model, rarity) in Gift column
- [ ] 8.7 Self-review → commit

### Phase 9: Tech Debt Sprint (S — half day)
- [ ] 9.1 Add global `src/app/error.tsx`
- [ ] 9.2 Enable `noUncheckedIndexedAccess` in tsconfig, fix all errors
- [ ] 9.3 Delete `aggregateStats()` from pnl-engine.ts + dead tests
- [ ] 9.4 Extract `CommissionOverrideSection` from TradeForm
- [ ] 9.5 Add `maxPages: 20` to trades useInfiniteQuery
- [ ] 9.6 Verification: tsc + lint + test + build
- [ ] 9.7 Self-review → commit

### Phase 10: Gift Search/Autocomplete (M — 1 day)
- [ ] 10.1 `npx shadcn add command`
- [ ] 10.2 Add `gifts.catalog` tRPC endpoint
- [ ] 10.3 Export `pascalCaseToSpaces` from gift-parser.ts
- [ ] 10.4 Create `GiftNameCombobox` component
- [ ] 10.5 Integrate into TradeForm (Collection mode)
- [ ] 10.6 Test: catalog loading, selection, fallback
- [ ] 10.7 Self-review → commit

### Phase 11: Analytics/Charts (L — 2 days)
- [ ] 11.1 `npx shadcn add chart` (installs recharts)
- [ ] 11.2 Create `analyticsRouter` with 3 endpoints
- [ ] 11.3 Register in `root.ts`, add nav item in `dashboard-shell.tsx`
- [ ] 11.4 Create analytics page + loading skeleton
- [ ] 11.5 Build `PnlAreaChart` with period selector
- [ ] 11.6 Build `PortfolioDonutChart` (top-10 gifts)
- [ ] 11.7 Build `TradeOutcomesCard` (win rate)
- [ ] 11.8 Test SQL aggregations with timezone edge cases
- [ ] 11.9 Self-review → commit

### Phase 12: CSV Import (L — 2 days)
- [ ] 12.1 Create `csv-parser.ts` (pure parser, handle BOM/CRLF)
- [ ] 12.2 Create `csv-schema.ts` (Zod row schema, types)
- [ ] 12.3 Unit tests for CSV parser + schema
- [ ] 12.4 Add `bulkImport` tRPC procedure with separate rate limiter
- [ ] 12.5 Create `ImportCsvDialog` (upload + preview + confirm)
- [ ] 12.6 Create `ImportPreviewTable` (error highlighting)
- [ ] 12.7 Add "Import CSV" button to toolbar
- [ ] 12.8 Integration test: parse → preview → import → verify DB
- [ ] 12.9 Self-review → commit

### Phase 13: Polish — Theme + Mobile + Onboarding (M — 1 day)
- [ ] 13.1 Add `ThemeProvider` to providers, remove hardcoded dark class
- [ ] 13.2 Add theme toggle button in dashboard header
- [ ] 13.3 Add `manifest.json` + `sw.js` + metadata.manifest
- [ ] 13.4 Mobile: add `columnVisibility` in `trades-table.tsx`
- [ ] 13.5 Fix tap targets + BulkActionsBar positioning
- [ ] 13.6 Enrich EmptyState with commission warning + checklist
- [ ] 13.7 Settings: "Use browser timezone" button
- [ ] 13.8 Self-review → commit

### Phase 14: Export Formats (Optional) (S — half day)
- [ ] 14.1 Add Excel export via `exceljs` (client-side generation)
- [ ] 14.2 Add export format selector in toolbar (CSV / Excel)
- [ ] 14.3 PDF via `window.print()` + `@media print` CSS
- [ ] 14.4 Self-review → commit

---

## Dependency Graph

```
Phase 8 (Floor Prices + Attributes) ──┐
                                       ├──→ Phase 11 (Analytics)
Phase 9 (Tech Debt) ──────────────────┤
                                       ├──→ Phase 10 (Autocomplete)
                                       │         │
                                       │         ├──→ Phase 12 (CSV Import)
                                       │
Phase 13 (Polish) ─── independent ─────┘

Phase 14 (Export) ─── independent, optional
```

**Phases 8 + 13 can run in parallel** (no file overlap).

---

## Risk Matrix

| Phase | Risk | Mitigation |
|-------|------|------------|
| 8 | Floor price `giftName` mismatch with giftasset.pro | Normalize function + log mismatches |
| 8 | TON unrealized PnL impossible without exchange rate | Show floor in Stars, PnL as N/A with tooltip |
| 11 | Recharts bundle size (~140KB) | `next/dynamic` with `ssr: false` |
| 11 | SQL timezone aggregation DST edge cases | Test with known dataset across DST boundary |
| 12 | Batch insert 500 rows timeout (Railway 30s) | Chunk 100 per INSERT, all in one transaction |
| 12 | Duplicate detection for collection mode | Compare `giftName + buyDate + buyPrice` |
| 13 | FOUC on theme toggle | `suppressHydrationWarning` + `disableTransitionOnChange` |
| 13 | CSP conflict with service worker | Minimal passthrough SW, no importScripts |

---

## Success Metrics

| Metric | Baseline | Target |
|--------|----------|--------|
| Pages | 2 (trades, settings) | 3 (+ analytics) |
| Charts | 0 | 3 (PnL area, donut, win rate) |
| Import methods | 1 (manual form) | 2 (+ CSV bulk) |
| Export formats | 1 (CSV) | 2-3 (+ Excel, print) |
| Mobile columns visible | 8 (all, scroll) | 4 (responsive) |
| Theme options | 1 (dark only) | 2 (dark + light) |
| Gift input | Plain text | Autocomplete with images |
| Unrealized PnL | Not shown | Floor price + PnL column |
| TypeScript strictness | strict | strict + noUncheckedIndexedAccess |
| Error boundaries | 2 (per-route) | 3 (+ global) |
