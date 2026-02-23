"use client";

import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { trpc } from "@/lib/trpc/client";
import { formatStars, type Stars } from "@/lib/currencies";
import { pascalCaseToSpaces } from "@/lib/gift-parser";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "hsl(var(--muted-foreground) / 0.3)",
];

const chartConfig: ChartConfig = {
  value: { label: "Buy Value" },
};

export function PortfolioDonutChart(): React.ReactElement {
  const { data, isLoading } = trpc.analytics.portfolioComposition.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // Group by currency — only show same-currency items in one donut
  // Stars trades are the vast majority; show them by default
  const starsData = (data ?? [])
    .filter((d) => d.currency === "STARS")
    .map((d) => ({
      name: pascalCaseToSpaces(d.giftName),
      value: Number(d.totalBuy),
      count: d.count,
    }));

  const total = starsData.reduce((sum, d) => sum + d.value, 0);
  const tonCount = (data ?? []).filter((d) => d.currency === "TON").length;

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium">Portfolio Composition</h3>
        <span className="text-xs text-muted-foreground">Stars only</span>
      </div>
      {isLoading ? (
        <Skeleton className="mx-auto h-[250px] w-[250px] rounded-full" />
      ) : starsData.length === 0 ? (
        <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
          {tonCount > 0 ? "No open Stars positions" : "No open positions"}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 lg:flex-row">
          <ChartContainer config={chartConfig} className="h-[250px] w-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      config={chartConfig}
                      formatter={(v) => formatStars(BigInt(Math.round(Number(v))) as Stars)}
                    />
                  }
                />
                <Pie
                  data={starsData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {starsData.map((entry, i) => (
                    <Cell key={entry.name} fill={COLORS[i % COLORS.length]!} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </ChartContainer>
          <div className="flex flex-col gap-1.5 text-xs">
            {starsData.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2">
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="w-24 truncate text-muted-foreground">{d.name}</span>
                <span className="tabular-nums">x{d.count}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
            {tonCount > 0 && (
              <div className="mt-1 text-muted-foreground/60">
                +{tonCount} TON position{tonCount > 1 ? "s" : ""} not shown
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
