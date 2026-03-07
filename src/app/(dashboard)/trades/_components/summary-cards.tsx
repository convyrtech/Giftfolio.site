"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc/client";
import { formatStars, formatTon, nanotonToStars, STARS_USD_RATE, type Stars, type NanoTon } from "@/lib/currencies";
import { formatNumber, formatUsd } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Diamond, DollarSign, Star, TrendingUp, Briefcase, Sigma } from "lucide-react";

const periods = ["total", "year", "month", "week", "day"] as const;
type Period = (typeof periods)[number];

export function SummaryCards(): React.ReactElement {
  const [period, setPeriod] = useState<Period>("total");
  const t = useTranslations("dashboard");

  const { data, isLoading } = trpc.stats.dashboard.useQuery(
    { period },
    { staleTime: 30_000 },
  );
  const { data: portfolio, isLoading: portfolioLoading } = trpc.stats.portfolioValue.useQuery(
    undefined,
    { staleTime: 60 * 60 * 1000 },
  );
  const { data: settings } = trpc.settings.get.useQuery(undefined, { staleTime: 60_000 });
  const { data: rates } = trpc.market.exchangeRates.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

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

  // Combined PnL: convert TON profit to Stars using user rate
  const rate = settings?.starsToTonRate;
  const showCombined = rate && starsStat && tonStat;
  let combinedStars: bigint | null = null;
  if (showCombined) {
    const tonAsStars = nanotonToStars(tonProfit as NanoTon, rate);
    combinedStars = starsProfit + tonAsStars;
  }

  // USD PnL: convert both currencies to USD using live rates
  const starsUsd = starsStat ? Number(starsProfit) * STARS_USD_RATE : null;
  const tonUsd = tonStat && rates?.tonUsd != null
    ? Number(tonProfit) / 1e9 * rates.tonUsd
    : null;
  const totalUsd = starsUsd != null || tonUsd != null
    ? (starsUsd ?? 0) + (tonUsd ?? 0)
    : null;
  // Mark partial when we have TON trades but no rate
  const usdIsPartial = tonStat != null && rates?.tonUsd == null;

  const defaultCurrency = settings?.defaultCurrency ?? "TON";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{t("title")}</h2>
        <Tabs value={period} onValueChange={(v) => { if ((periods as readonly string[]).includes(v)) setPeriod(v as Period); }}>
          <TabsList className="h-8">
            <TabsTrigger value="total" className="text-xs px-2">{t("periodAll")}</TabsTrigger>
            <TabsTrigger value="year" className="text-xs px-2">{t("periodYear")}</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-2">{t("periodMonth")}</TabsTrigger>
            <TabsTrigger value="week" className="text-xs px-2">{t("periodWeek")}</TabsTrigger>
            <TabsTrigger value="day" className="text-xs px-2">{t("periodDay")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <ProfitCard
          key={defaultCurrency}
          tonProfit={tonStat ? tonProfit : null}
          starsProfit={starsStat ? starsProfit : null}
          combinedStars={combinedStars}
          rate={rate ?? null}
          totalUsd={totalUsd}
          usdIsPartial={usdIsPartial}
          defaultCurrency={defaultCurrency}
        />
        <StatCard
          title={t("totalTrades")}
          value={formatNumber(totalTrades)}
          subtitle={t("closedCount", { count: closedTrades })}
          icon={<TrendingUp className="h-4 w-4" />}
          accentClass="border-primary/50"
        />
        <StatCard
          title={portfolio?.available ? t("portfolioValue") : t("openPositions")}
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

type ProfitMode = "stars" | "ton" | "combined" | "usd";

const modeLabel: Record<ProfitMode, string> = { stars: "★", ton: "TON", combined: "Σ", usd: "USDT" };

interface ProfitCardProps {
  tonProfit: bigint | null;
  starsProfit: bigint | null;
  combinedStars: bigint | null;
  rate: string | null;
  totalUsd: number | null;
  usdIsPartial: boolean;
  defaultCurrency: "STARS" | "TON" | "USDT";
}

function ProfitCard({ tonProfit, starsProfit, combinedStars, rate, totalUsd, usdIsPartial, defaultCurrency }: ProfitCardProps): React.ReactElement {
  const t = useTranslations("dashboard");

  // Determine available modes
  const modes: ProfitMode[] = [];
  if (starsProfit !== null) modes.push("stars");
  if (tonProfit !== null) modes.push("ton");
  if (combinedStars !== null) modes.push("combined");
  if (totalUsd !== null) modes.push("usd");

  // Default to user's preferred currency
  const preferredMode: ProfitMode =
    defaultCurrency === "STARS" ? "stars" : defaultCurrency === "USDT" ? "usd" : "ton";
  const initialMode = modes.includes(preferredMode) ? preferredMode : modes[0] ?? "stars";
  const [mode, setMode] = useState<ProfitMode>(initialMode);

  // If current mode becomes unavailable (e.g. period changes), fall back
  const activeMode = modes.includes(mode) ? mode : modes[0] ?? "stars";

  let displayValue: string;
  let isPositive: boolean;
  let isNegative: boolean;
  let subtitle: string | undefined;
  let icon: React.ReactNode;
  let accentClass: string;

  if (activeMode === "usd") {
    const usd = totalUsd ?? 0;
    displayValue = formatUsd(usd);
    isPositive = usd > 0;
    isNegative = usd < 0;
    icon = <DollarSign className="h-4 w-4" />;
    accentClass = "border-emerald-500/50";
    if (usdIsPartial) subtitle = t("usdtPartial");
  } else {
    let profit: bigint;
    switch (activeMode) {
      case "ton":
        profit = tonProfit ?? 0n;
        displayValue = formatTon(profit as NanoTon);
        icon = <Diamond className="h-4 w-4" />;
        accentClass = "border-ton-accent";
        break;
      case "combined":
        profit = combinedStars ?? 0n;
        displayValue = formatStars(profit as Stars);
        subtitle = rate ? t("combinedRate", { rate }) : undefined;
        icon = <Sigma className="h-4 w-4" />;
        accentClass = "border-primary/50";
        break;
      case "stars":
      default:
        profit = starsProfit ?? 0n;
        displayValue = formatStars(profit as Stars);
        icon = <Star className="h-4 w-4" />;
        accentClass = "border-stars-accent";
        break;
    }
    isPositive = profit > 0n;
    isNegative = profit < 0n;
  }

  const ariaLabel = (m: ProfitMode): string => {
    switch (m) {
      case "stars": return t("starsProfit");
      case "ton": return t("tonProfit");
      case "combined": return t("combined");
      case "usd": return t("usdtProfit");
    }
  };

  return (
    <Card className={cn("border-l-2", accentClass)}>
      <CardHeader className="pb-1">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {icon}
            {t("profit")}
          </span>
          {modes.length > 1 && (
            <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
              {modes.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  aria-label={ariaLabel(m)}
                  aria-pressed={activeMode === m}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    activeMode === m
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {modeLabel[m]}
                </button>
              ))}
            </div>
          )}
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
          {isPositive ? "+" : ""}{displayValue}
        </div>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
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
  const t = useTranslations("dashboard");
  return (
    <div className="space-y-3" role="status" aria-label={t("loadingStats")}>
      <Skeleton className="h-5 w-24" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
