# Inline Cell Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make buyDate, buyPrice, sellDate, sellPrice cells in the trades table directly editable on click — no dialog needed.

**Architecture:** Click a cell → inline input/calendar popover appears → Enter or blur-outside saves via `trpc.trades.update` → toast + invalidate. Two reusable components: `InlineDateCell` and `InlinePriceCell`. Mutation lives in `trades-table.tsx`, passed down via TanStack Table meta.

**Tech Stack:** TanStack Table v8 TableMeta, shadcn Popover + Calendar, tRPC `trades.update`, `parseTonInput` / `parseStarsInput` from `@/lib/currencies`, `toUTCDate` pattern from `trade-form-dialog.tsx`.

---

## Task 1: Extend `trades.update` tRPC — add buyPrice + buyDate

**Files:**
- Modify: `src/server/api/routers/trades.ts` — `update` procedure input + handler

**Step 1: Add buyPrice and buyDate to the input schema**

In `update` input (after `id: z.coerce.bigint()`), add:
```ts
buyPrice: z.coerce.bigint().min(0n).optional(),
buyDate: z.coerce.date().optional(),
```

**Step 2: Add buyDate validation — must not be after existing/new sellDate**

After the existing `finalSellDate` / `finalSellPrice` check, add:
```ts
const finalBuyDate = input.buyDate !== undefined ? input.buyDate : existing.buyDate;
if (finalSellDate && finalBuyDate > finalSellDate) {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Buy date cannot be after sell date",
  });
}
```

**Step 3: Handle buyPrice in updateData**

In the `if (input.X !== undefined)` block, add:
```ts
if (input.buyPrice !== undefined) {
  updateData.buyPrice = input.buyPrice;
}
```

**Step 4: Handle buyDate in updateData — re-lock buyRateUsd**

```ts
if (input.buyDate !== undefined) {
  updateData.buyDate = input.buyDate;
  // Re-lock buy rate to the new date (same pattern as sellDate)
  if (existing.tradeCurrency === "STARS") {
    updateData.buyRateUsd = getStarsUsdRate().toString();
  } else {
    const tonRate = await getTonUsdRate();
    updateData.buyRateUsd = tonRate?.toString() ?? null;
  }
}
```

**Step 5: Verify TypeScript compiles**
```bash
cd E:/giftsite && npx tsc --noEmit
```
Expected: no errors related to trades.ts

**Step 6: Self-audit**
- buyDate > sellDate → TRPCError BAD_REQUEST ✓
- buyRateUsd re-locked on buyDate change ✓
- buyPrice change without buyDate → rate unchanged ✓
- sellDate + sellPrice pair constraint still intact ✓

---

## Task 2: Create `InlineDateCell` component

**Files:**
- Create: `src/app/(dashboard)/trades/_components/inline-date-cell.tsx`

**Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatters";

interface InlineDateCellProps {
  value: Date | null;
  onSave: (date: Date) => Promise<void>;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
}

