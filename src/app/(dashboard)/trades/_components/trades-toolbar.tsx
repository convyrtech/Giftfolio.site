"use client";

import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { nanoTonToTonString, type NanoTon } from "@/lib/currencies";
import type { Trade } from "@/server/db/schema";
import { TradeFormDialog } from "./trade-form-dialog";

type CurrencyFilter = "all" | "STARS" | "TON";
type SortColumn = "buy_date" | "sell_date" | "buy_price" | "sell_price" | "created_at";
type SortDir = "asc" | "desc";

interface TradesToolbarProps {
  currency: CurrencyFilter;
  onCurrencyChange: (value: CurrencyFilter) => void;
  sort: SortColumn;
  onSortChange: (value: SortColumn) => void;
  sortDir: SortDir;
  onSortDirChange: (value: SortDir) => void;
}

export function TradesToolbar({
  currency,
  onCurrencyChange,
  sort,
  onSortChange,
  sortDir,
  onSortDirChange,
}: TradesToolbarProps): React.ReactElement {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Add trade
        </Button>

        <Select value={currency} onValueChange={(v) => onCurrencyChange(v as CurrencyFilter)}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="Currency" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="STARS">Stars</SelectItem>
            <SelectItem value="TON">TON</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => onSortChange(v as SortColumn)}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buy_date">Buy Date</SelectItem>
            <SelectItem value="sell_date">Sell Date</SelectItem>
            <SelectItem value="buy_price">Buy Price</SelectItem>
            <SelectItem value="sell_price">Sell Price</SelectItem>
            <SelectItem value="created_at">Created</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortDir} onValueChange={(v) => onSortDirChange(v as SortDir)}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Newest</SelectItem>
            <SelectItem value="asc">Oldest</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <ExportCsvButton currency={currency === "all" ? undefined : currency} />
        </div>
      </div>

      <TradeFormDialog open={showForm} onOpenChange={setShowForm} />
    </>
  );
}

function ExportCsvButton({ currency }: { currency?: "STARS" | "TON" }): React.ReactElement {
  const { refetch, isFetching } = trpc.trades.exportCsv.useQuery(
    { currency },
    { enabled: false },
  );

  const handleExport = async (): Promise<void> => {
    const result = await refetch();
    const trades = result.data;
    if (!trades || trades.length === 0) return;

    const csv = generateCsv(trades);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trades_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={isFetching}>
      <Download className="mr-1 h-4 w-4" />
      CSV
    </Button>
  );
}

function generateCsv(trades: Trade[]): string {
  const headers = [
    "Gift Name",
    "Gift Number",
    "Buy Date",
    "Sell Date",
    "Currency",
    "Buy Price",
    "Sell Price",
    "Buy Marketplace",
    "Sell Marketplace",
  ];

  const rows = trades.map((t) => [
    t.giftName,
    String(t.giftNumber),
    t.buyDate instanceof Date ? t.buyDate.toISOString().slice(0, 10) : String(t.buyDate),
    t.sellDate
      ? t.sellDate instanceof Date
        ? t.sellDate.toISOString().slice(0, 10)
        : String(t.sellDate)
      : "",
    t.tradeCurrency,
    t.tradeCurrency === "TON"
      ? nanoTonToTonString(t.buyPrice as NanoTon)
      : String(t.buyPrice),
    t.sellPrice !== null
      ? t.tradeCurrency === "TON"
        ? nanoTonToTonString(t.sellPrice as NanoTon)
        : String(t.sellPrice)
      : "",
    t.buyMarketplace ?? "",
    t.sellMarketplace ?? "",
  ]);

  return [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
}
