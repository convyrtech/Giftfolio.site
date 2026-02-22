"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { formatStars, formatTon, type Stars, type NanoTon } from "@/lib/currencies";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useState } from "react";

type Period = "total" | "day" | "week" | "month";

export function SummaryCards(): React.ReactElement {
  const [period, setPeriod] = useState<Period>("total");

  const { data, isLoading } = trpc.stats.dashboard.useQuery({ period });

  if (isLoading) return <SummaryCardsSkeleton />;
  if (!data || data.length === 0) return <></>;

  // Aggregate stats by currency
  const starsStat = data.find((s) => s.tradeCurrency === "STARS");
  const tonStat = data.find((s) => s.tradeCurrency === "TON");

  const totalTrades = (starsStat?.totalTrades ?? 0) + (tonStat?.totalTrades ?? 0);
  const openTrades = (starsStat?.openTrades ?? 0) + (tonStat?.openTrades ?? 0);

  // Compute native profits (including permille commission)
  const starsProfit = starsStat
    ? starsStat.totalSell - starsStat.totalBuy - starsStat.totalCommissionFlat - starsStat.totalPermilleCommission
    : 0n;
  const tonProfit = tonStat
    ? tonStat.totalSell - tonStat.totalBuy - tonStat.totalPermilleCommission
    : 0n;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">Dashboard</h2>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="h-8">
            <TabsTrigger value="total" className="text-xs px-2">All</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-2">Month</TabsTrigger>
            <TabsTrigger value="week" className="text-xs px-2">Week</TabsTrigger>
            <TabsTrigger value="day" className="text-xs px-2">Day</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {starsStat && (
          <StatCard
            title="Stars Profit"
            value={formatStars(starsProfit as Stars)}
            isPositive={starsProfit > 0n}
            isNegative={starsProfit < 0n}
          />
        )}
        {tonStat && (
          <StatCard
            title="TON Profit"
            value={formatTon(tonProfit as NanoTon)}
            isPositive={tonProfit > 0n}
            isNegative={tonProfit < 0n}
          />
        )}
        <StatCard
          title="Total Trades"
          value={formatNumber(totalTrades)}
        />
        <StatCard
          title="Open Positions"
          value={formatNumber(openTrades)}
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  isPositive?: boolean;
  isNegative?: boolean;
}

function StatCard({ title, value, isPositive, isNegative }: StatCardProps): React.ReactElement {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-lg font-bold tabular-nums",
            isPositive && "text-green-500",
            isNegative && "text-red-500",
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryCardsSkeleton(): React.ReactElement {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-24" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-3 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
