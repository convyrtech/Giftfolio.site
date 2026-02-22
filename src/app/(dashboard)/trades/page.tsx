"use client";

import { useState, useMemo } from "react";
import type { RowSelectionState } from "@tanstack/react-table";
import { SummaryCards } from "./_components/summary-cards";
import { TradesToolbar } from "./_components/trades-toolbar";
import { TradesTable } from "./_components/trades-table";
import { BulkActionsBar } from "./_components/bulk-actions-bar";

type CurrencyFilter = "all" | "STARS" | "TON";
type SortColumn = "buy_date" | "sell_date" | "buy_price" | "sell_price" | "created_at";
type SortDir = "asc" | "desc";

export default function TradesPage(): React.ReactElement {
  const [currency, setCurrency] = useState<CurrencyFilter>("all");
  const [sort, setSort] = useState<SortColumn>("buy_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showHidden, setShowHidden] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIds = useMemo(
    () =>
      Object.keys(rowSelection)
        .filter((key) => rowSelection[key])
        .map((id) => BigInt(id)),
    [rowSelection],
  );

  return (
    <div className="space-y-4 pb-20">
      <SummaryCards />

      <TradesToolbar
        currency={currency}
        onCurrencyChange={setCurrency}
        sort={sort}
        onSortChange={setSort}
        sortDir={sortDir}
        onSortDirChange={setSortDir}
        showHidden={showHidden}
        onShowHiddenChange={setShowHidden}
      />

      <TradesTable
        currency={currency === "all" ? undefined : currency}
        sort={sort}
        sortDir={sortDir}
        showHidden={showHidden}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />

      <BulkActionsBar
        selectedIds={selectedIds}
        onClearSelection={() => setRowSelection({})}
      />
    </div>
  );
}
