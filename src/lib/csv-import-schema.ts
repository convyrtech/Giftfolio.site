import { z } from "zod";
import { parseTonInput } from "./currencies";

/**
 * CSV import schema and row validation.
 * Compatible with the export format from trades-toolbar.tsx generateCsv().
 *
 * Headers: Gift Name, Gift Number, Quantity, Buy Date, Sell Date,
 *          Currency, Buy Price, Sell Price, Buy Marketplace, Sell Marketplace
 */

const MAX_IMPORT_ROWS = 500;
const MAX_FILE_SIZE = 1_000_000; // 1MB

const marketplaces = ["fragment", "getgems", "tonkeeper", "p2p", "other"] as const;
type Marketplace = (typeof marketplaces)[number];

// Exported constants for UI
export { MAX_IMPORT_ROWS, MAX_FILE_SIZE };

/** Expected CSV column headers (case-insensitive match) */
const EXPECTED_HEADERS = [
  "gift name",
  "gift number",
  "quantity",
  "buy date",
  "sell date",
  "currency",
  "buy price",
  "sell price",
  "buy marketplace",
  "sell marketplace",
] as const;

export interface CsvImportRow {
  giftName: string;
  giftNumber: string | null;
  quantity: number;
  buyDate: Date;
  sellDate: Date | null;
  tradeCurrency: "STARS" | "TON";
  buyPrice: bigint;
  sellPrice: bigint | null;
  buyMarketplace: Marketplace | null;
  sellMarketplace: Marketplace | null;
}

export interface ParsedRow {
  rowIndex: number;
  data: CsvImportRow | null;
  errors: string[];
  raw: string[];
}

export interface CsvParseResult {
  rows: ParsedRow[];
  validCount: number;
  errorCount: number;
  headerError: string | null;
}

/** Validate CSV headers match expected format. Returns null if valid, error string if not. */
function validateHeaders(headerRow: string[]): string | null {
  const normalized = headerRow.map((h) => h.trim().toLowerCase());

  // Must have at least the required columns
  const missing = EXPECTED_HEADERS.filter((h) => !normalized.includes(h));
  if (missing.length > 0) {
    return `Missing columns: ${missing.join(", ")}`;
  }
  return null;
}

/** Get column index by header name (case-insensitive) */
function colIndex(headers: string[], name: string): number {
  return headers.findIndex((h) => h.trim().toLowerCase() === name);
}

