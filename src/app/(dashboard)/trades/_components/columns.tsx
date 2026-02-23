"use client";

import type { ColumnDef, RowData } from "@tanstack/react-table";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/formatters";
import { formatStars, formatTon, type Stars, type NanoTon } from "@/lib/currencies";
import { calculateProfit, calculateUnrealizedPnl } from "@/lib/pnl-engine";
import { getGiftImageUrl } from "@/lib/gift-parser";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Trade } from "@/server/db/schema";
import { TradeRowActions } from "./trade-row-actions";

export interface TradesTableMeta {
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  onToggleHidden: (trade: Trade) => void;
  onToggleExclude: (trade: Trade) => void;
  floorPrices: Record<string, number>;
}

// Type-safe module augmentation — removes need for unsafe `as` cast
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    onEdit: (trade: Trade) => void;
    onDelete: (trade: Trade) => void;
    onToggleHidden: (trade: Trade) => void;
    onToggleExclude: (trade: Trade) => void;
    floorPrices: Record<string, number>;
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
              {(() => {
                const rarity = trade.attrModelRarity ?? trade.attrBackdropRarity ?? trade.attrSymbolRarity;
                if (!rarity) return null;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={cn(
                          "ml-1 px-1 py-0 text-[9px]",
                          rarity === "Rare" && "border-yellow-500/50 text-yellow-500",
                          rarity === "Unique" && "border-purple-500/50 text-purple-500",
                        )}
                      >
                        {rarity === "Rare" ? "R" : rarity === "Unique" ? "U" : rarity.charAt(0)}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {trade.attrModel && <div>Model: {trade.attrModel}{trade.attrModelRarity && ` (${trade.attrModelRarity})`}</div>}
                      {trade.attrBackdrop && <div>Backdrop: {trade.attrBackdrop}{trade.attrBackdropRarity && ` (${trade.attrBackdropRarity})`}</div>}
                      {trade.attrSymbol && <div>Symbol: {trade.attrSymbol}{trade.attrSymbolRarity && ` (${trade.attrSymbolRarity})`}</div>}
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
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
    id: "unrealizedPnl",
    header: "Floor / PnL",
    cell: ({ row, table }) => {
      const trade = row.original;
      // Only meaningful for open positions (sellPrice = null means unsold)
      if (trade.sellPrice !== null) {
        return <span className="text-sm text-muted-foreground">{"\u2014"}</span>;
      }

      const floorPrices = table.options.meta?.floorPrices ?? {};
      const floorStars = floorPrices[trade.giftName];
      if (floorStars === undefined || floorStars <= 0) {
        return <span className="text-xs text-muted-foreground">N/A</span>;
      }

      const result = calculateUnrealizedPnl(
        trade.buyPrice,
        trade.tradeCurrency,
        floorStars,
        trade.commissionFlatStars,
        trade.commissionPermille,
        trade.quantity,
      );

      // TON trades: show floor price only, PnL not computable
      if (result.unrealizedPnl === null) {
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="tabular-nums text-sm text-muted-foreground">
                {formatPrice(result.floorPriceStars, "STARS")}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Floor in Stars. TON PnL requires rate conversion.
            </TooltipContent>
          </Tooltip>
        );
      }

      const isPositive = result.unrealizedPnl > 0n;
      const isNegative = result.unrealizedPnl < 0n;

      return (
        <div className="tabular-nums text-sm">
          <div className="text-xs text-muted-foreground">
            {formatPrice(result.floorPriceStars, "STARS")}
          </div>
          <span className={isPositive ? "text-green-500" : isNegative ? "text-red-500" : ""}>
            {isPositive ? "+" : ""}
            {formatPrice(result.unrealizedPnl, "STARS")}
          </span>
          {result.unrealizedPercent !== null && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({result.unrealizedPercent >= 0 ? "+" : ""}{result.unrealizedPercent.toFixed(1)}%)
            </span>
          )}
        </div>
      );
    },
    size: 150,
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
