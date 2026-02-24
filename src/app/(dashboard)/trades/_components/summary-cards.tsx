"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { formatStars, formatTon, type Stars, type NanoTon } from "@/lib/currencies";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Diamond, Star, TrendingUp, Briefcase } from "lucide-react";

const periods = ["total", "day", "week", "month"] as const;
type Period = (typeof periods)[number];

export function SummaryCards(): React.ReactElement {
  const [period, setPeriod] = useState<Period>("total");

  const { data, isLoading } = trpc.stats.dashboard.useQuery(
    { period },
    { staleTime: 30_000 },
  );
  const { data: portfolio, isLoading: portfolioLoading } = trpc.stats.portfolioValue.useQuery(
    undefined,
    { staleTime: 60 * 60 * 1000 },
  );

  if (isLoading) return <SummaryCardsSkeleton />;
  if (!data || data.length === 0) return <></>;

  // Aggregate stats by currency
  const starsStat = data.find((s) => s.tradeCurrency === "STARS");
  const tonStat = data.find((s) => s.tradeCurrency === "TON");

  const totalTrades = (starsStat?.totalTrades ?? 0) + (tonStat?.totalTrades ?? 0);
  const openTrades = (starsStat?.openTrades ?? 0) + (tonStat?.openTrades ?? 0);
  const closedTrades = totalTrades - openTrades;

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
        <Tabs value={period} onValueChange={(v) => { if ((periods as readonly string[]).includes(v)) setPeriod(v as Period); }}>
          <TabsList className="h-8">
            <TabsTrigger value="total" className="text-xs px-2">All</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-2">Month</TabsTrigger>
            <TabsTrigger value="week" className="text-xs px-2">Week</TabsTrigger>
            <TabsTrigger value="day" className="text-xs px-2">Day</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tonStat && (
          <StatCard
            title="TON Profit"
            value={formatTon(tonProfit as NanoTon)}
            isPositive={tonProfit > 0n}
            isNegative={tonProfit < 0n}
            icon={<Diamond className="h-4 w-4" />}
            accentClass="border-ton-accent"
          />
        )}
        {starsStat && (
          <StatCard
            title="Stars Profit"
            value={formatStars(starsProfit as Stars)}
            isPositive={starsProfit > 0n}
            isNegative={starsProfit < 0n}
            icon={<Star className="h-4 w-4" />}
            accentClass="border-stars-accent"
          />
        )}
        <StatCard
          title="Total Trades"
          value={formatNumber(totalTrades)}
          subtitle={`${closedTrades} closed`}
          icon={<TrendingUp className="h-4 w-4" />}
          accentClass="border-primary/50"
        />
        <StatCard
          title={portfolio?.available ? "Portfolio Value" : "Open Positions"}
          value={
            portfolioLoading
              ? "..."
              : portfolio?.available
                ? formatStars(BigInt(Math.round(portfolio.totalStars)) as Stars)
                : formatNumber(openTrades)
          }
          icon={<Briefcase className="h-4 w-4" />}
          accentClass="border-primary/50"
        />
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  isPositive?: boolean;
  isNegative?: boolean;
  icon?: React.ReactNode;
  accentClass?: string;
}

function StatCard({ title, value, subtitle, isPositive, isNegative, icon, accentClass }: StatCardProps): React.ReactElement {
  return (
    <Card className={cn("border-l-2", accentClass)}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={cn(
            "text-2xl font-bold tabular-nums",
            isPositive && "text-profit",
            isNegative && "text-loss",
          )}
        >
          {isPositive ? "+" : ""}{value}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SummaryCardsSkeleton(): React.ReactElement {
  return (
    <div className="space-y-3" role="status" aria-label="Loading dashboard stats">
      <Skeleton className="h-5 w-24" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-l-2 border-muted">
            <CardHeader className="pb-1">
              <Skeleton className="h-3 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
