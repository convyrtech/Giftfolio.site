# Remaining Features — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close the gap between the client's TZ and the current implementation. Prioritized by client impact and dependency order.

**Architecture:** Extend existing tRPC + TanStack Table + shadcn/ui stack. No new frameworks except next-intl for i18n. Schema changes via Drizzle migrations. All new features follow existing patterns (protectedProcedure, branded types, inline cell editors).

**Tech Stack:** Next.js 16, tRPC, Drizzle ORM, TanStack Table v8, shadcn/ui, Tailwind v4, next-intl (new)

---

## Priority Map

| # | Feature | Client Priority | Effort | Dependencies |
|---|---------|----------------|--------|--------------|
| P1 | Inline editing improvements | CRITICAL (client asked explicitly) | M | None |
| P2 | Bulk actions expansion | HIGH (TZ section 8) | M | P1 |
| P3 | Collection rows (quantity type) | HIGH (TZ section 4B) | L | P2 |
| P4 | "Exclude % from PnL" display fix | HIGH (TZ section 11.4) | S | None |
| P5 | Best trade / analytics expansion | MEDIUM (TZ section 13) | M | None |
| P6 | Stars-TON conversion with custom rate | MEDIUM (TZ section 11.3) | M | None |
| P7 | Excel import/export (.xlsx) | MEDIUM (TZ section 16) | M | None |
| P8 | Localization (RU/EN/ZH) | MEDIUM (TZ section 19) | XL | None |
| P9 | Premium/subscription stubs | LOW (TZ section 14) | S | None |
| P10 | TON Connect stub | LOW (TZ section 15) | S | None |
| P11 | Profile types (Flip/Invest) | LOW (TZ section 3) | S | P8 |
| P12 | Row reorder (drag) | LOW (TZ section 12.1) | M | None |
| P13 | Email link in profile | LOW (TZ section 9.2) | S | None |
| P14 | Telegram profile gift parsing | LOW (TZ section 10.1) | L | External API research |
| P15 | Config export/import | LOW (TZ section 16.2) | S | None |

**S** = 1-2 hours, **M** = 3-6 hours, **L** = 8-16 hours, **XL** = 16+ hours

---

## Phase A: Inline Editing & Bulk Actions (P1 + P2 + P4)

**Why first:** Client explicitly requested "editing right in the row without extra dialogs" + bulk actions are core TZ requirement.

### Task A1: Inline editing for Commission fields

**Current state:** Commission (flat + permille) editable only via TradeFormDialog (full modal).
**Target:** Click commission cell → inline popover with two inputs (flat Stars + permille).

**Files:**
- Create: `src/app/(dashboard)/trades/_components/inline-commission-cell.tsx`
- Modify: `src/app/(dashboard)/trades/_components/columns.tsx` — add Commission column with inline editor
- Modify: `src/server/api/routers/trades.ts` — ensure `update` mutation handles commission fields (already does)

**Steps:**
1. Create `InlineCommissionCell` component:
   - Click cell → Popover opens with two inputs: "Flat (Stars)" + "Rate (permille)"
   - Displays current: `{flat}★ + {permille}‰` or "Default" if both null
   - On save → calls `meta.onInlineUpdate(id, { commissionFlatStars, commissionPermille })`
   - Only enabled for STARS trades (TON = permille only, flat disabled)
2. Add Commission column to `columns.tsx` between Sell Price and Profit
3. Extend `InlineUpdateFields` type to include commission fields
4. Update `onInlineUpdate` handler in `trades-table.tsx` to pass commission to `trades.update`
5. Test: click commission cell → edit → verify DB updated
6. Commit

### Task A2: Inline editing for Notes field

**Current state:** Notes editable only via TradeFormDialog.
**Target:** Click notes icon/cell → inline popover with textarea.

**Files:**
- Create: `src/app/(dashboard)/trades/_components/inline-notes-cell.tsx`
- Modify: `src/app/(dashboard)/trades/_components/columns.tsx` — add Notes column or integrate into Actions

**Steps:**
1. Create `InlineNotesCell`: Popover with textarea (max 1000 chars), save on blur/Enter
2. Add as icon button in the Actions column or as a separate narrow column
3. Extend `InlineUpdateFields` with `notes?: string`
4. Test inline notes edit
5. Commit

### Task A3: Inline editing for Marketplace field

