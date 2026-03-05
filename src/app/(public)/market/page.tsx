import type { Metadata } from "next";
import { getGiftBubblesData } from "@/lib/gift-bubbles";
import { MarketTable } from "./_components/market-table";
import { StaleBanner } from "./_components/stale-banner";

export const revalidate = 300; // ISR: revalidate every 5 minutes

export const metadata: Metadata = {
  title: "Market — Telegram Gift Floor Prices | Giftfolio",
  description:
    "Live floor prices, % changes and listings for all Telegram gift collections. Track and compare market data in one place.",
  robots: { index: true, follow: true },
};

export default async function MarketPage(): Promise<React.ReactElement> {
  const data = await getGiftBubblesData();

  // Format as "HH:MM UTC" — absolute time, safe with ISR cached HTML
  const fetchedAtLabel =
    new Date(data.fetchedAt).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }) + " UTC";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Market</h1>
          <p className="text-sm text-muted-foreground">
            {data.available
              ? `${data.items.length} gift collections`
              : "Market data unavailable"}
          </p>
        </div>
      </div>

      {data.stale && <StaleBanner fetchedAtLabel={fetchedAtLabel} />}

      <MarketTable items={data.items} available={data.available} />
    </div>
  );
}
