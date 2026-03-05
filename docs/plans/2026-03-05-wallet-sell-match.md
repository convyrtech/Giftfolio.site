# Wallet Sell-Side Auto-Match Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When scanning a TON wallet, detect sell events and match them to open positions — allowing the user to close positions without manual data entry.

**Architecture:** Extend `walletImportPreview` to return sell matches (sell event + matched open position). Add `walletSellConfirm` mutation that patches `sellPrice`/`sellDate` on matched trades. Extend `ImportWalletDialog` with a Sells tab in the preview step.

**Tech Stack:** tRPC, Drizzle ORM, existing `importTradesFromWallet` (already detects sells), shadcn/ui Tabs

---

## Key Decisions

- **Matching logic**: `giftSlug = buildGiftPascalSlug(giftName, giftNumber)` + open position (`sellDate IS NULL`) owned by this user
- **No match found**: show sell in preview as "unmatched" — skip silently on confirm (never error)
- **Multiple open positions same gift**: take the oldest by `buyDate` (FIFO — standard trading convention)
- **Rate limit**: `walletSellConfirm` shares the same `importRateLimit` (5/hour total)
- **sellRateUsd**: fetch TON/USD rate at confirm time (same as buy import does for buyRateUsd)

---

## Task 1: Extend `walletImportPreview` to return sell matches

**Files:**
- Modify: `src/server/api/routers/trades.ts` (walletImportPreview mutation)

**Context:** `importTradesFromWallet` already returns sells with `side: "sell"`. Currently the preview strips them. We need to:
1. Take the sell trades from the result
2. For each sell, query DB for a matching open position
3. Return matches to client

**Step 1: Add sell match query inside `walletImportPreview`**

After the existing `const result = await importTradesFromWallet(walletAddress);` block, add:

```ts
// Sell-side: find open positions matching each sell event
const sellTrades = result.trades.filter((t) => t.side === "sell");

// Batch lookup: fetch all open positions for this user that match any of the sell gifts
const sellMatches: Array<{
  eventId: string;
  giftName: string;
  giftNumber: number;
  priceNanoton: string; // sell price from wallet
  timestamp: number;
  matchedTradeId: bigint | null; // null = no open position found
  matchedBuyDate: Date | null;
}> = [];

for (const sell of sellTrades) {
  const giftSlug = buildGiftPascalSlug(sell.giftName, sell.giftNumber);
  // Find oldest open position for this gift (FIFO)
  const [match] = await ctx.db
    .select({ id: trades.id, buyDate: trades.buyDate })
    .from(trades)
    .where(
      and(
        eq(trades.userId, userId),
        eq(trades.giftSlug, giftSlug),
        eq(trades.giftNumber, BigInt(sell.giftNumber)),
        isNull(trades.sellDate),
        isNull(trades.deletedAt),
      ),
    )
    .orderBy(trades.buyDate) // FIFO: oldest first
    .limit(1);

  sellMatches.push({
    eventId: sell.eventId,
    giftName: sell.giftName,
    giftNumber: sell.giftNumber,
    priceNanoton: sell.priceNanoton.toString(),
    timestamp: sell.timestamp,
    matchedTradeId: match?.id ?? null,
    matchedBuyDate: match?.buyDate ?? null,
  });
}
```

**Step 2: Add `sellMatches` to return object**

```ts
return {
  trades: result.trades.filter((t) => t.side === "buy").map((t) => ({
    // ... existing buy fields
  })),
  sellMatches,  // NEW
  eventsFetched: result.eventsFetched,
  rateLimited: result.rateLimited,
};
```

**Step 3: Run tsc to verify**
```bash
npx tsc --noEmit
```
Expected: no errors

**Step 4: Commit**
```bash
git add src/server/api/routers/trades.ts
git commit -m "feat: walletImportPreview returns sell matches alongside buys"
```

---

## Task 2: Add `walletSellConfirm` mutation

**Files:**
- Modify: `src/server/api/routers/trades.ts` (add new mutation after `walletImportConfirm`)

**Step 1: Write the mutation**

```ts
walletSellConfirm: rateLimitedProcedure
  .input(
    z.object({
      sells: z
        .array(
          z.object({
            tradeId: z.coerce.bigint().positive(),
            priceNanoton: z.string().regex(/^\d+$/, "Must be a non-negative integer string"),
            timestamp: z.number().int().positive(),
            eventId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9\-_]+$/, "Invalid event ID"),
          }),
        )
        .min(1)
        .max(500),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    const rl = await importRateLimit.limit(userId);
    if (!rl.success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Import rate limit exceeded. Try again later.",
      });
    }

    const tonRate = await getTonUsdRate();
    const tonRateStr = tonRate?.toString() ?? null;

    let closed = 0;
    const errors: Array<{ eventId: string; message: string }> = [];

    for (const sell of input.sells) {
      // Security: verify trade belongs to this user before updating
      const [trade] = await ctx.db
        .select({ id: trades.id, sellDate: trades.sellDate })
        .from(trades)
        .where(and(eq(trades.id, sell.tradeId), eq(trades.userId, userId)))
        .limit(1);

      if (!trade) {
        errors.push({ eventId: sell.eventId, message: "Trade not found" });
        continue;
      }
      if (trade.sellDate !== null) {
        errors.push({ eventId: sell.eventId, message: "Position already closed" });
        continue;
      }

      await ctx.db
        .update(trades)
        .set({
          sellPrice: BigInt(sell.priceNanoton),
          sellDate: new Date(sell.timestamp * 1000),
          sellRateUsd: tonRateStr,
          notes: sql`COALESCE(${trades.notes} || E'\n', '') || ${"Sell imported from wallet (event: " + sell.eventId + ")"}`,
        })
        .where(and(eq(trades.id, sell.tradeId), eq(trades.userId, userId)));

      closed++;
    }

    return { closed, skipped: errors.length, errors };
  }),
```

