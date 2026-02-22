import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatNumber, formatUsd, formatPercent } from "../formatters";

describe("formatDate", () => {
  it("formats Date object", () => {
    // Use midday UTC to avoid timezone-shift edge cases
    const result = formatDate(new Date("2026-01-15T12:00:00Z"));
    // Russian format: DD.MM.YY
    expect(result).toMatch(/15\.01\.26/);
  });

  it("formats ISO string", () => {
    const result = formatDate("2026-12-31T12:00:00Z");
    expect(result).toMatch(/31\.12\.26/);
  });
});

describe("formatDateTime", () => {
  it("includes time", () => {
    // Use UTC time — formatDateTime uses UTC timezone
    const result = formatDateTime(new Date("2026-01-15T14:30:00Z"));
    expect(result).toContain("15.01.26");
    expect(result).toMatch(/14[:\.]30/);
  });
});

describe("formatNumber", () => {
  it("formats with space separators", () => {
    const result = formatNumber(1234567);
    // Russian uses non-breaking space, check parts
    expect(result).toMatch(/1.*234.*567/);
  });

  it("formats BigInt", () => {
    const result = formatNumber(1234567n);
    expect(result).toMatch(/1.*234.*567/);
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatUsd", () => {
  it("formats with dollar sign and 2 decimals", () => {
    expect(formatUsd(12.34)).toBe("$12.34");
  });

  it("pads to 2 decimals", () => {
    expect(formatUsd(5)).toBe("$5.00");
  });

  it("formats large number", () => {
    const result = formatUsd(1234.56);
    expect(result).toContain("$");
    expect(result).toContain("1,234.56");
  });

  it("handles negative", () => {
    const result = formatUsd(-5.5);
    expect(result).toContain("-");
    expect(result).toContain("5.50");
  });
});

describe("formatPercent", () => {
  it("formats positive with + sign", () => {
    expect(formatPercent(12.5)).toBe("+12.5%");
  });

  it("formats negative", () => {
    expect(formatPercent(-3.2)).toBe("-3.2%");
  });

  it("formats zero as positive", () => {
    expect(formatPercent(0)).toBe("+0.0%");
  });
});
