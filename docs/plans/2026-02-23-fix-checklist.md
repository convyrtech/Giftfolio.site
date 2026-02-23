# Fix Checklist — Pattern Scan Results

**Generated:** 2026-02-23
**Source:** 8 parallel pattern-scanning agents across full codebase
**Purpose:** Every instance of each bug class, grouped by fix type

---

## 1. Missing `isNull(trades.deletedAt)` — 4 locations

| # | File:Line | Function | Status |
|---|-----------|----------|--------|
| 1.1 | `src/server/api/routers/trades.ts:96-101` | `getById` SELECT | TODO |
| 1.2 | `src/server/api/routers/trades.ts:217-220` | `update` SELECT | TODO |
| 1.3 | `src/server/api/routers/trades.ts:266-270` | `update` UPDATE | TODO |
| 1.4 | `src/server/api/routers/trades.ts:415-422` | `toggleHidden` SELECT+UPDATE | TODO |

**Already correct:** `list`, `softDelete`, `bulkUpdate`, `bulkDelete`, `exportCsv`, `restore`, stats router.

---

## 2. Unbounded Zod `.string()` fields — 16 locations

### trades.ts (6 fields)
| # | File:Line | Field | Fix |
|---|-----------|-------|-----|
| 2.1 | `trades.ts:28` | `attrModel` | `.max(100)` |
| 2.2 | `trades.ts:29` | `attrBackdrop` | `.max(100)` |
| 2.3 | `trades.ts:30` | `attrSymbol` | `.max(100)` |
| 2.4 | `trades.ts:31` | `attrPattern` | `.max(100)` |
| 2.5 | `trades.ts:32` | `attrRarity` | `.max(50)` |
| 2.6 | `trades.ts:33` | `notes` | `.max(500)` |

### telegram-plugin.ts (5 fields)
| # | File:Line | Field | Fix |
|---|-----------|-------|-----|
| 2.7 | `telegram-plugin.ts:12` | `first_name` | `.max(64)` |
| 2.8 | `telegram-plugin.ts:13` | `last_name` | `.max(64)` |
| 2.9 | `telegram-plugin.ts:14` | `username` | `.max(32)` |
| 2.10 | `telegram-plugin.ts:15` | `photo_url` | `.max(512).url()` |
| 2.11 | `telegram-plugin.ts:18` | `timezone` | `.max(50)` |

### env.ts (3 fields)
| # | File:Line | Field | Fix |
|---|-----------|-------|-----|
| 2.12 | `env.ts:7` | `DATABASE_URL` | `.max(512)` |
| 2.13 | `env.ts:12` | `BETTER_AUTH_SECRET` | `.max(256)` |
| 2.14 | `env.ts:17` | `TELEGRAM_BOT_TOKEN` | `.max(100)` |

### settings.ts (2 fields)
| # | File:Line | Field | Fix |
|---|-----------|-------|-----|
| 2.15 | `settings.ts:6` | `timezone` | `.max(50)` |
| 2.16 | `settings.ts:~10` | `defaultCurrency` | Already `.enum()` — OK, but verify |

---

## 3. Unsafe type casts — 35 total (6 HIGH, 6 MEDIUM, 23 LOW)

### HIGH RISK — external/unvalidated data (6)
| # | File:Line | Cast | Fix |
|---|-----------|------|-----|
| 3.1 | `telegram-plugin.ts:141` | `user as any` | Create `SessionUser` interface |
| 3.2 | `telegram-plugin.ts:67` | `existingUser as { id: string }` | Type guard + validation |
| 3.3 | `telegram-plugin.ts:94` | `newUser as { id: string }` | Type guard + validation |
| 3.4 | `telegram-plugin.ts:114` | `raceUser as { id: string }` | Type guard + validation |
| 3.5 | `exchange-rates.ts:41` | `as { price: string }` (Binance) | Zod schema |
| 3.6 | `exchange-rates.ts:52` | `as { data?: Array<...> }` (OKX) | Zod schema |

### MEDIUM RISK — shadcn Select → union (6)
| # | File:Line | Cast | Fix |
|---|-----------|------|-----|
| 3.7 | `trade-form-dialog.tsx:380` | `v as Marketplace` | Runtime assertion or typed wrapper |
| 3.8 | `trade-form-dialog.tsx:418` | `v as Marketplace` | Runtime assertion or typed wrapper |
| 3.9 | `trades-toolbar.tsx:58` | `v as CurrencyFilter` | Runtime assertion or typed wrapper |
| 3.10 | `trades-toolbar.tsx:69` | `v as SortColumn` | Runtime assertion or typed wrapper |
| 3.11 | `trades-toolbar.tsx:82` | `v as SortDir` | Runtime assertion or typed wrapper |
| 3.12 | `summary-cards.tsx:48` | `v as Period` | Runtime assertion or typed wrapper |