**Step 2: Run tsc**
```bash
npx tsc --noEmit
```

**Step 3: Commit**
```bash
git add src/server/api/routers/trades.ts
git commit -m "feat: walletSellConfirm mutation — close positions from wallet sell events"
```

---

## Task 3: Extend `ImportWalletDialog` preview step with Sells tab

**Files:**
- Modify: `src/app/(dashboard)/trades/_components/import-wallet-dialog.tsx`

**Step 1: Update `PreviewTrade` interface and add `SellMatch` interface**

```ts
interface SellMatch {
  eventId: string;
  giftName: string;
  giftNumber: number;
  priceNanoton: string;
  timestamp: number;
  matchedTradeId: string | null; // bigint serialized as string
  matchedBuyDate: number | null; // timestamp ms
}
```

**Step 2: Add state for sell matches**

```ts
const [sellMatches, setSellMatches] = useState<SellMatch[]>([]);
const [selectedSellIds, setSelectedSellIds] = useState<Set<string>>(new Set());
```

Update `previewMutation.onSuccess`:
```ts
onSuccess: (data) => {
  setAllTrades(data.trades);
  setSellMatches(data.sellMatches);
  setEventsFetched(data.eventsFetched);
  setWasRateLimited(data.rateLimited);
  // Pre-select all buy trades
  const buyIds = data.trades.filter((t) => t.side === "buy").map((t) => t.eventId);
  setSelectedIds(new Set(buyIds));
  // Pre-select all matched sells (unmatched = no tradeId, skip)
  const matchedSellIds = data.sellMatches
    .filter((s) => s.matchedTradeId !== null)
    .map((s) => s.eventId);
  setSelectedSellIds(new Set(matchedSellIds));
  setStep("preview");
},
```

Update `reset()`:
```ts
setSellMatches([]);
setSelectedSellIds(new Set());
```

**Step 3: Add `sellConfirmMutation`**

```ts
const sellConfirmMutation = trpc.trades.walletSellConfirm.useMutation({
  onError: (err) => { toast.error(err.message); },
});
```

**Step 4: Update `handleConfirm` to fire both mutations in sequence**

```ts
const handleConfirm = async (): Promise<void> => {
  const selectedBuys = buyTrades.filter((t) => selectedIds.has(t.eventId));
  const selectedSells = matchedSells.filter((s) => selectedSellIds.has(s.eventId));

  if (selectedBuys.length === 0 && selectedSells.length === 0) {
    toast.error("Select at least one trade to import");
    return;
  }

  let buyResult: ImportResult = { inserted: 0, skipped: 0, errors: [] };
  let sellResult: { closed: number; skipped: number } = { closed: 0, skipped: 0 };

  if (selectedBuys.length > 0) {
    buyResult = await confirmMutation.mutateAsync({
      trades: selectedBuys.map((t) => ({
        giftName: t.giftName,
        giftNumber: t.giftNumber,
        priceNanoton: t.priceNanoton,
        timestamp: t.timestamp,
        eventId: t.eventId,
      })),
    });
  }

  if (selectedSells.length > 0) {
    sellResult = await sellConfirmMutation.mutateAsync({
      sells: selectedSells.map((s) => ({
        tradeId: s.matchedTradeId!,
        priceNanoton: s.priceNanoton,
        timestamp: s.timestamp,
        eventId: s.eventId,
      })),
    });
  }

  setResult({
    inserted: buyResult.inserted,
    skipped: buyResult.skipped,
    errors: buyResult.errors,
    closed: sellResult.closed,
  });
  setStep("result");
  void utils.trades.list.invalidate();
  void utils.stats.invalidate();
};
```

**Step 5: Update `ImportResult` interface**

```ts
interface ImportResult {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  closed: number; // NEW: positions closed by sells
}
```

**Step 6: Add Sells tab in preview step UI**

