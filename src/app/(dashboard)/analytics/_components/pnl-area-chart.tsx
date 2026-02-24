"use client";

import { useState, useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc/client";
import { formatStars, formatTon, type Stars, type NanoTon } from "@/lib/currencies";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ChartPeriodSelector, type Range } from "./chart-period-selector";

type Currency = "STARS" | "TON";

const CURRENCIES = [
  { value: "TON" as const, label: "TON" },
  { value: "STARS" as const, label: "Stars" },
];

const chartConfig: ChartConfig = {
  cumulative: {
    label: "Cumulative PnL",
    color: "var(--chart-1)",
  },
};

/** Safe formatter: Recharts Y-axis ticks can be floats — Math.round before BigInt */
function formatTick(v: number, currency: Currency): string {
  const safe = BigInt(Math.round(v));
  return currency === "TON"
    ? formatTon(safe as NanoTon)
    : formatStars(safe as Stars);
}

export function PnlAreaChart(): React.ReactElement {
  const [range, setRange] = useState<Range>("30d");
  const [currency, setCurrency] = useState<Currency>("TON");
  const gradientId = useId().replace(/:/g, "");

  const { data, isLoading } = trpc.analytics.pnlTimeSeries.useQuery(
    {
      range,
      granularity: range === "1y" || range === "all" ? "week" : "day",
      currency,
    },
    { staleTime: 5 * 60 * 1000 },
  );

  // Recharts needs Number — safe for Stars (integers) and TON (nanotons < 9e15 = ~9000 TON)
  const chartData = (data ?? []).map((d) => ({
    date: d.date,
    cumulative: Number(d.cumulative),
    trades: d.trades,
  }));

  const formatValue = (v: number | string): string => {
    const safe = BigInt(Math.round(Number(v)));
    return currency === "TON"
      ? formatTon(safe as NanoTon)
      : formatStars(safe as Stars);
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">Cumulative PnL</h3>
        <div className="flex items-center gap-2">
          {/* Currency toggle */}
          <div className="flex gap-1 rounded-md border p-0.5" role="group" aria-label="Currency">
            {CURRENCIES.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={currency === c.value}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium transition-colors",
                  currency === c.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setCurrency(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <ChartPeriodSelector value={range} onChange={setRange} />
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-[250px] w-full" />
      ) : chartData.length === 0 ? (
        <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
          No closed trades in this period
        </div>
      ) : (
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={(v: string) => {
                  const d = new Date(`${v}T00:00:00`);
                  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
                }}
                className="text-[10px] fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => formatTick(v, currency)}
                className="text-[10px] fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    config={chartConfig}
                    formatter={(v) => formatValue(v as number)}
                    labelFormatter={(label) => {
                      const d = new Date(`${String(label)}T00:00:00`);
                      return d.toLocaleDateString("en", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      });
                    }}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="var(--chart-1)"
                fill={`url(#${gradientId})`}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      )}
    </div>
  );
}