**Current state:** Buy/Sell marketplace editable only via dialog.
**Target:** Click marketplace badge → inline select dropdown.

**Files:**
- Create: `src/app/(dashboard)/trades/_components/inline-marketplace-cell.tsx`
- Modify: `src/app/(dashboard)/trades/_components/columns.tsx`

**Steps:**
1. Create `InlineMarketplaceCell`: Click → Select dropdown (fragment|getgems|tonkeeper|p2p|other)
2. Add Buy Marketplace + Sell Marketplace to column definitions (or combine into one column)
3. Save via `onInlineUpdate`
4. Commit

### Task A4: Expand bulk actions (TZ section 8.2)

**Current state:** Bulk actions: Set Sell Price, Hide/Unhide, Count/Don't Count PnL, Delete.
**Missing:** Set Buy Price, Set Buy Date, Set Sell Date, Set Commission.

**Files:**
- Modify: `src/app/(dashboard)/trades/_components/bulk-actions-bar.tsx`
- Modify: `src/server/api/routers/trades.ts` — extend `bulkUpdate` input schema

**Steps:**
1. Add "Set Buy Price" bulk action:
   - Popover with price input (like existing Sell Price)
   - Calls `bulkUpdate({ ids, buyPrice })`
2. Add "Set Buy Date" bulk action:
   - Popover with calendar picker
   - Calls `bulkUpdate({ ids, buyDate })`
3. Add "Set Sell Date" bulk action:
   - Popover with calendar picker
   - Calls `bulkUpdate({ ids, sellDate })` — auto-sets today if blank
4. Add "Set Commission" bulk action:
   - Popover with flat + permille inputs
   - Calls `bulkUpdate({ ids, commissionFlatStars, commissionPermille })`
5. Extend `bulkUpdate` tRPC input schema to accept: `buyPrice`, `buyDate`, `sellDate` (without price), `commissionFlatStars`, `commissionPermille`
6. Extend `bulkUpdate` mutation logic: handle new fields, validate constraints (buyDate <= sellDate)
7. Test each bulk action
8. Commit

### Task A5: "Exclude from %" display fix (TZ section 11.4)

**Current state:** `excludeFromPnl` flag exists, toggles via row actions + bulk. But when active, the Profit column still shows percentage.
**Target:** When `excludeFromPnl = true`, show profit in TON/Stars but display "—" instead of percentage.

**Files:**
- Modify: `src/app/(dashboard)/trades/_components/columns.tsx` — Profit column cell renderer

**Steps:**
1. In Profit column cell: check `row.original.excludeFromPnl`
2. If true: show profit amount but replace `(+50.0%)` with `(excl.)`
3. Visual: muted text color for excluded rows
4. Verify summary cards also respect the flag (they already filter `excludeFromPnl = false`)
5. Commit

---

## Phase B: Collection Rows (P3)

**Why:** Second most important feature from TZ — allows tracking bulk purchases of same collection at same price.

### Task B1: Schema — collection support

**Current state:** `trades` table has `quantity` field (1-9999) and `giftNumber` is nullable. Collections are partially supported data-wise but UI treats everything as single items.

**Target:** UI support for "Collection" row type — no giftLink, no giftNumber, just giftName + quantity.

**Files:**
- Modify: `src/app/(dashboard)/trades/_components/trade-form-dialog.tsx` — add Collection mode
- Modify: `src/app/(dashboard)/trades/_components/columns.tsx` — show quantity badge, adjust display

**Steps:**
1. In TradeFormDialog "Add" mode, add toggle: "Single Item" vs "Collection"
   - Single Item: requires giftUrl (existing flow)
   - Collection: requires giftName (text input) + quantity (number input, 1-9999)
   - Collection: no giftUrl, no giftNumber, no giftLink
2. When Collection selected:
   - Show gift name autocomplete from `gifts.catalog` query
   - Show quantity input
   - Show collection image (from `nft.fragment.com/gift/{name_lower}.webp` — no number)
3. Modify `trades.add` mutation: allow `giftName` without `giftUrl` (already supported via XOR validation)
4. In columns.tsx Gift cell: if `giftNumber` is null, show `{giftName} ×{quantity}` instead of `{giftName} #{number}`
5. Verify PnL calculations multiply by quantity (already do in VIEW + stats)
6. Test: add collection → verify PnL × quantity → verify display
7. Commit

### Task B2: Collection commission (TZ section 7.3)