/** Strip local timezone so PostgreSQL date column stores the correct calendar date. */
function toUTCDate(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function InlineDateCell({
  value,
  onSave,
  minDate,
  maxDate,
  placeholder = "—",
}: InlineDateCellProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSelect(date: Date | undefined) {
    if (!date) return;
    setOpen(false);
    setSaving(true);
    try {
      await onSave(toUTCDate(date));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "group flex items-center gap-1 rounded px-1 py-0.5 text-sm transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            saving && "opacity-50 pointer-events-none",
          )}
          aria-label={value ? `Edit date: ${formatDate(value)}` : "Set date"}
        >
          {saving ? (
            <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          ) : (
            <CalendarIcon className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
          <span className={cn(!value && "text-muted-foreground")}>
            {value ? formatDate(value) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={handleSelect}
          fromDate={minDate}
          toDate={maxDate}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
```

**Step 2: Verify TypeScript compiles**
```bash
cd E:/giftsite && npx tsc --noEmit
```

**Step 3: Self-audit**
- `toUTCDate` prevents off-by-one day (same pattern as TradeFormDialog) ✓
- Spinner while saving, pointer-events-none prevents double save ✓
- `fromDate`/`toDate` passed for buy/sell date constraints ✓
- No ref reads in render (React Compiler compliant) ✓
- aria-label for a11y ✓

---

## Task 3: Create `InlinePriceCell` component

**Files:**
- Create: `src/app/(dashboard)/trades/_components/inline-price-cell.tsx`

**Step 1: Write the component**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  parseTonInput,
  parseStarsInput,
  formatTon,
  formatStars,
  nanoTonToTonString,
  type NanoTon,
  type Stars,
} from "@/lib/currencies";

interface InlinePriceCellProps {
  value: bigint;
  currency: "STARS" | "TON";
  onSave: (price: bigint) => Promise<void>;
  align?: "left" | "right";
}

function toDisplayValue(value: bigint, currency: "STARS" | "TON"): string {
  if (currency === "TON") return nanoTonToTonString(value as NanoTon);
  return String(value);
}

function parseDisplayValue(raw: string, currency: "STARS" | "TON"): bigint {
  if (currency === "TON") return parseTonInput(raw);
  return parseStarsInput(raw);
}

function formatForDisplay(value: bigint, currency: "STARS" | "TON"): string {
  if (currency === "TON") return formatTon(value as NanoTon);
  return formatStars(value as Stars);
}

export function InlinePriceCell({
  value,
  currency,
  onSave,
  align = "right",
}: InlinePriceCellProps): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setInputVal(toDisplayValue(value, currency));
    setError(false);
    setEditing(true);
  }

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  async function commit() {
    if (!editing) return;
    let parsed: bigint;
    try {
      parsed = parseDisplayValue(inputVal, currency);
    } catch {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    if (parsed < 0n) {
      setError(true);
      return;
    }
    setEditing(false);
    setSaving(true);
    try {
      await onSave(parsed);
    } catch {
      // toast handled by caller
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setEditing(false);
    setError(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commit();
    } else if (e.key === "Escape") {
      cancel();
    }
  }

  if (editing) {
    return (
      <div className={cn("flex", align === "right" ? "justify-end" : "justify-start")}>
        <Input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => { setInputVal(e.target.value); setError(false); }}
          onBlur={() => void commit()}
          onKeyDown={handleKeyDown}
          className={cn(
            "h-7 w-28 px-1.5 text-sm tabular-nums",
            align === "right" && "text-right",
            error && "border-destructive focus-visible:ring-destructive",
          )}
          aria-invalid={error}
          aria-label={`Edit ${currency} price`}
        />
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      disabled={saving}
      className={cn(
        "group flex w-full items-center gap-1 rounded px-1 py-0.5 tabular-nums text-sm transition-colors",
        align === "right" && "justify-end",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        saving && "opacity-50",
      )}
      aria-label={`Edit price: ${formatForDisplay(value, currency)}`}
    >
      {saving && (
        <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
      )}
      {formatForDisplay(value, currency)}
    </button>
  );
}
```

**Step 2: Verify TypeScript compiles**
```bash
cd E:/giftsite && npx tsc --noEmit
```

**Step 3: Self-audit**
- `parseTonInput` / `parseStarsInput` — proper error handling ✓
- ESC cancels without save ✓
- Enter commits ✓
- Blur commits (for keyboard-only users moving to next cell) ✓
- `error` state shows red border, does not close input ✓
- `saving` state disables button, shows spinner ✓
- No mutation inside render (React Compiler) ✓

---

## Task 4: Wire up TableMeta + mutation in `trades-table.tsx`

**Files:**
- Modify: `src/app/(dashboard)/trades/_components/columns.tsx` — add `onInlineUpdate` to meta
- Modify: `src/app/(dashboard)/trades/_components/trades-table.tsx` — add mutation + meta field

**Step 1: Add `onInlineUpdate` to `TradesTableMeta` and module augmentation in `columns.tsx`**

In the `TradesTableMeta` interface, add:
```ts
onInlineUpdate: (
  id: bigint,
  fields: { buyDate?: Date; buyPrice?: bigint; sellDate?: Date; sellPrice?: bigint }
) => Promise<void>;
```

Same field in the `declare module "@tanstack/react-table"` block.

**Step 2: Add mutation in `trades-table.tsx`**

After the existing `toggleExclude` mutation, add:
```ts
const inlineUpdate = trpc.trades.update.useMutation({
  onSuccess: () => {
    void utils.trades.list.invalidate();
    void utils.stats.dashboard.invalidate();
  },
  onError: (err) => toast.error(err.message),
});
```

**Step 3: Add `onInlineUpdate` to `tableMeta` object in `trades-table.tsx`**

```ts
onInlineUpdate: async (id, fields) => {
  await inlineUpdate.mutateAsync({ id, ...fields });
},
```

**Step 4: Verify TypeScript compiles**
```bash
cd E:/giftsite && npx tsc --noEmit
```

---

## Task 5: Replace static cells in `columns.tsx` with inline components

**Files:**
- Modify: `src/app/(dashboard)/trades/_components/columns.tsx`

**Step 1: Add imports at top of file**

```ts
import { InlineDateCell } from "./inline-date-cell";
import { InlinePriceCell } from "./inline-price-cell";
```

**Step 2: Replace `buyDate` column cell**

Replace:
```tsx
cell: ({ row }) => (
  <span className="text-sm">{formatDate(row.original.buyDate)}</span>
),
```
With:
```tsx
cell: ({ row, table }) => (
  <InlineDateCell
    value={row.original.buyDate}
    maxDate={row.original.sellDate ?? undefined}
    onSave={(date) =>
      table.options.meta!.onInlineUpdate(row.original.id, { buyDate: date })
    }
  />
),
```

**Step 3: Replace `sellDate` column cell**

Replace:
```tsx
cell: ({ row }) => (
  <span className="text-sm">
    {row.original.sellDate ? formatDate(row.original.sellDate) : "\u2014"}
  </span>
),
```
With:
```tsx
cell: ({ row, table }) => (
  <InlineDateCell
    value={row.original.sellDate}
    minDate={row.original.buyDate}
    placeholder="—"
    onSave={(date) =>
      table.options.meta!.onInlineUpdate(row.original.id, { sellDate: date })
    }
  />
),
```

**Step 4: Replace `buyPrice` column cell**

Replace:
```tsx
cell: ({ row }) => (
  <span className="block text-right tabular-nums text-sm">
    {formatPrice(row.original.buyPrice, row.original.tradeCurrency)}
  </span>
),
```
With:
```tsx
cell: ({ row, table }) => (
  <InlinePriceCell
    value={row.original.buyPrice}
    currency={row.original.tradeCurrency}
    onSave={(price) =>
      table.options.meta!.onInlineUpdate(row.original.id, { buyPrice: price })
    }
  />
),
```

**Step 5: Replace `sellPrice` column cell**

Replace:
```tsx
cell: ({ row }) => (
  <span className="block text-right tabular-nums text-sm">
    {row.original.sellPrice !== null
      ? formatPrice(row.original.sellPrice, row.original.tradeCurrency)
      : "\u2014"}
  </span>
),
```
With:
```tsx
cell: ({ row, table }) => {
  if (row.original.sellPrice === null) {
    return <span className="block text-right text-sm text-muted-foreground">—</span>;
  }
  return (
    <InlinePriceCell
      value={row.original.sellPrice}
      currency={row.original.tradeCurrency}
      onSave={(price) =>
        table.options.meta!.onInlineUpdate(row.original.id, { sellPrice: price })
      }
    />
  );
},
```

Note: `sellPrice` inline edit only for already-sold trades. Opening a position to sell (setting sellPrice+sellDate for first time) stays via the dialog — that requires both fields together + marketplace.

**Step 6: Remove unused `formatDate` import if no longer used directly in columns**

Check imports — `formatDate` is now only used inside `InlineDateCell`. Remove from `columns.tsx` imports if unused.

**Step 7: Full verification**
```bash
cd E:/giftsite && npx tsc --noEmit && npm run lint && npm test
```
Expected: all pass.

**Step 8: Self-audit the full feature**
- Click buyDate → Calendar opens, pick date → saves → toast via invalidate ✓
- Click buyPrice → input shows TON/Stars in correct format → Enter saves ✓
- Click sellDate cell (sold trade only) → Calendar with minDate=buyDate ✓
- Click sellPrice cell (sold trade only) → input with correct currency ✓
- ESC on price input → cancels ✓
- Invalid price → red border, stays in edit mode ✓
- buyDate > sellDate → server returns BAD_REQUEST → toast.error ✓
- TypeScript strict: no `any`, no `as` casts ✓

---

## Task 6: Commit

```bash
cd E:/giftsite
git add src/server/api/routers/trades.ts \
        src/app/\(dashboard\)/trades/_components/inline-date-cell.tsx \
        src/app/\(dashboard\)/trades/_components/inline-price-cell.tsx \
        src/app/\(dashboard\)/trades/_components/columns.tsx \
        src/app/\(dashboard\)/trades/_components/trades-table.tsx \
        docs/plans/2026-03-05-inline-cell-editing.md
git commit -m "feat: inline cell editing for buyDate, buyPrice, sellDate, sellPrice"
```

---

## Risk Register

| Risk | Mitigation |
|------|-----------|
| buyDate > sellDate | Validated both client-side (maxDate/minDate on Calendar) and server-side (TRPCError) |
| TON nanoton conversion errors | `parseTonInput` throws on invalid input → caught in `commit()` → red border |
| Double-save on blur after Enter | `editing` set to `false` before async call → blur finds `editing=false`, returns early |
| `meta!` non-null assertion | Safe: all table rows are rendered inside `TradesTable` which always provides meta |
| sellPrice=null rows (open positions) | Static "—" rendered for sellPrice, no InlinePriceCell |
