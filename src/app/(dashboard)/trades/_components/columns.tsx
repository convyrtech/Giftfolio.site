"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/formatters";
import { formatStars, formatTon, type Stars, type NanoTon } from "@/lib/currencies";
import { getGiftImageUrl } from "@/lib/gift-parser";
import type { Trade } from "@/server/db/schema";
import { TradeRowActions } from "./trade-row-actions";

function formatPrice(price: bigint, currency: "STARS" | "TON"): string {
  if (currency === "STARS") {
    return formatStars(price as Stars);
  }
  return formatTon(price as NanoTon);
}

/**
 * Compute profit client-side from trade row data.
 * Stars: sell - buy - flat - ROUND(sell * permille / 1000)
 * TON: sell - buy - ROUND(sell * permille / 1000) (no flat)
 * Uses integer rounding: (a + 500) / 1000 for ROUND behavior.
 */
function computeProfit(trade: Trade): { value: bigint; percent: number | null } | null {
  if (trade.sellPrice === null) return null;
  const buy = trade.buyPrice;
  const sell = trade.sellPrice;

  let commission = 0n;
  if (trade.tradeCurrency === "STARS") {
    commission += trade.commissionFlatStars;
  }
  // Round: (sell * permille + 500) / 1000
  commission += (sell * BigInt(trade.commissionPermille) + 500n) / 1000n;

  const profit = sell - buy - commission;
  const percent = buy > 0n ? Number((profit * 10000n) / buy) / 100 : null;

  return { value: profit, percent };
}

export const columns: ColumnDef<Trade>[] = [
  {
    accessorKey: "giftName",
    header: "Gift",
    cell: ({ row }) => {
      const trade = row.original;
      const nameLower = trade.giftSlug.slice(0, trade.giftSlug.lastIndexOf("-")).toLowerCase();
      const imageUrl = getGiftImageUrl(nameLower, Number(trade.giftNumber));

      return (
        <div className="flex items-center gap-2">
          <Image
            src={imageUrl}
            alt={trade.giftName}
            width={36}
            height={36}
            sizes="36px"
            loading="lazy"
            className="rounded"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{trade.giftName}</div>
            <div className="text-xs text-muted-foreground">#{String(trade.giftNumber)}</div>
          </div>
        </div>
      );
    },
    size: 200,
  },
  {
    accessorKey: "tradeCurrency",
    header: "Currency",
    cell: ({ row }) => (
      <Badge variant="outline" className="text-xs">
        {row.original.tradeCurrency}
      </Badge>
    ),
    size: 80,
  },
  {
    accessorKey: "buyDate",
    header: "Bought",
    cell: ({ row }) => (
      <span className="text-sm">{formatDate(row.original.buyDate)}</span>
    ),
    size: 100,
  },
  {
    accessorKey: "sellDate",
    header: "Sold",
    cell: ({ row }) => (
      <span className="text-sm">
        {row.original.sellDate ? formatDate(row.original.sellDate) : "\u2014"}
      </span>
    ),
    size: 100,
  },
  {
    accessorKey: "buyPrice",
    header: "Buy Price",
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">
        {formatPrice(row.original.buyPrice, row.original.tradeCurrency)}
      </span>
    ),
    size: 120,
  },
  {
    accessorKey: "sellPrice",
    header: "Sell Price",
    cell: ({ row }) => (
      <span className="tabular-nums text-sm">
        {row.original.sellPrice !== null
          ? formatPrice(row.original.sellPrice, row.original.tradeCurrency)
          : "\u2014"}
      </span>
    ),
    size: 120,
  },
  {
    id: "profit",
    header: "Profit",
    cell: ({ row }) => {
      const result = computeProfit(row.original);
      if (!result) return <span className="text-sm text-muted-foreground">{"\u2014"}</span>;

      const isPositive = result.value > 0n;
      const isNegative = result.value < 0n;

      return (
        <div className="tabular-nums text-sm">
          <span
            className={
              isPositive ? "text-green-500" : isNegative ? "text-red-500" : ""
            }
          >
            {isPositive ? "+" : ""}
            {formatPrice(result.value, row.original.tradeCurrency)}
          </span>
          {result.percent !== null && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({result.percent >= 0 ? "+" : ""}{result.percent.toFixed(1)}%)
            </span>
          )}
        </div>
      );
    },
    size: 160,
  },
  {
    id: "actions",
    cell: ({ row }) => <TradeRowActions trade={row.original} />,
    size: 50,
  },
];
