"use client";

import type { ColumnDef, RowData } from "@tanstack/react-table";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { formatStars, formatTon, type Stars, type NanoTon } from "@/lib/currencies";
import { calculateProfit, calculateUnrealizedPnl } from "@/lib/pnl-engine";
import { getGiftImageUrl } from "@/lib/gift-parser";
import { getCollectionImageUrl } from "@/lib/gift-bubbles";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Trade, Marketplace } from "@/server/db/schema";
import { TradeRowActions } from "./trade-row-actions";
import { InlineDateCell } from "./inline-date-cell";
import { InlinePriceCell } from "./inline-price-cell";
import { InlineCommissionCell } from "./inline-commission-cell";
import { InlineNotesCell } from "./inline-notes-cell";
import { InlineMarketplaceCell } from "./inline-marketplace-cell";

export interface InlineUpdateFields {
  buyDate?: Date;
  buyPrice?: bigint;
  sellDate?: Date;
  sellPrice?: bigint;
  commissionFlatStars?: bigint;
  commissionPermille?: number;
  notes?: string;
  buyMarketplace?: Marketplace | null;
  sellMarketplace?: Marketplace | null;
}

export interface TradesTableMeta {
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  onToggleHidden: (trade: Trade) => void;
  onToggleExclude: (trade: Trade) => void;
  onInlineUpdate: (id: bigint, fields: InlineUpdateFields) => Promise<void>;
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
    onInlineUpdate: (id: bigint, fields: InlineUpdateFields) => Promise<void>;
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
    transferredCount: trade.transferredCount,
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
        : getCollectionImageUrl(trade.giftName);