/** Parse a single CSV row into a validated CsvImportRow */
function parseRow(cells: string[], headers: string[], rowIndex: number): ParsedRow {
  const errors: string[] = [];

  const get = (name: string): string => {
    const idx = colIndex(headers, name);
    return idx >= 0 ? (cells[idx]?.trim() ?? "") : "";
  };

  // Gift Name (required)
  const giftName = get("gift name");
  if (!giftName) {
    errors.push("Gift Name is required");
  }

  // Gift Number (optional)
  const giftNumberRaw = get("gift number");
  const giftNumber = giftNumberRaw || null;
  if (giftNumber && !/^\d+$/.test(giftNumber)) {
    errors.push("Gift Number must be a positive integer");
  }

  // Quantity (default 1)
  const qtyRaw = get("quantity");
  let quantity = 1;
  if (qtyRaw) {
    if (!/^\d+$/.test(qtyRaw)) {
      errors.push("Quantity must be a whole number");
    }
    quantity = parseInt(qtyRaw, 10);
    if (isNaN(quantity) || quantity < 1 || quantity > 9999) {
      errors.push("Quantity must be 1-9999");
    }
  }

  // Currency (required)
  const currencyRaw = get("currency").toUpperCase();
  if (currencyRaw !== "STARS" && currencyRaw !== "TON") {
    errors.push("Currency must be STARS or TON");
  }
  const tradeCurrency = (currencyRaw === "TON" ? "TON" : "STARS") as "STARS" | "TON";

  // Buy Date (required, YYYY-MM-DD)
  const buyDateRaw = get("buy date");
  let buyDate: Date | null = null;
  if (!buyDateRaw) {
    errors.push("Buy Date is required");
  } else {
    buyDate = new Date(`${buyDateRaw}T00:00:00Z`);
    if (isNaN(buyDate.getTime())) {
      errors.push("Buy Date is invalid (use YYYY-MM-DD)");
      buyDate = null;
    }
  }

  // Sell Date (optional)
  const sellDateRaw = get("sell date");
  let sellDate: Date | null = null;
  if (sellDateRaw) {
    sellDate = new Date(`${sellDateRaw}T00:00:00Z`);
    if (isNaN(sellDate.getTime())) {
      errors.push("Sell Date is invalid (use YYYY-MM-DD)");
      sellDate = null;
    }
  }

  // Buy Price (required)
  const buyPriceRaw = get("buy price");
  let buyPrice = 0n;
  if (!buyPriceRaw) {
    errors.push("Buy Price is required");
  } else {
    try {
      buyPrice = tradeCurrency === "TON"
        ? (parseTonInput(buyPriceRaw) as bigint)
        : BigInt(buyPriceRaw);
      if (buyPrice < 0n) errors.push("Buy Price must be non-negative");
    } catch {
      errors.push("Buy Price is invalid");
    }
  }

  // Sell Price (optional)
  const sellPriceRaw = get("sell price");
  let sellPrice: bigint | null = null;
  if (sellPriceRaw) {
    try {
      sellPrice = tradeCurrency === "TON"
        ? (parseTonInput(sellPriceRaw) as bigint)
        : BigInt(sellPriceRaw);
      if (sellPrice < 0n) errors.push("Sell Price must be non-negative");
    } catch {
      errors.push("Sell Price is invalid");
    }
  }

  // Cross-validation: sell date + sell price
  if (sellDate && sellPrice === null) {
    errors.push("Sell Price required when Sell Date is set");
  }
  if (sellPrice !== null && !sellDate) {
    errors.push("Sell Date required when Sell Price is set");
  }
  if (sellDate && buyDate && sellDate < buyDate) {
    errors.push("Sell Date cannot be before Buy Date");
  }

  // Marketplace (optional)
  const buyMpRaw = get("buy marketplace").toLowerCase();
  const sellMpRaw = get("sell marketplace").toLowerCase();
  const buyMarketplace = marketplaces.includes(buyMpRaw as Marketplace) ? (buyMpRaw as Marketplace) : null;
  const sellMarketplace = marketplaces.includes(sellMpRaw as Marketplace) ? (sellMpRaw as Marketplace) : null;

  if (buyMpRaw && !buyMarketplace) {
    errors.push(`Invalid Buy Marketplace: ${buyMpRaw}`);
  }
  if (sellMpRaw && !sellMarketplace) {
    errors.push(`Invalid Sell Marketplace: ${sellMpRaw}`);
  }

  if (errors.length > 0) {
    return { rowIndex, data: null, errors, raw: cells };
  }

  return {
    rowIndex,
    data: {
      giftName,
      giftNumber,
      quantity,
      buyDate: buyDate!,
      sellDate,
      tradeCurrency,
      buyPrice,
      sellPrice,
      buyMarketplace,
      sellMarketplace,
    },
    errors: [],
    raw: cells,
  };
}

/** Parse and validate all CSV rows. First row is treated as headers. */
export function parseCsvRows(rows: string[][]): CsvParseResult {
  if (rows.length === 0) {
    return { rows: [], validCount: 0, errorCount: 0, headerError: "CSV file is empty" };
  }

  const headerRow = rows[0]!;
  const headerError = validateHeaders(headerRow);
  if (headerError) {
    return { rows: [], validCount: 0, errorCount: 0, headerError };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      validCount: 0,
      errorCount: 0,
      headerError: `Too many rows (${dataRows.length}). Maximum is ${MAX_IMPORT_ROWS}.`,
    };
  }

  const parsed = dataRows.map((cells, i) => parseRow(cells, headerRow, i + 2)); // +2: 1-indexed + header
  const validCount = parsed.filter((r) => r.errors.length === 0).length;
  const errorCount = parsed.filter((r) => r.errors.length > 0).length;

  return { rows: parsed, validCount, errorCount, headerError: null };
}

/** Zod schema for server-side re-validation of import row */
export const importRowSchema = z.object({
  giftName: z.string().min(1).max(200),
  giftNumber: z.string().regex(/^\d+$/).nullable(),
  quantity: z.number().int().min(1).max(9999),
  buyDate: z.coerce.date(),
  sellDate: z.coerce.date().nullable(),
  tradeCurrency: z.enum(["STARS", "TON"]),
  buyPrice: z.coerce.bigint().min(0n),
  sellPrice: z.coerce.bigint().min(0n).nullable(),
  buyMarketplace: z.enum(["fragment", "getgems", "tonkeeper", "p2p", "other"]).nullable(),
  sellMarketplace: z.enum(["fragment", "getgems", "tonkeeper", "p2p", "other"]).nullable(),
}).refine(
  (d) => !d.sellDate || d.sellPrice !== null,
  { message: "sellPrice required when sellDate is set", path: ["sellPrice"] },
).refine(
  (d) => d.sellPrice === null || d.sellDate,
  { message: "sellDate required when sellPrice is set", path: ["sellDate"] },
).refine(
  (d) => !d.sellDate || !d.buyDate || d.sellDate >= d.buyDate,
  { message: "Sell date cannot be before buy date", path: ["sellDate"] },
);

export type ImportRow = z.infer<typeof importRowSchema>;