### LOW RISK — branded types, tests (23) — DEFER
Branded type casts (`as Stars`, `as NanoTon`) in currencies.ts, pnl-engine.ts, columns.tsx, summary-cards.tsx, toolbar.tsx, tests — all have runtime guards or operate on validated data. **No fix needed.**

---

## 4. Missing `db.transaction()` — 5 locations (0 transactions in project)

| # | File:Line | Function | Ops | Priority |
|---|-----------|----------|-----|----------|
| 4.1 | `trades.ts:349-371` | `bulkUpdate` | 2 UPDATEs (STARS+TON split) | CRITICAL |
| 4.2 | `telegram-plugin.ts:60-120` | `telegramCallback` | findUser + createUser + createAccount + linkAccount + createSession (3-5 ops) | CRITICAL |
| 4.3 | `trades.ts:198-275` | `update` | SELECT + UPDATE (TOCTOU) | HIGH |
| 4.4 | `trades.ts:135-196` | `add` | SELECT settings + INSERT trade | MEDIUM |
| 4.5 | `settings.ts:19-35` | `get` | SELECT + conditional INSERT (race) | LOW |

---

## 5. Rounding divergence — 4 critical points + 9 total locations

### Critical divergence points (SQL ROUND vs TS half-up)
| # | File:Line | Type | Method |
|---|-----------|------|--------|
| 5.1 | `drizzle/0001_shiny_silver_fox.sql:~54-66` | SQL VIEW v1 | `ROUND()` — banker's |
| 5.2 | `drizzle/0002_add_quantity_columns.sql:57,66` | SQL VIEW v2 | `ROUND()` — banker's |
| 5.3 | `src/server/api/routers/stats.ts:55` | Inline SQL | `ROUND()` — banker's |
| 5.4 | `src/lib/pnl-engine.ts:50` | TypeScript | `(+500n)/1000n` — half-up |

### All rounding locations (for consistency audit)
| # | File:Line | Expression | Rounding |
|---|-----------|------------|----------|
| 5.5 | `pnl-engine.ts:50` | `(sellPrice * BigInt(permille) + 500n) / 1000n` | half-up |
| 5.6 | `pnl-engine.ts:110` | `Number((unitNet * 10000n) / buyPrice) / 100` | truncation |
| 5.7 | `stats.ts:55` | `ROUND(sell_price * quantity * commission_permille / 1000.0)` | banker's |
| 5.8 | `0002 VIEW:57` | `ROUND(sell_price * commission_permille / 1000.0) * quantity` | banker's |
| 5.9 | `0002 VIEW:66` | `ROUND(sell_price * commission_permille / 1000.0) * quantity` | banker's |

### BigInt→Number overflow risk
| # | File:Line | Expression |
|---|-----------|------------|
| 5.10 | `pnl-engine.ts:139` | `Number(price)` — overflow if > 2^53 |
| 5.11 | `pnl-engine.ts:142` | `Number(price)` — overflow if > 2^53 |

**Fix:** Change SQL to `FLOOR(x + 0.5)` everywhere, or change TS to banker's. Choose one, apply consistently.

---

## 6. Unvalidated `fetch()` responses — 3 locations

| # | File:Line | API | Current | Fix |
|---|-----------|-----|---------|-----|
| 6.1 | `exchange-rates.ts:41` | Binance | `as { price: string }` | Zod schema parse |
| 6.2 | `exchange-rates.ts:52` | OKX | `as { data?: Array<...> }` | Zod schema parse |
| 6.3 | `telegram-login-button.tsx:41,46` | Internal `/api/auth` | no validation | Add `.ok` check + Zod |

**Already correct:** `floor-prices.ts:55` — uses `const raw: unknown = await res.json()` + `parseMarketcapResponse(raw)`.

---

## 7. sellDate/sellPrice inconsistency — 6 locations

### Places allowing invalid state (one without other)
| # | File:Line | Function | Issue |
|---|-----------|----------|-------|
| 7.1 | `trades.ts:155` | `add` mutation | Can pass `sellDate` without `sellPrice` |
| 7.2 | `trades.ts:230-233` | `update` mutation | Separate `if`s allow updating independently |
| 7.3 | `trades.ts:338-346` | `bulkUpdate` mutation | Separate `if`s allow updating independently |
| 7.4 | `trade-form-dialog.tsx:220-221` | Frontend form | No validation pairing |

### Places assuming consistency (but not checking)
| # | File:Line | Code | Checks |
|---|-----------|------|--------|
| 7.5 | `0002 VIEW:54,64,83,93` | SQL VIEW | Only checks `sell_price IS NOT NULL` |
| 7.6 | `pnl-engine.ts:67` | TS engine | Only checks `sellPrice === null` |