      return (
        <div className="flex items-center gap-2">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={trade.giftName}
              width={40}
              height={40}
              sizes="40px"
              loading="lazy"
              className="rounded"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-muted text-xs font-medium text-muted-foreground">
              {trade.giftName.slice(0, 2)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1 truncate text-sm font-medium">
              {trade.giftName}
              {trade.quantity > 1 && hasNumber && (
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
              {hasNumber ? `#${String(trade.giftNumber)}` : `×${trade.quantity} collection`}
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
    cell: ({ row }) => {
      const currency = row.original.tradeCurrency;
      return (
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            currency === "TON" && "border-ton-accent/50 text-ton-accent",
            currency === "STARS" && "border-stars-accent/50 text-stars-accent",
          )}
        >
          {currency}
        </Badge>
      );
    },
    size: 80,
  },
  {
    accessorKey: "buyDate",
    header: "Bought",
    cell: ({ row, table }) => (
      <InlineDateCell
        value={row.original.buyDate}
        maxDate={row.original.sellDate ?? undefined}
        onSave={(date) =>
          table.options.meta!.onInlineUpdate(row.original.id, { buyDate: date })
        }
      />
    ),
    size: 100,
  },
  {
    accessorKey: "sellDate",
    header: "Sold",
    cell: ({ row, table }) => {
      // Open position: sellDate=null requires sellPrice to be set simultaneously.
      // That needs the full dialog (both fields together). Static dash here.
      if (row.original.sellDate === null) {
        return <span className="block text-sm text-muted-foreground">—</span>;
      }
      return (
        <InlineDateCell
          value={row.original.sellDate}
          minDate={row.original.buyDate}
          onSave={(date) =>
            table.options.meta!.onInlineUpdate(row.original.id, { sellDate: date })
          }
        />
      );
    },
    size: 100,
  },
  {
    accessorKey: "buyPrice",
    header: () => <span className="block text-right">Buy Price</span>,
    cell: ({ row, table }) => (
      <InlinePriceCell
        value={row.original.buyPrice}
        currency={row.original.tradeCurrency}
        onSave={(price) =>
          table.options.meta!.onInlineUpdate(row.original.id, { buyPrice: price })
        }
      />
    ),
    size: 120,
  },
  {
    accessorKey: "sellPrice",
    header: () => <span className="block text-right">Sell Price</span>,
    cell: ({ row, table }) => {
      if (row.original.sellPrice === null) {
        return (
          <span className="block text-right text-sm text-muted-foreground">—</span>
        );
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
    size: 120,
  },
  {
    id: "commission",
    header: "Comm.",
    cell: ({ row, table }) => (
      <InlineCommissionCell
        flatStars={row.original.commissionFlatStars}
        permille={row.original.commissionPermille}
        currency={row.original.tradeCurrency}
        onSave={(fields) =>
          table.options.meta!.onInlineUpdate(row.original.id, fields)
        }
      />
    ),
    size: 90,
  },
  {
    id: "buyMarketplace",
    header: "Buy MP",
    cell: ({ row, table }) => (
      <InlineMarketplaceCell
        value={row.original.buyMarketplace}
        onSave={(mp) =>
          table.options.meta!.onInlineUpdate(row.original.id, { buyMarketplace: mp })
        }
      />
    ),
    size: 100,
  },
  {
    id: "sellMarketplace",
    header: "Sell MP",
    cell: ({ row, table }) => (
      <InlineMarketplaceCell
        value={row.original.sellMarketplace}
        onSave={(mp) =>
          table.options.meta!.onInlineUpdate(row.original.id, { sellMarketplace: mp })
        }
      />
    ),
    size: 100,
  },
  {
    id: "profit",
    header: () => <span className="block text-right">Profit</span>,
    cell: ({ row }) => {
      const result = computeProfit(row.original);
      if (!result) return <span className="block text-right text-sm text-muted-foreground">{"\u2014"}</span>;

      const isPositive = result.value > 0n;
      const isNegative = result.value < 0n;
      const excluded = row.original.excludeFromPnl;

      return (
        <div className="flex justify-end tabular-nums text-sm">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium",
              excluded && "opacity-50",
              isPositive && "bg-profit/10 text-profit",
              isNegative && "bg-loss/10 text-loss",
              !isPositive && !isNegative && "text-muted-foreground",
            )}
          >
            {isPositive ? "+" : ""}
            {formatPrice(result.value, row.original.tradeCurrency)}
            {excluded ? (
              <span className="text-xs opacity-70">(excl.)</span>
            ) : result.percent !== null ? (
              <span className="text-xs opacity-70">
                ({result.percent >= 0 ? "+" : ""}{result.percent.toFixed(1)}%)
              </span>
            ) : null}
          </span>
        </div>
      );
    },
    size: 160,
  },
  {
    id: "unrealizedPnl",
    header: () => <span className="block text-right">Floor / PnL</span>,
    cell: ({ row, table }) => {
      const trade = row.original;
      // Only meaningful for open positions (sellPrice = null means unsold)
      if (trade.sellPrice !== null) {
        return <span className="block text-right text-sm text-muted-foreground">{"\u2014"}</span>;
      }

      const floorPrices = table.options.meta?.floorPrices ?? {};
      // gift-bubbles keys are normalized: "EasterEgg" → "easteregg"
      const normalizedName = trade.giftName.toLowerCase().replace(/[^a-z0-9]/g, "");
      const floorStars = floorPrices[normalizedName];
      if (floorStars === undefined || floorStars <= 0) {
        return <span className="block text-right text-xs text-muted-foreground">N/A</span>;
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
              <span className="block text-right tabular-nums text-sm text-muted-foreground">
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
        <div className="text-right tabular-nums text-sm">
          <div className="text-xs text-muted-foreground">
            {formatPrice(result.floorPriceStars, "STARS")}
          </div>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium",
              isPositive && "bg-profit/10 text-profit",
              isNegative && "bg-loss/10 text-loss",
            )}
          >
            {isPositive ? "+" : ""}
            {formatPrice(result.unrealizedPnl, "STARS")}
            {result.unrealizedPercent !== null && (
              <span className="text-xs opacity-70">
                ({result.unrealizedPercent >= 0 ? "+" : ""}{result.unrealizedPercent.toFixed(1)}%)
              </span>
            )}
          </span>
        </div>
      );
    },
    size: 150,
  },
  {
    id: "notes",
    header: "",
    cell: ({ row, table }) => (
      <InlineNotesCell
        notes={row.original.notes}
        onSave={(text) =>
          table.options.meta!.onInlineUpdate(row.original.id, { notes: text })
        }
      />
    ),
    size: 40,
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