Replace the existing preview content with a `Tabs` component:

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// In preview step JSX:
<Tabs defaultValue="buys">
  <TabsList className="w-full">
    <TabsTrigger value="buys" className="flex-1">
      Purchases ({buyTrades.length})
    </TabsTrigger>
    <TabsTrigger value="sells" className="flex-1">
      Sales ({matchedSells.length})
      {unmatchedSells.length > 0 && (
        <Badge variant="outline" className="ml-1 text-xs">{unmatchedSells.length} unmatched</Badge>
      )}
    </TabsTrigger>
  </TabsList>

  <TabsContent value="buys">
    {/* existing buy list UI */}
  </TabsContent>

  <TabsContent value="sells">
    {matchedSells.length === 0 && unmatchedSells.length === 0 ? (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
        <p className="text-sm">No sales detected in this wallet scan.</p>
      </div>
    ) : (
      <div className="space-y-2">
        {matchedSells.length > 0 && (
          <>
            <p className="text-xs text-muted-foreground pb-1">
              These sales match open positions and will close them:
            </p>
            {matchedSells.map((sell) => (
              <div key={sell.eventId} role="listitem"
                className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/50">
                <Checkbox
                  checked={selectedSellIds.has(sell.eventId)}
                  onCheckedChange={() => toggleOneSell(sell.eventId)}
                  id={`sell-${sell.eventId}`}
                />
                <label htmlFor={`sell-${sell.eventId}`}
                  className="flex flex-1 cursor-pointer items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium">
                      {sell.giftName}{" "}
                      <span className="text-muted-foreground">#{sell.giftNumber}</span>
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {new Date(sell.timestamp * 1000).toLocaleDateString()} · closes position
                    </div>
                  </div>
                  <span className="tabular-nums text-sm shrink-0">
                    {formatTon(toNanoTon(sell.priceNanoton))}
                  </span>
                </label>
              </div>
            ))}
          </>
        )}
        {unmatchedSells.length > 0 && (
          <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {unmatchedSells.length} sale{unmatchedSells.length !== 1 ? "s" : ""} detected but
            no matching open position found — skipped.
          </div>
        )}
      </div>
    )}
  </TabsContent>
</Tabs>
```

Derived values to add before return:
```ts
const matchedSells = sellMatches.filter((s) => s.matchedTradeId !== null);
const unmatchedSells = sellMatches.filter((s) => s.matchedTradeId === null);

const toggleOneSell = (eventId: string): void => {
  const next = new Set(selectedSellIds);
  if (next.has(eventId)) { next.delete(eventId); } else { next.add(eventId); }
  setSelectedSellIds(next);
};
```

**Step 7: Update result step to show closed count**

```tsx
{result.closed > 0 && (
  <div className="flex justify-between text-sm">
    <span className="text-muted-foreground">Positions closed</span>
    <span className="font-medium text-profit">{result.closed}</span>
  </div>
)}
```

**Step 8: Update button label in footer**

```tsx
const totalSelected = selectedIds.size + selectedSellIds.size;
// ...
`Import ${totalSelected} action${totalSelected !== 1 ? "s" : ""}`
```

**Step 9: Run tsc + lint**
```bash
npx tsc --noEmit && npm run lint
```

**Step 10: Commit**
```bash
git add src/app/(dashboard)/trades/_components/import-wallet-dialog.tsx
git commit -m "feat: wallet import preview shows sells — close open positions from wallet history"
```

---

## Task 4: Fix notes SQL injection in walletSellConfirm

**Context:** In Task 2, notes field uses string concatenation with `sell.eventId`. The eventId is regex-validated (`/^[a-zA-Z0-9\-_]+$/`) so it's safe from injection, but the SQL `COALESCE` expression uses template literal. Use parameterized form instead.

**Files:**
- Modify: `src/server/api/routers/trades.ts` (walletSellConfirm)

**Step 1: Replace notes update with safe parameterized expression**

```ts
// Safe: eventId is already validated by Zod regex — but use sql template for correctness
const noteAppend = `Sell imported from wallet (event: ${sell.eventId})`;
await ctx.db
  .update(trades)
  .set({
    sellPrice: BigInt(sell.priceNanoton),
    sellDate: new Date(sell.timestamp * 1000),
    sellRateUsd: tonRateStr,
    notes: sql`COALESCE(${trades.notes} || E'\n', '') || ${noteAppend}`,
  })
  .where(and(eq(trades.id, sell.tradeId), eq(trades.userId, userId)));
```

Note: `sql\`...\`` with `${noteAppend}` as a value is parameterized by Drizzle — safe.

**Step 2: Run full verification**
```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```
Expected: all pass

**Step 3: Final commit**
```bash
git add src/server/api/routers/trades.ts
git commit -m "fix: parameterize notes append in walletSellConfirm"
```

---

## Task 5: Self-audit + code review

Run mandatory self-audit questions from CLAUDE.md:
1. Where did I take the lazy path? (check types, null handling, error cases)
2. What did I skip quietly? (unmatched sells UI, edge cases with deleted trades)
3. What's dead code? (any unreachable branches)
4. Is every export used?

Run verification chain:
```bash
npx tsc --noEmit && npm run lint && npm test && npm run build
```

Then run `code-review` skill on all changed files.

Final commit if any fixes needed:
```bash
git add -p
git commit -m "fix: self-audit corrections for wallet sell-match feature"
```
