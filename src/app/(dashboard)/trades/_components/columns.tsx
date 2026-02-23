"use client";

import type { ColumnDef, RowData } from "@tanstack/react-table";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/formatters";
import { formatStars, formatTon, type Stars, type NanoTon } from "@/lib/currencies";
import { calculateProfit } from "@/lib/pnl-engine";
import { getGiftImageUrl } from "@/lib/gift-parser";
import type { Trade } from "@/server/db/schema";
import { TradeRowActions } from "./trade-row-actions";

export interface TradesTableMeta {
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  onToggleHidden: (trade: Trade) => void;
  onToggleExclude: (trade: Trade) => void;
}

// Type-safe module augmentation — removes need for unsafe `as` cast
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    onEdit: (trade: Trade) => void;
    onDelete: (trade: Trade) => void;
    onToggleHidden: (trade: Trade) => void;
    onToggleExclude: (trade: Trade) => void;
  }
}

function formatPrice(price: bigint, currency: "STARS" | "TON"): string {
  if (currency === "STARS") {
    return formatStars(price as Stars);
  }
  return formatTon(price as NanoTon);
}

/**
 * Compute profit client-side using the canonical pnl-engine (single source of truth).
 */
function computeProfit(trade: Trade): { value: bigint; percent: number | null } | null {
  const result = calculateProfit({
    tradeCurrency: trade.tradeCurrency,
    buyPrice: trade.buyPrice,
    sellPrice: trade.sellPrice,
    commissionFlatStars: trade.commissionFlatStars,
    commissionPermille: trade.commissionPermille,
    buyRateUsd: trade.buyRateUsd,
    sellRateUsd: trade.sellRateUsd,
    quantity: trade.quantity,
  });
  if (result.netProfit === null) return null;
  return { value: result.netProfit, percent: result.profitPercent };
}

export const columns: ColumnDef<Trade>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    size: 40,
  },
  {
    accessorKey: "giftName",
    header: "Gift",
    cell: ({ row }) => {
      const trade = row.original;
      const hasNumber = trade.giftNumber !== null;
      const nameLower = hasNumber
        ? trade.giftSlug.slice(0, trade.giftSlug.lastIndexOf("-")).toLowerCase()
        : trade.giftName.toLowerCase();
      const imageUrl = hasNumber
        ? getGiftImageUrl(nameLower, Number(trade.giftNumber))
        : null;

      return (
        <div className="flex items-center gap-2">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={trade.giftName}
              width={36}
              height={36}
              sizes="36px"
              loading="lazy"
              className="rounded"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
              {trade.giftName.slice(0, 2)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1 truncate text-sm font-medium">
              {trade.giftName}
              {trade.quantity > 1 && (
                <Badge variant="secondary" className="ml-1 px-1 py-0 text-[10px]">
                  x{trade.quantity}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {hasNumber ? `#${String(trade.giftNumber)}` : "Collection"}
            </div>
          </div>
        </div>
      );
    },
    size: 220,
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
    cell: ({ row, table }) => {
      const meta = table.options.meta;
      return (
        <TradeRowActions
          trade={row.original}
          onEdit={() => meta?.onEdit(row.original)}
          onDelete={() => meta?.onDelete(row.original)}
          onToggleHidden={() => meta?.onToggleHidden(row.original)}
          onToggleExclude={() => meta?.onToggleExclude(row.original)}
        />
      );
    },
    size: 50,
  },
];
