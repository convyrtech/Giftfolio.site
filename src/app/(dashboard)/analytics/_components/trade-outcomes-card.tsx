"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PERIOD_VALUES = ["week", "month", "total"] as const;
type Period = (typeof PERIOD_VALUES)[number];

export function TradeOutcomesCard(): React.ReactElement {
  const [period, setPeriod] = useState<Period>("total");
  const t = useTranslations("analytics");

  const { data, isLoading } = trpc.analytics.tradeOutcomes.useQuery(
    { period },
    { staleTime: 5 * 60 * 1000 },
  );

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">{t("tradeOutcomes")}</h3>
        <div className="flex gap-1 rounded-md border p-0.5" role="group" aria-label={t("outcomesPeriod")}>
          {PERIOD_VALUES.map((pv) => (
            <button
              key={pv}
              type="button"
              aria-pressed={period === pv}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                period === pv
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPeriod(pv)}
            >
              {pv === "week" ? t("weekPeriod") : pv === "month" ? t("monthPeriod") : t("allTimePeriod")}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : !data || data.total === 0 ? (
        <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
          {t("noClosedTrades")}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Win rate headline */}
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums">
              {data.winRate !== null ? `${data.winRate}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">{t("winRate")}</div>
          </div>

          {/* Progress bar */}
          <div
            className="flex h-3 overflow-hidden rounded-full"
            role="img"
            aria-label={`${data.wins} ${t("wins")}, ${data.breakeven} ${t("even")}, ${data.losses} ${t("losses")}`}
          >
            {(() => {
              const winW = Math.round((data.wins / data.total) * 100);
              const evenW = Math.round((data.breakeven / data.total) * 100);
              const lossW = 100 - winW - evenW;
              return (
                <>
                  {data.wins > 0 && (
                    <div className="bg-green-500 transition-all" style={{ width: `${winW}%` }} />
                  )}
                  {data.breakeven > 0 && (
                    <div className="bg-muted-foreground/30 transition-all" style={{ width: `${evenW}%` }} />
                  )}
                  {data.losses > 0 && (
                    <div className="bg-red-500 transition-all" style={{ width: `${lossW}%` }} />
                  )}
                </>
              );
            })()}
          </div>

          {/* Legend */}
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              {data.wins} {t("wins")}
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
              {data.breakeven} {t("even")}
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              {data.losses} {t("losses")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
