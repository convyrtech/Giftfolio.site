"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Upload, Plus, Eye, EyeOff, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc/client";
import { nanoTonToTonString, type NanoTon } from "@/lib/currencies";
import type { Trade } from "@/server/db/schema";
import { TradeFormDialog } from "./trade-form-dialog";
import { ImportDialog } from "./import-dialog";
import { ImportWalletDialog } from "./import-wallet-dialog";

const currencyFilters = ["all", "STARS", "TON"] as const;
type CurrencyFilter = (typeof currencyFilters)[number];

const sortColumns = ["buy_date", "sell_date", "buy_price", "sell_price", "created_at"] as const;
type SortColumn = (typeof sortColumns)[number];

const sortDirs = ["asc", "desc"] as const;
type SortDir = (typeof sortDirs)[number];

interface TradesToolbarProps {
  currency: CurrencyFilter;
  onCurrencyChange: (value: CurrencyFilter) => void;
  sort: SortColumn;
  onSortChange: (value: SortColumn) => void;
  sortDir: SortDir;
  onSortDirChange: (value: SortDir) => void;
  showHidden: boolean;
  onShowHiddenChange: (value: boolean) => void;
}

export function TradesToolbar({
  currency,
  onCurrencyChange,
  sort,
  onSortChange,
  sortDir,
  onSortDirChange,
  showHidden,
  onShowHiddenChange,
}: TradesToolbarProps): React.ReactElement {
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showWalletImport, setShowWalletImport] = useState(false);
  const t = useTranslations("trades");
  const tc = useTranslations("common");

  const { data: settings } = trpc.settings.get.useQuery();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setShowForm(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {t("addTrade")}
        </Button>

        <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
          <Upload className="mr-1 h-4 w-4" />
          {tc("import")}
        </Button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => setShowWalletImport(true)}>
              <Wallet className="mr-1 h-4 w-4" />
              {t("wallet")}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t("walletTooltip")}</TooltipContent>
        </Tooltip>

        <div className="h-5 w-px bg-border" />

        <Select value={currency} onValueChange={(v) => { if ((currencyFilters as readonly string[]).includes(v)) onCurrencyChange(v as CurrencyFilter); }}>
          <SelectTrigger className="w-28" aria-label={t("filterCurrency")}>
            <SelectValue placeholder={t("currency")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("currencyAll")}</SelectItem>
            <SelectItem value="TON">TON</SelectItem>
            <SelectItem value="STARS">Stars</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => { if ((sortColumns as readonly string[]).includes(v)) onSortChange(v as SortColumn); }}>
          <SelectTrigger className="w-32" aria-label={t("sortBy")}>
            <SelectValue placeholder={t("sortBy")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="buy_date">{t("sortBuyDate")}</SelectItem>
            <SelectItem value="sell_date">{t("sortSellDate")}</SelectItem>
            <SelectItem value="buy_price">{t("sortBuyPrice")}</SelectItem>
            <SelectItem value="sell_price">{t("sortSellPrice")}</SelectItem>
            <SelectItem value="created_at">{t("sortCreated")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortDir} onValueChange={(v) => { if ((sortDirs as readonly string[]).includes(v)) onSortDirChange(v as SortDir); }}>
          <SelectTrigger className="w-28" aria-label={t("sortDirection")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">{t("sortNewest")}</SelectItem>
            <SelectItem value="asc">{t("sortOldest")}</SelectItem>
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showHidden ? "secondary" : "outline"}
              size="sm"
              onClick={() => onShowHiddenChange(!showHidden)}
              aria-label={showHidden ? t("hideHidden") : t("showHidden")}
              aria-pressed={showHidden ? "true" : "false"}
            >
              {showHidden ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {showHidden ? t("showingHidden") : t("hiddenNotShown")}
          </TooltipContent>
        </Tooltip>

        <div className="ml-auto flex gap-1">
          <ExportCsvButton currency={currency === "all" ? undefined : currency} />
          <ExportExcelButton currency={currency === "all" ? undefined : currency} />
        </div>
      </div>

      <TradeFormDialog open={showForm} onOpenChange={setShowForm} />
      <ImportDialog open={showImport} onOpenChange={setShowImport} />
      <ImportWalletDialog
        key={String(showWalletImport)}
        open={showWalletImport}
        onOpenChange={setShowWalletImport}
        savedWalletAddress={settings?.tonWalletAddress}
      />
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

function ExportExcelButton({ currency }: { currency?: "STARS" | "TON" }): React.ReactElement {
  const { refetch, isFetching } = trpc.trades.exportCsv.useQuery(
    { currency },
    { enabled: false },
  );

  const handleExport = async (): Promise<void> => {
    const result = await refetch();
    const trades = result.data;
    if (!trades || trades.length === 0) return;

    const rows = trades.map((t) => ({
      "Gift Name": t.giftName,
      "Gift Number": t.giftNumber !== null ? Number(t.giftNumber) : "",
      "Quantity": t.quantity,
      "Buy Date": t.buyDate instanceof Date ? t.buyDate.toISOString().slice(0, 10) : String(t.buyDate),
      "Sell Date": t.sellDate
        ? t.sellDate instanceof Date
          ? t.sellDate.toISOString().slice(0, 10)
          : String(t.sellDate)
        : "",
      "Currency": t.tradeCurrency,
      // TON as float64 for Excel usability — precision loss above ~9e15 nanotons (unlikely)
      "Buy Price": t.tradeCurrency === "TON"
        ? parseFloat(nanoTonToTonString(t.buyPrice as NanoTon))
        : Number(t.buyPrice),
      "Sell Price": t.sellPrice !== null
        ? t.tradeCurrency === "TON"
          ? parseFloat(nanoTonToTonString(t.sellPrice as NanoTon))
          : Number(t.sellPrice)
        : "",
      "Commission Flat (Stars)": t.commissionFlatStars !== null ? Number(t.commissionFlatStars) : "",
      "Commission Permille": t.commissionPermille ?? "",
      "Buy Marketplace": t.buyMarketplace ?? "",
      "Sell Marketplace": t.sellMarketplace ?? "",
      "Notes": t.notes ?? "",
    }));

    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trades");
    XLSX.writeFile(wb, `trades_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={isFetching}>
      <Download className="mr-1 h-4 w-4" />
      Excel
    </Button>
  );
}

function generateCsv(trades: Trade[]): string {
  const headers = [
    "Gift Name",
    "Gift Number",
    "Quantity",
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
    t.giftNumber !== null ? String(t.giftNumber) : "",
    String(t.quantity),
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
