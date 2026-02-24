import { describe, it, expect } from "vitest";
import { parseCsv } from "../csv-parser";
import { parseCsvRows } from "../csv-import-schema";

describe("parseCsv", () => {
  it("parses simple CSV", () => {
    const text = "a,b,c\n1,2,3\n4,5,6";
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
  });

  it("handles CRLF line endings", () => {
    const text = "a,b\r\n1,2\r\n3,4";
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("handles BOM", () => {
    const text = "\uFEFFa,b\n1,2";
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quoted fields", () => {
    const text = '"hello world",b\n"with ""quotes""",2';
    expect(parseCsv(text)).toEqual([
      ["hello world", "b"],
      ['with "quotes"', "2"],
    ]);
  });

  it("handles quoted fields with commas", () => {
    const text = '"a,b",c\n"1,2",3';
    expect(parseCsv(text)).toEqual([
      ["a,b", "c"],
      ["1,2", "3"],
    ]);
  });

  it("handles quoted fields with newlines", () => {
    const text = '"line1\nline2",b\n1,2';
    expect(parseCsv(text)).toEqual([
      ["line1\nline2", "b"],
      ["1", "2"],
    ]);
  });

  it("skips empty rows", () => {
    const text = "a,b\n\n1,2\n\n";
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles trailing newline", () => {
    const text = "a,b\n1,2\n";
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvRows", () => {
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

  it("parses valid Stars row", () => {
    const rows = [
      headers,
      ["PlushPepe", "123", "1", "2024-01-15", "", "STARS", "1000", "", "", ""],
    ];
    const result = parseCsvRows(rows);
    expect(result.headerError).toBeNull();
    expect(result.validCount).toBe(1);
    expect(result.errorCount).toBe(0);
    expect(result.rows[0]!.data).toMatchObject({
      giftName: "PlushPepe",
      giftNumber: "123",
      quantity: 1,
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: null,
    });
  });

  it("parses valid TON row with sell", () => {
    const rows = [
      headers,
      ["PlushPepe", "456", "2", "2024-01-15", "2024-02-01", "TON", "3.5", "5.0", "fragment", "getgems"],
    ];
    const result = parseCsvRows(rows);
    expect(result.validCount).toBe(1);
    expect(result.rows[0]!.data).toMatchObject({
      tradeCurrency: "TON",
      buyPrice: 3_500_000_000n,
      sellPrice: 5_000_000_000n,
      buyMarketplace: "fragment",
      sellMarketplace: "getgems",
    });
  });

  it("reports missing required fields", () => {
    const rows = [
      headers,
      ["", "", "1", "", "", "", "", "", "", ""],
    ];
    const result = parseCsvRows(rows);
    expect(result.errorCount).toBe(1);
    const errors = result.rows[0]!.errors;
    expect(errors).toContain("Gift Name is required");
    expect(errors).toContain("Buy Date is required");
    expect(errors).toContain("Buy Price is required");
  });

  it("reports invalid currency", () => {
    const rows = [
      headers,
      ["Gift", "1", "1", "2024-01-01", "", "USD", "100", "", "", ""],
    ];
    const result = parseCsvRows(rows);
    expect(result.rows[0]!.errors).toContain("Currency must be STARS or TON");
  });

  it("reports sell date before buy date", () => {
    const rows = [
      headers,
      ["Gift", "1", "1", "2024-06-01", "2024-01-01", "STARS", "100", "200", "", ""],
    ];
    const result = parseCsvRows(rows);
    expect(result.rows[0]!.errors).toContain("Sell Date cannot be before Buy Date");
  });

  it("reports sell price without sell date", () => {
    const rows = [
      headers,
      ["Gift", "1", "1", "2024-01-01", "", "STARS", "100", "200", "", ""],
    ];
    const result = parseCsvRows(rows);
    expect(result.rows[0]!.errors).toContain("Sell Date required when Sell Price is set");
  });

  it("rejects missing headers", () => {
    const rows = [["Name", "Price"], ["Gift", "100"]];
    const result = parseCsvRows(rows);
    expect(result.headerError).toBeTruthy();
    expect(result.headerError).toContain("Missing columns");
  });

  it("rejects empty file", () => {
    const result = parseCsvRows([]);
    expect(result.headerError).toBe("CSV file is empty");
  });

  it("handles quantity default to 1", () => {
    const rows = [
      headers,
      ["Gift", "1", "", "2024-01-01", "", "STARS", "100", "", "", ""],
    ];
    const result = parseCsvRows(rows);
    expect(result.rows[0]!.data?.quantity).toBe(1);
  });

  it("rejects invalid quantity", () => {
    const rows = [
      headers,
      ["Gift", "1", "99999", "2024-01-01", "", "STARS", "100", "", "", ""],
    ];
    const result = parseCsvRows(rows);
    expect(result.rows[0]!.errors).toContain("Quantity must be 1-9999");
  });

  it("rejects float quantity", () => {
    const rows = [
      headers,
      ["Gift", "1", "1.5", "2024-01-01", "", "STARS", "100", "", "", ""],
    ];
    const result = parseCsvRows(rows);
    expect(result.rows[0]!.errors).toContain("Quantity must be a whole number");
  });

  it("rejects more than 500 data rows", () => {
    const dataRows = Array.from({ length: 501 }, () =>
      ["Gift", "1", "1", "2024-01-01", "", "STARS", "100", "", "", ""],
    );
    const result = parseCsvRows([headers, ...dataRows]);
    expect(result.headerError).toMatch(/Too many rows/);
  });
});