**Current state:** Commission is per-trade (flat + permille). For collections, flat commission applies once to the whole batch.
**Target:** For collections, add "transferred count" field — commission = flat × transferredCount.

**Analysis:** This requires schema change OR a different approach. Current commission model:
- `commissionFlatStars` = flat fee per trade (not per unit)
- `commissionPermille` = percentage of sell price

For collections, TZ wants: "количество переданных" (transferred count) — a separate field indicating how many items from the collection were actually transferred (each transfer incurs commission).

**Decision:** Add `transferredCount` column to trades table (nullable, default null = same as quantity). Commission = flat × transferredCount + permille × sellPrice.

**Files:**
- Modify: `src/server/db/schema.ts` — add `transferredCount` column
- Modify: SQL VIEW `trade_profits` — adjust commission formula
- Modify: `src/lib/pnl-engine.ts` — adjust profit calculation
- Modify: `src/app/(dashboard)/trades/_components/trade-form-dialog.tsx` — show transferred count for collections
- Create migration

**Steps:**
1. Add `transferredCount` to schema: `smallint`, nullable, CHECK (1..9999), CHECK (transferredCount <= quantity)
2. Generate migration: `npx drizzle-kit generate`
3. Update `trade_profits` VIEW: `commission_flat = flat * COALESCE(transferred_count, quantity)`
4. Update `pnl-engine.ts`: same logic for client-side calculations
5. Add tests for new PnL formula with transferredCount
6. UI: in TradeFormDialog, when quantity > 1, show "Transferred count" input (optional)
7. Test: collection with 100 qty, 10 transferred, commission = flat × 10
8. Commit

---

## Phase C: Analytics Expansion (P5)

### Task C1: Best/worst trade stats

**Files:**
- Modify: `src/server/api/routers/analytics.ts` — add `bestTrades` query
- Create: `src/app/(dashboard)/analytics/_components/best-trades-card.tsx`

**Steps:**
1. Add `bestTrades` query: returns top 3 trades by profit (TON + Stars separately), top by ROI %
2. Create card component showing: best trade name + profit + ROI%
3. Add "Worst trade" (most negative profit)
4. Add to analytics page
5. Commit

### Task C2: Yearly PnL in summary cards

**Files:**
- Modify: `src/app/(dashboard)/trades/_components/summary-cards.tsx` — add "Year" tab

**Steps:**
1. Add "Year" option to period selector tabs (currently: All/Month/Week/Day)
2. Stats router `dashboard` query already supports any date range — just need to add 'year' period
3. Modify stats router to handle `period: 'year'` (filter: current year start AT TIME ZONE)
4. Commit

---

## Phase D: Stars-TON Conversion (P6)

### Task D1: User-configurable Stars→TON rate

**Current state:** Stars = separate currency, no conversion to TON. USD rate is 1 Star = $0.015 (hardcoded).
**Target:** User can set custom Stars→TON rate. Default = calculated from market rates. Used for cross-currency PnL display.

**Files:**
- Modify: `src/server/db/schema.ts` — add `starsToTonRate` to userSettings (nullable, decimal)
- Modify: `src/app/(dashboard)/settings/page.tsx` — add Stars→TON rate input with "default" hint
- Modify: `src/lib/currencies.ts` — add conversion function
- Modify: `src/app/(dashboard)/trades/_components/summary-cards.tsx` — optional unified PnL display

**Steps:**
1. Add `starsToTonRate` column to userSettings (numeric 12,8, nullable = use default)
2. Migration
3. Settings UI: input with grey placeholder showing current market rate (Stars/$0.015 / TON price)
4. Add "Use default" button to clear custom rate
5. In summary cards: optionally show combined PnL (Stars converted to TON via rate)
6. Commit

---

## Phase E: Excel Import/Export (P7)

### Task E1: Excel export (.xlsx)

**Files:**
- Add dependency: `xlsx` (SheetJS) or `exceljs`
- Create: `src/app/(dashboard)/trades/actions/export-excel.ts` (Server Action)
- Modify: `src/app/(dashboard)/trades/_components/trades-toolbar.tsx` — add Excel button

**Steps:**
1. `npm install exceljs`
2. Create Server Action that:
   - Queries all trades (with MAX_EXPORT_ROWS limit)
   - Creates workbook with columns: Gift, Number, Currency, Buy Price, Sell Price, Buy Date, Sell Date, Commission, Profit, Notes
   - Returns as downloadable .xlsx blob
