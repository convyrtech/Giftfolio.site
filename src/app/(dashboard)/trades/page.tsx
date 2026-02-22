"use client";

import { useState } from "react";
import { SummaryCards } from "./_components/summary-cards";
import { TradesToolbar } from "./_components/trades-toolbar";
import { TradesTable } from "./_components/trades-table";

type CurrencyFilter = "all" | "STARS" | "TON";
type SortColumn = "buy_date" | "sell_date" | "buy_price" | "sell_price" | "created_at";
type SortDir = "asc" | "desc";

export default function TradesPage(): React.ReactElement {
  const [currency, setCurrency] = useState<CurrencyFilter>("all");
  const [sort, setSort] = useState<SortColumn>("buy_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  return (
    <div className="space-y-4 pb-20 md:pb-4">
      <SummaryCards />

      <TradesToolbar
        currency={currency}
        onCurrencyChange={setCurrency}
        sort={sort}
        onSortChange={setSort}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
      />

      <TradesTable
        currency={currency === "all" ? undefined : currency}
        sort={sort}
        sortDir={sortDir}
      />
    </div>
  );
}
