import type { Metadata } from "next";
import { PnlAreaChart } from "./_components/pnl-area-chart";
import { PortfolioDonutChart } from "./_components/portfolio-donut-chart";
import { TradeOutcomesCard } from "./_components/trade-outcomes-card";

export const metadata: Metadata = {
  title: "Analytics",
};

export default function AnalyticsPage(): React.ReactElement {
  return (
    <div className="space-y-6 pb-20 md:pb-0">
      <h1 className="text-lg font-semibold">Analytics</h1>

      {/* PnL chart — full width */}
      <PnlAreaChart />

      {/* Bottom row: donut + outcomes side by side on desktop */}
      <div className="grid gap-6 lg:grid-cols-2">
        <PortfolioDonutChart />
        <TradeOutcomesCard />
      </div>
    </div>
  );
}