3. Add "Excel" button next to existing CSV button
4. Test: export → open in Excel → verify data
5. Commit

### Task E2: Excel import (.xlsx)

**Files:**
- Modify: `src/app/(dashboard)/trades/_components/import-csv-dialog.tsx` — rename to import-dialog, support .xlsx
- Modify: `src/lib/csv-parser.ts` — add xlsx parsing branch

**Steps:**
1. Accept .xlsx files in addition to .csv in the import dialog
2. Parse xlsx via `exceljs` → convert to same row format as CSV
3. Rest of import pipeline unchanged (validation, bulkImport mutation)
4. Test: create xlsx from template → import → verify trades created
5. Commit

---

## Phase F: Localization (P8)

**This is the largest task. Recommend using next-intl.**

### Task F1: Setup next-intl infrastructure

**Files:**
- Add dependency: `next-intl`
- Create: `src/i18n/` directory with config
- Create: `src/messages/en.json`, `src/messages/ru.json`, `src/messages/zh.json`
- Modify: `src/app/layout.tsx` — wrap with NextIntlClientProvider
- Modify: `src/server/db/schema.ts` — add `locale` to userSettings

**Steps:**
1. `npm install next-intl`
2. Create message files with all UI strings (start with English, then translate)
3. Setup next-intl provider in root layout
4. Add `locale` column to userSettings (default 'en', enum: en/ru/zh)
5. Language switcher in settings page
6. Commit

### Task F2: Extract all hardcoded strings

**Steps:**
1. Go through every component file, replace hardcoded strings with `t('key')`
2. Start with: trades page, settings, analytics, login, navigation
3. Generate ru.json and zh.json (can use AI translation as draft, then client reviews)
4. Test language switching
5. Commit per page group

---

## Phase G: Stubs & Low Priority (P9-P15)

### Task G1: Premium stubs (P9)

- Create: `src/app/(dashboard)/premium/page.tsx` — placeholder page with 5 subscription tiers
- Add "Premium" badge component that wraps features
- Add nav item (greyed out or with "Beta" badge)
- All features remain free, just show info banner

### Task G2: TON Connect stub (P10)

- Add `@tonconnect/ui-react` dependency
- Create: settings page section "Connect Wallet" with TON Connect button
- Stub only — connects wallet but doesn't do anything yet
- Save connected wallet address to userSettings

### Task G3: Profile types (P11)

- Add `profileType` to userSettings ('flip' | 'invest', default 'flip')
- Settings page: profile type selector with description
- Currently no functional difference — just stored for future use

### Task G4: Row reorder (P12)

- Add `sortOrder` column to trades table (integer, nullable)
- Drag handle in first column (optional, via dnd-kit or similar)
- Custom sort mode: when sortOrder is set, override default sort
- This is complex UX — can defer or simplify to "move up/down" buttons

### Task G5: Email link (P13)

- Better Auth already supports email — just need UI
- Add "Link Email" section in settings with email input + verification flow
- Depends on email provider config (Resend, etc.)

### Task G6: Config export/import (P15)

- Export: JSON file with all trades + settings (not passwords/sessions)
- Import: parse JSON, validate with Zod, bulk insert
- Simple Server Action + download button

---

## Execution Order (recommended)

```
Phase A (Inline + Bulk + Exclude%)     ~2-3 sessions
Phase B (Collections)                   ~2 sessions
Phase C (Analytics)                     ~1 session
Phase D (Stars→TON rate)                ~1 session
Phase E (Excel)                         ~1 session
Phase F (Localization)                  ~3-4 sessions
Phase G (Stubs)                         ~2 sessions
                                        ─────────────
                                        ~12-16 sessions total
```

**Critical path:** A → B (bulk actions needed before collections make sense)
**Independent:** C, D, E, F, G can be done in any order after A+B

---

## Verification After Each Phase

```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Plus manual E2E check of changed UI flows.

---

## Out of Scope (deferred / not in TZ MVP)

- Real-time WebSocket updates
- Telegram bot integration (Mini App)
- Payment processing (crypto subscriptions)
- Telegram profile gift parsing (no reliable API)
- Charts beyond existing Recharts (no D3, no canvas)
- Server-side pagination (current client pagination is fine for typical portfolio sizes)
