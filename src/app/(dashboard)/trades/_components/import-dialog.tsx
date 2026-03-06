"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
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

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "preview" | "result";

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: Array<{ row: number; message: string }>;
}

export function ImportDialog({ open, onOpenChange }: ImportDialogProps): React.ReactElement {
  const [step, setStep] = useState<Step>("upload");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [skipErrors, setSkipErrors] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const ti = useTranslations("import");
  const tc = useTranslations("common");

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

  const processRows = useCallback((rawRows: string[][]) => {
    const parsed = parseCsvRows(rawRows);
    if (parsed.headerError) {
      setHeaderError(parsed.headerError);
      setParsedRows([]);
    } else {
      setHeaderError(null);
      setParsedRows(parsed.rows);
    }
    setStep("preview");
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setHeaderError(ti("fileTooLarge", { size: (file.size / 1024).toFixed(0), max: String(MAX_FILE_SIZE / 1024) }));
        setStep("preview");
        return;
      }

      const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

      if (isExcel) {
        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const data = evt.target?.result;
            if (!data) return;
            const XLSX = await import("xlsx");
            const workbook = XLSX.read(data, { type: "array" });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) {
              setHeaderError(ti("emptyWorkbook"));
              setStep("preview");
              return;
            }
            const sheet = workbook.Sheets[firstSheetName];
            if (!sheet) {
              setHeaderError(ti("emptyWorkbook"));
              setStep("preview");
              return;
            }
            // raw: false + defval: "" ensures all cells are strings
            const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, {
              header: 1,
              raw: false,
              defval: "",
            });
            processRows(rawRows);
          } catch {
            setHeaderError(ti("failedParse"));
            setStep("preview");
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const text = evt.target?.result;
          if (typeof text !== "string") return;
          processRows(parseCsv(text));
        };
        reader.readAsText(file, "UTF-8");
      }

      // Reset file input so same file can be re-selected
      e.target.value = "";
    },
    [processRows, ti],
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
      toast.error(ti("noValidRows"));
      return;
    }

    importMutation.mutate({ rows: validRows, skipErrors });
  }, [parsedRows, skipErrors, importMutation, ti]);

  const validCount = parsedRows.filter((r) => r.errors.length === 0).length;
  const errorCount = parsedRows.filter((r) => r.errors.length > 0).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{ti("title")}</DialogTitle>
          <DialogDescription>
            {ti("description")}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Upload className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {ti("maxRows", { rows: MAX_IMPORT_ROWS, size: MAX_FILE_SIZE / 1024 })}
            </p>
            <label className="cursor-pointer">
              <Button variant="outline" asChild>
                <span>{ti("chooseFile")}</span>
              </Button>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                aria-label={ti("uploadLabel")}
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
                    {ti("validCount", { count: validCount })}
                  </span>
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      {ti("errorCount", { count: errorCount })}
                    </span>
                  )}
                </div>

                {/* Preview table */}
                <div className="max-h-[300px] overflow-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">{ti("colNumber")}</th>
                        <th className="px-2 py-1.5 text-left font-medium">{ti("colGift")}</th>
                        <th className="px-2 py-1.5 text-left font-medium">{ti("colQty")}</th>
                        <th className="px-2 py-1.5 text-left font-medium">{ti("colCurrency")}</th>
                        <th className="px-2 py-1.5 text-left font-medium">{ti("colBuy")}</th>
                        <th className="px-2 py-1.5 text-left font-medium">{ti("colSell")}</th>
                        <th className="px-2 py-1.5 text-left font-medium">{ti("colStatus")}</th>
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
                              <span className="text-profit">{ti("ok")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedRows.length > 50 && (
                    <div className="border-t px-2 py-1.5 text-center text-xs text-muted-foreground">
                      {ti("showingFirst", { count: parsedRows.length })}
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
                    {ti("skipErrors", { skipCount: errorCount, validCount })}
                  </label>
                )}
              </>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={reset}>
                {tc("back")}
              </Button>
              {!headerError && validCount > 0 && (
                <Button
                  onClick={handleImport}
                  disabled={importMutation.isPending}
                >
                  {importMutation.isPending
                    ? tc("importing")
                    : ti("importCount", { count: validCount })}
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
                  {ti("importedCount", { count: result.inserted })}
                </p>
                {result.skipped > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {ti("skippedCount", { count: result.skipped })}
                  </p>
                )}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="max-h-[150px] overflow-auto rounded-md border p-2 text-xs">
                {result.errors.map((err) => (
                  <div key={err.row} className="text-destructive">
                    {ti("rowError", { num: err.row, message: err.message })}
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => handleClose(false)}>{tc("done")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
