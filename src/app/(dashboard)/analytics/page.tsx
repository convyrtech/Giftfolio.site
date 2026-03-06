import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PnlAreaChart } from "./_components/pnl-area-chart";
import { PortfolioDonutChart } from "./_components/portfolio-donut-chart";
import { TradeOutcomesCard } from "./_components/trade-outcomes-card";
import { BestTradesCard } from "./_components/best-trades-card";

export const metadata: Metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage(): Promise<React.ReactElement> {
  const t = await getTranslations("analytics");

  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <h1 className="text-lg font-semibold">{t("title")}</h1>

      {/* PnL chart — full width */}
      <PnlAreaChart />

      {/* Middle row: donut + outcomes side by side on desktop */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PortfolioDonutChart />
        <TradeOutcomesCard />
      </div>

      {/* Best & worst trades */}
      <BestTradesCard />
    </div>
  );
}