**Fix:** Add DB CHECK: `CHECK ((sell_date IS NULL AND sell_price IS NULL) OR (sell_date IS NOT NULL AND sell_price IS NOT NULL))`. Also add Zod `.refine()` on input schema.

---

## 8. Accessibility (WCAG 2.1 AA) — 23 issues

### HIGH priority (6)
| # | File:Line | Element | Missing |
|---|-----------|---------|---------|
| 8.1 | `trade-form-dialog.tsx:68` | Dialog (desktop) | `<DialogDescription>` |
| 8.2 | `trade-form-dialog.tsx:79` | Drawer (mobile) | `<DrawerDescription>` |
| 8.3 | `trades-table.tsx:104` | Table | `aria-label` or `<caption>` |
| 8.4 | `trades-table.tsx:145` | Loading spinner | `role="status"` + sr-only text |
| 8.5 | `dashboard-shell.tsx:67` | Logout button | `aria-label="Sign out"` |
| 8.6 | `network-banner.tsx:36` | Network banner | `role="alert"` |

### MEDIUM priority (13)
| # | File:Line | Element | Missing |
|---|-----------|---------|---------|
| 8.7 | `trades-table.tsx:157` | Skeleton table | `aria-label` |
| 8.8 | `dashboard-shell.tsx:34` | Nav (desktop) | `aria-label="Main navigation"` |
| 8.9 | `dashboard-shell.tsx:85` | Nav (mobile) | `aria-label="Mobile navigation"` |
| 8.10 | `dashboard-shell.tsx:36` | Nav links (desktop) | `aria-current="page"` |
| 8.11 | `dashboard-shell.tsx:87` | Nav links (mobile) | `aria-current="page"` |
| 8.12 | `dashboard-shell.tsx:57` | Avatar image | `alt` with user name |
| 8.13 | `trade-form-dialog.tsx:274` | Gift URL input | `aria-required="true"` |
| 8.14 | `trade-form-dialog.tsx:302` | Gift Name input | `aria-required="true"` |
| 8.15 | `trade-form-dialog.tsx:359` | Buy Price input | `aria-required={!isEdit}` |
| 8.16 | `trades/loading.tsx:4` | Loading page | `role="status"` wrapper |
| 8.17 | `settings/loading.tsx:4` | Loading page | `role="status"` wrapper |
| 8.18 | `summary-cards.tsx:124` | Skeleton wrapper | `role="status"` wrapper |
| 8.19 | `settings/page.tsx:157` | Settings skeleton | `role="status"` wrapper |

### LOW priority (4)
| # | File:Line | Element | Missing |
|---|-----------|---------|---------|
| 8.20 | `settings/page.tsx:120` | Currency select | `aria-label` on trigger |
| 8.21 | `summary-cards.tsx:110` | Profit value | Non-color indicator |
| 8.22 | `columns.tsx:174` | Profit cell | Explicit minus for negative |
| 8.23 | Sonner toasts | Error toasts | Verify `aria-live="assertive"` |

---

## Summary Statistics

| Category | Total | HIGH | MED | LOW |
|----------|-------|------|-----|-----|
| 1. deletedAt filters | 4 | 4 | - | - |
| 2. Zod unbounded strings | 16 | 6 | 7 | 3 |
| 3. Unsafe type casts | 35 | 6 | 6 | 23 |
| 4. Missing transactions | 5 | 2 | 2 | 1 |
| 5. Rounding divergence | 4+7 | 4 | 2 | 5 |
| 6. Unvalidated fetch | 3 | 2 | 1 | - |
| 7. sellDate/sellPrice | 6 | 2 | 2 | 2 |
| 8. Accessibility (a11y) | 23 | 6 | 13 | 4 |
| **TOTAL** | **103** | **32** | **33** | **38** |

---

## Phase 7A Fix Order (Critical + Quick Wins)

1. **deletedAt filters** (4 locations) — 5 min
2. **Unique index + giftNumber** (schema.ts) — 5 min
3. **sellDate/sellPrice CHECK + Zod refine** — 10 min
4. **trade_currency CHECK + ton_no_flat CHECK** — 5 min
5. **Rounding alignment** (SQL FLOOR(x+0.5)) — 15 min
6. **bulkUpdate transaction** — 5 min
7. **telegram-plugin transaction** — 15 min
8. **Stats flat commission for TON** — 5 min
9. **Zod .max() on all 16 fields** — 10 min
10. **Exchange rates Zod schemas** — 10 min
11. **telegram-plugin type guards** — 10 min
12. **A11y HIGH priority** (6 items) — 15 min
