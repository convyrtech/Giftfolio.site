"use client";

import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStars, formatTon, type Stars, type NanoTon } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import { Trophy, TrendingDown } from "lucide-react";

function formatProfit(value: bigint, currency: "STARS" | "TON"): string {
  if (currency === "TON") return formatTon(value as NanoTon);
  return formatStars(value as Stars);
}

interface TradeRowProps {
  giftName: string | null;
  giftNumber: bigint | null;
  profit: bigint;
  currency: "STARS" | "TON";
  roiPercent: number | null;
}

function TradeRow({ giftName, giftNumber, profit, currency, roiPercent }: TradeRowProps): React.ReactElement {
  const t = useTranslations("analytics");
  const isPositive = profit > 0n;
  const isNegative = profit < 0n;

  return (
    <div className="flex items-center justify-between py-1">
      <div className="min-w-0 truncate text-sm">
        {giftName ?? t("unknown")}
        {giftNumber !== null && (
          <span className="ml-1 text-xs text-muted-foreground">#{String(giftNumber)}</span>
        )}
      </div>
      <div
        className={cn(
          "ml-2 shrink-0 text-right text-sm font-medium tabular-nums",
          isPositive && "text-profit",
          isNegative && "text-loss",
        )}
      >
        {isPositive ? "+" : ""}{formatProfit(profit, currency)}
        {roiPercent !== null && (
          <span className="ml-1 text-xs opacity-70">
            ({roiPercent >= 0 ? "+" : ""}{roiPercent.toFixed(1)}%)
          </span>
        )}
      </div>
    </div>
  );
}

export function BestTradesCard(): React.ReactElement {
  const t = useTranslations("analytics");
  const { data, isLoading } = trpc.analytics.bestTrades.useQuery(
    undefined,
    { staleTime: 5 * 60 * 1000 },
  );

  if (isLoading) {
    return (
      <div className="rounded-lg border p-4">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const hasStars = data && (data.bestStars.length > 0 || data.worstStars);
  const hasTon = data && (data.bestTon.length > 0 || data.worstTon);

  if (!data || (!hasStars && !hasTon)) {
    return (
      <div className="rounded-lg border p-4">
        <h3 className="mb-4 text-sm font-medium">{t("bestWorst")}</h3>
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          {t("noClosedTrades")}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="mb-4 text-sm font-medium">{t("bestWorst")}</h3>

      <div className="space-y-4">
        {/* Best trades */}
        {(data.bestStars.length > 0 || data.bestTon.length > 0) && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Trophy className="h-3.5 w-3.5 text-profit" />
              {t("topTrades")}
            </div>
            {data.bestStars.map((t) => (
              <TradeRow
                key={String(t.id)}
                giftName={t.giftName}
                giftNumber={t.giftNumber}
                profit={t.netProfitStars ?? 0n}
                currency="STARS"
                roiPercent={t.roiPercent}
              />
            ))}
            {data.bestTon.map((t) => (
              <TradeRow
                key={String(t.id)}
                giftName={t.giftName}
                giftNumber={t.giftNumber}
                profit={t.netProfitNanoton ?? 0n}
                currency="TON"
                roiPercent={t.roiPercent}
              />
            ))}
          </div>
        )}

        {/* Worst trades */}
        {(data.worstStars || data.worstTon) && (
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <TrendingDown className="h-3.5 w-3.5 text-loss" />
              {t("worstTrades")}
            </div>
            {data.worstStars && (
              <TradeRow
                giftName={data.worstStars.giftName}
                giftNumber={data.worstStars.giftNumber}
                profit={data.worstStars.netProfitStars ?? 0n}
                currency="STARS"
                roiPercent={data.worstStars.roiPercent}
              />
            )}
            {data.worstTon && (
              <TradeRow
                giftName={data.worstTon.giftName}
                giftNumber={data.worstTon.giftNumber}
                profit={data.worstTon.netProfitNanoton ?? 0n}
                currency="TON"
                roiPercent={data.worstTon.roiPercent}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
