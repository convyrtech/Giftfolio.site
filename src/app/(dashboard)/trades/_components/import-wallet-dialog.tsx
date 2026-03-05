"use client";

import { useState, useCallback } from "react";
import { Wallet, AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc/client";
import { formatTon, NanoTon } from "@/lib/currencies";
import { toast } from "sonner";

interface ImportWalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saved wallet address from user settings (pre-fills the input) */
  savedWalletAddress?: string | null;
}

type Step = "scan" | "preview" | "result";

interface PreviewTrade {
  giftName: string;
  giftNumber: number;
  side: "buy" | "sell";
  priceNanoton: string;
  timestamp: number;
  eventId: string;
}

interface SellMatch {
  eventId: string;
  giftName: string;
  giftNumber: number;
  priceNanoton: string;
  timestamp: number;
  matchedTradeId: string | null;
  matchedBuyDate: string | null;
}

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
  closed: number;
}

export function ImportWalletDialog({
  open,
  onOpenChange,
  savedWalletAddress,
}: ImportWalletDialogProps): React.ReactElement {
  const [step, setStep] = useState<Step>("scan");
  const [walletInput, setWalletInput] = useState(savedWalletAddress ?? "");
  const [allTrades, setAllTrades] = useState<PreviewTrade[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sellMatches, setSellMatches] = useState<SellMatch[]>([]);
  const [selectedSellIds, setSelectedSellIds] = useState<Set<string>>(new Set());
  const [eventsFetched, setEventsFetched] = useState(0);
  const [wasRateLimited, setWasRateLimited] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const utils = trpc.useUtils();

  const previewMutation = trpc.trades.walletImportPreview.useMutation({
    onSuccess: (data) => {
      setAllTrades(data.trades);
      setEventsFetched(data.eventsFetched);
      setWasRateLimited(data.rateLimited);
      // Pre-select all buy trades
      const buyIds = data.trades
        .filter((t) => t.side === "buy")
        .map((t) => t.eventId);
      setSelectedIds(new Set(buyIds));
      // Handle sell matches
      setSellMatches(data.sellMatches);
      const matchedSellIds = data.sellMatches
        .filter((s) => s.matchedTradeId !== null)
        .map((s) => s.eventId);
      setSelectedSellIds(new Set(matchedSellIds));
      setStep("preview");
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const confirmMutation = trpc.trades.walletImportConfirm.useMutation({
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const sellConfirmMutation = trpc.trades.walletSellConfirm.useMutation({
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const reset = useCallback(() => {
    setStep("scan");
    setAllTrades([]);
    setSelectedIds(new Set());
    setSellMatches([]);
    setSelectedSellIds(new Set());
    setEventsFetched(0);
    setWasRateLimited(false);
    setResult(null);
    // Sync walletInput back to current saved address on close — no useEffect needed
    setWalletInput(savedWalletAddress ?? "");
  }, [savedWalletAddress]);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen);
      if (!isOpen) reset();
    },
    [reset, onOpenChange],
  );

  const handleScan = (): void => {
    const address = walletInput.trim();
    if (!address) {
      toast.error("Enter a TON wallet address");
      return;
    }
    previewMutation.mutate({ walletAddress: address });
  };

  const buyTrades = allTrades.filter((t) => t.side === "buy");

  const matchedSells = sellMatches.filter((s) => s.matchedTradeId !== null);
  const unmatchedSells = sellMatches.filter((s) => s.matchedTradeId === null);

  const toggleAll = (): void => {
    if (selectedIds.size === buyTrades.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(buyTrades.map((t) => t.eventId)));
    }
  };

  const toggleOne = (eventId: string): void => {
    const next = new Set(selectedIds);
    if (next.has(eventId)) {
      next.delete(eventId);
    } else {
      next.add(eventId);
    }
    setSelectedIds(next);
  };

  const toggleOneSell = (eventId: string): void => {
    const next = new Set(selectedSellIds);
    if (next.has(eventId)) {
      next.delete(eventId);
    } else {
      next.add(eventId);
    }
    setSelectedSellIds(next);
  };

  const totalSelected = selectedIds.size + selectedSellIds.size;

  const handleConfirm = async (): Promise<void> => {
    const selectedBuys = buyTrades.filter((t) => selectedIds.has(t.eventId));
    const selectedSells = matchedSells.filter((s) => selectedSellIds.has(s.eventId));

    if (selectedBuys.length === 0 && selectedSells.length === 0) {
      toast.error("Select at least one trade to import");
      return;
    }

    let buyResult = {
      inserted: 0,
      skipped: 0,
      errors: [] as Array<{ row: number; message: string }>,
    };
    let sellResult = { closed: 0, skipped: 0 };

    if (selectedBuys.length > 0) {
      buyResult = await confirmMutation.mutateAsync({
        trades: selectedBuys.map((t) => ({
          giftName: t.giftName,
          giftNumber: t.giftNumber,
          priceNanoton: t.priceNanoton,
          timestamp: t.timestamp,
          eventId: t.eventId,
        })),
      });
    }

    if (selectedSells.length > 0) {
      sellResult = await sellConfirmMutation.mutateAsync({
        sells: selectedSells.map((s) => ({
          tradeId: s.matchedTradeId!,
          priceNanoton: s.priceNanoton,
          timestamp: s.timestamp,
          eventId: s.eventId,
        })),
      });
    }

    setResult({
      inserted: buyResult.inserted,
      skipped: buyResult.skipped,
      errors: buyResult.errors,
      closed: sellResult.closed,
    });
    setStep("result");
    void utils.trades.list.invalidate();
    void utils.stats.invalidate();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        {step === "scan" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Import from TON Wallet
              </DialogTitle>
              <DialogDescription>
                Scan your TON wallet history for Telegram gift purchases and sales. Buy-side
                marketplace transactions are imported as new trades; sell-side transactions close
                matching open positions.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="wallet-input">TON Wallet Address</Label>
                <Input
                  id="wallet-input"
                  value={walletInput}
                  onChange={(e) => setWalletInput(e.target.value)}
                  placeholder="UQA... or EQ..."
                  className="font-mono text-sm"
                  disabled={previewMutation.isPending}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Scans up to 1000 recent events. May take up to ~15 seconds on the first run.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleScan}
                disabled={previewMutation.isPending || !walletInput.trim()}
              >
                {previewMutation.isPending ? (
                  "Scanning wallet..."
                ) : (
                  <>
                    Scan wallet <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "preview" && (
          <>
            <DialogHeader>
              <DialogTitle>Review Detected Trades</DialogTitle>
              <DialogDescription>
                Found {buyTrades.length} gift purchase
                {buyTrades.length !== 1 ? "s" : ""} and {sellMatches.length} sale
                {sellMatches.length !== 1 ? "s" : ""} in {eventsFetched} wallet events.
                {wasRateLimited && " Scan stopped early due to rate limit."}
              </DialogDescription>
            </DialogHeader>

            <div className="py-2">
              <Tabs defaultValue="buys">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="buys">
                    Purchases ({buyTrades.length})
                  </TabsTrigger>
                  <TabsTrigger value="sells">
                    Sales
                    {matchedSells.length > 0 && ` (${matchedSells.length})`}
                    {unmatchedSells.length > 0 && ` · ${unmatchedSells.length} unmatched`}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="buys" className="mt-3">
                  {buyTrades.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                      <AlertCircle className="h-8 w-8" />
                      <p className="text-sm">No gift purchases found in this wallet&apos;s history.</p>
                      <p className="text-xs">Only marketplace buy transactions (with price) are detectable.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {/* Select all */}
                      <div className="flex items-center gap-2 border-b pb-2">
                        <Checkbox
                          id="select-all-wallet"
                          checked={
                            buyTrades.length > 0 && selectedIds.size === buyTrades.length
                              ? true
                              : selectedIds.size > 0
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={toggleAll}
                        />
                        <label
                          htmlFor="select-all-wallet"
                          className="cursor-pointer text-sm font-medium"
                        >
                          Select all ({buyTrades.length})
                        </label>
                      </div>

                      {/* Trade list — keyboard navigable, accessible */}
                      <div
                        className="max-h-60 overflow-y-auto space-y-1 pr-1"
                        tabIndex={0}
                        role="list"
                        aria-label="Detected gift purchases"
                      >
                        {buyTrades.map((trade) => (
                          <div
                            key={trade.eventId}
                            role="listitem"
                            className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/50"
                          >
                            <Checkbox
                              checked={selectedIds.has(trade.eventId)}
                              onCheckedChange={() => toggleOne(trade.eventId)}
                              id={`trade-${trade.eventId}`}
                            />
                            <label
                              htmlFor={`trade-${trade.eventId}`}
                              className="flex flex-1 cursor-pointer items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <span className="text-sm font-medium">
                                  {trade.giftName}{" "}
                                  <span className="text-muted-foreground">#{trade.giftNumber}</span>
                                </span>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(trade.timestamp * 1000).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge
                                  variant="outline"
                                  className="border-ton-accent/50 text-ton-accent text-xs"
                                >
                                  TON
                                </Badge>
                                <span className="tabular-nums text-sm">
                                  {formatTon(BigInt(trade.priceNanoton) as NanoTon)}
                                </span>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="sells" className="mt-3">
                  {matchedSells.length === 0 && unmatchedSells.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                      <p className="text-sm">No sales detected in this wallet scan.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {matchedSells.length > 0 && (
                        <>
                          <p className="text-xs text-muted-foreground pb-1">
                            These sales match open positions and will close them automatically:
                          </p>
                          <div
                            className="max-h-60 overflow-y-auto space-y-1 pr-1"
                            role="list"
                            aria-label="Matched sales"
                          >
                            {matchedSells.map((sell) => (
                              <div
                                key={sell.eventId}
                                role="listitem"
                                className="flex items-center gap-3 rounded-md border px-3 py-2 hover:bg-muted/50"
                              >
                                <Checkbox
                                  checked={selectedSellIds.has(sell.eventId)}
                                  onCheckedChange={() => toggleOneSell(sell.eventId)}
                                  id={`sell-${sell.eventId}`}
                                />
                                <label
                                  htmlFor={`sell-${sell.eventId}`}
                                  className="flex flex-1 cursor-pointer items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <span className="text-sm font-medium">
                                      {sell.giftName}{" "}
                                      <span className="text-muted-foreground">#{sell.giftNumber}</span>
                                    </span>
                                    <div className="text-xs text-muted-foreground">
                                      {new Date(sell.timestamp * 1000).toLocaleDateString()} · closes open position
                                    </div>
                                  </div>
                                  <span className="tabular-nums text-sm shrink-0 text-loss">
                                    {formatTon(BigInt(sell.priceNanoton) as NanoTon)}
                                  </span>
                                </label>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {unmatchedSells.length > 0 && (
                        <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                          {unmatchedSells.length} sale{unmatchedSells.length !== 1 ? "s" : ""} detected
                          but no matching open position found — skipped automatically.
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button
                onClick={() => { void handleConfirm(); }}
                disabled={
                  confirmMutation.isPending ||
                  sellConfirmMutation.isPending ||
                  totalSelected === 0
                }
              >
                {confirmMutation.isPending || sellConfirmMutation.isPending
                  ? "Importing..."
                  : `Import ${totalSelected} action${totalSelected !== 1 ? "s" : ""}`}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "result" && result && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-profit" />
                Import Complete
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="rounded-md border bg-muted/50 p-4 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Imported</span>
                  <span className="font-medium text-profit">{result.inserted}</span>
                </div>
                {result.closed > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Positions closed</span>
                    <span className="font-medium text-profit">{result.closed}</span>
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Skipped (duplicates)</span>
                    <span className="font-medium text-muted-foreground">{result.skipped}</span>
                  </div>
                )}
              </div>

              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Skipped trades:</p>
                  <ul className="max-h-32 overflow-y-auto space-y-1">
                    {result.errors.map((e, i) => (
                      <li key={`${e.row}-${i}`} className="flex gap-2 text-xs text-muted-foreground">
                        <span>#{e.row}</span>
                        <span>{e.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
