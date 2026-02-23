"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "total", label: "All Time" },
] as const;

type Period = (typeof PERIODS)[number]["value"];

export function TradeOutcomesCard(): React.ReactElement {
  const [period, setPeriod] = useState<Period>("total");

  const { data, isLoading } = trpc.analytics.tradeOutcomes.useQuery(
    { period },
    { staleTime: 5 * 60 * 1000 },
  );

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">Trade Outcomes</h3>
        <div className="flex gap-1 rounded-md border p-0.5" role="group" aria-label="Outcomes period">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              aria-pressed={period === p.value}
              className={cn(
                "rounded px-2 py-1 text-xs font-medium transition-colors",
                period === p.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
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
          No closed trades
        </div>
      ) : (
        <div className="space-y-3">
          {/* Win rate headline */}
          <div className="text-center">
            <div className="text-3xl font-bold tabular-nums">
              {data.winRate !== null ? `${data.winRate}%` : "—"}
            </div>
            <div className="text-xs text-muted-foreground">Win Rate</div>
          </div>

          {/* Progress bar */}
          <div
            className="flex h-3 overflow-hidden rounded-full"
            role="img"
            aria-label={`${data.wins} wins, ${data.breakeven} breakeven, ${data.losses} losses`}
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
              {data.wins} wins
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
              {data.breakeven} even
            </span>
            <span className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full bg-red-500" />
              {data.losses} losses
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
