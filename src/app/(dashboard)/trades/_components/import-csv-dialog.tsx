"use client";

import { useState, useCallback } from "react";
import { Upload, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc/client";
import { parseCsv } from "@/lib/csv-parser";
import { parseCsvRows, MAX_FILE_SIZE, MAX_IMPORT_ROWS, type ParsedRow } from "@/lib/csv-import-schema";
import { toast } from "sonner";

interface ImportCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "preview" | "result";

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export function ImportCsvDialog({ open, onOpenChange }: ImportCsvDialogProps): React.ReactElement {
  const [step, setStep] = useState<Step>("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [skipErrors, setSkipErrors] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const utils = trpc.useUtils();
  const importMutation = trpc.trades.bulkImport.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setStep("result");
      void utils.trades.list.invalidate();
      void utils.stats.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const reset = useCallback(() => {
    setStep("upload");
    setParsedRows([]);
    setHeaderError(null);
    setSkipErrors(false);
    setResult(null);
  }, []);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) reset();
      onOpenChange(isOpen);
    },
    [onOpenChange, reset],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setHeaderError(`File too large (${(file.size / 1024).toFixed(0)} KB). Maximum is ${MAX_FILE_SIZE / 1024} KB.`);
        setStep("preview");
        return;
      }

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result;
        if (typeof text !== "string") return;

        const rawRows = parseCsv(text);
        const parsed = parseCsvRows(rawRows);

        if (parsed.headerError) {
          setHeaderError(parsed.headerError);
          setParsedRows([]);
        } else {
          setHeaderError(null);
          setParsedRows(parsed.rows);
        }
        setStep("preview");
      };
      reader.readAsText(file, "UTF-8");

      // Reset file input so same file can be re-selected
      e.target.value = "";
    },
    [],
  );

  const handleImport = useCallback(() => {
    const validRows = parsedRows
      .filter((r) => r.data !== null)
      .map((r) => ({
        giftName: r.data!.giftName,
        giftNumber: r.data!.giftNumber,
        quantity: r.data!.quantity,
        buyDate: r.data!.buyDate.toISOString(),
        sellDate: r.data!.sellDate?.toISOString() ?? null,
        tradeCurrency: r.data!.tradeCurrency,
        buyPrice: r.data!.buyPrice.toString(),
        sellPrice: r.data!.sellPrice?.toString() ?? null,
        buyMarketplace: r.data!.buyMarketplace,
        sellMarketplace: r.data!.sellMarketplace,
      }));

    if (validRows.length === 0) {
      toast.error("No valid rows to import");
      return;
    }

    importMutation.mutate({ rows: validRows, skipErrors });
  }, [parsedRows, skipErrors, importMutation]);

  const validCount = parsedRows.filter((r) => r.errors.length === 0).length;
  const errorCount = parsedRows.filter((r) => r.errors.length > 0).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Trades from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file matching the export format.
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Max {MAX_IMPORT_ROWS} rows, {MAX_FILE_SIZE / 1024} KB
            </p>
            <label className="cursor-pointer">
              <Button variant="outline" asChild>
                <span>Choose CSV file</span>
              </Button>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-label="Upload CSV file"
                onChange={handleFileSelect}
              />
            </label>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {headerError ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <div className="text-sm text-destructive">{headerError}</div>
              </div>
            ) : (
              <>
                {/* Summary */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-profit" />
                    {validCount} valid
                  </span>
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      {errorCount} errors
                    </span>
                  )}
                </div>

                {/* Preview table */}
                <div className="max-h-[300px] overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">#</th>
                        <th className="px-2 py-1.5 text-left font-medium">Gift</th>
                        <th className="px-2 py-1.5 text-left font-medium">Qty</th>
                        <th className="px-2 py-1.5 text-left font-medium">Currency</th>
                        <th className="px-2 py-1.5 text-left font-medium">Buy</th>
                        <th className="px-2 py-1.5 text-left font-medium">Sell</th>
                        <th className="px-2 py-1.5 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 50).map((row) => (
                        <tr
                          key={row.rowIndex}
                          className={row.errors.length > 0 ? "bg-destructive/10" : ""}
                        >
                          <td className="px-2 py-1 tabular-nums">{row.rowIndex}</td>
                          <td className="max-w-[120px] truncate px-2 py-1">
                            {row.data?.giftName ?? row.raw[0] ?? "—"}
                          </td>
                          <td className="px-2 py-1 tabular-nums">
                            {row.data?.quantity ?? "—"}
                          </td>
                          <td className="px-2 py-1">
                            {row.data?.tradeCurrency ?? "—"}
                          </td>
                          <td className="px-2 py-1 tabular-nums">
                            {row.data ? String(row.data.buyPrice) : "—"}
                          </td>
                          <td className="px-2 py-1 tabular-nums">
                            {row.data?.sellPrice !== null && row.data?.sellPrice !== undefined
                              ? String(row.data.sellPrice)
                              : "—"}
                          </td>
                          <td className="px-2 py-1">
                            {row.errors.length > 0 ? (
                              <span className="text-destructive" title={row.errors.join("; ")}>
                                {row.errors[0]}
                              </span>
                            ) : (
                              <span className="text-profit">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedRows.length > 50 && (
                    <div className="border-t px-2 py-1.5 text-center text-xs text-muted-foreground">
                      Showing first 50 of {parsedRows.length} rows
                    </div>
                  )}
                </div>

                {/* Skip errors checkbox */}
                {errorCount > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={skipErrors}
                      onCheckedChange={(v) => setSkipErrors(v === true)}
                    />
                    Skip {errorCount} rows with errors, import {validCount} valid rows
                  </label>
                )}
              </>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              {!headerError && validCount > 0 && (
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending
                    ? "Importing..."
                    : `Import ${validCount} trade${validCount !== 1 ? "s" : ""}`}
                </Button>
              )}
            </DialogFooter>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4 py-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="mt-0.5 h-5 w-5 text-profit" />
              <div>
                <p className="font-medium">
                  Imported {result.inserted} trade{result.inserted !== 1 ? "s" : ""}
                </p>
                {result.skipped > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {result.skipped} row{result.skipped !== 1 ? "s" : ""} skipped
                  </p>
                )}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-[150px] overflow-auto rounded-md border p-2 text-xs">
                {result.errors.map((err) => (
                  <div key={err.row} className="text-destructive">
                    Row {err.row}: {err.message}
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
