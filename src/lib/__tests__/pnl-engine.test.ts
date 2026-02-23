import { describe, expect, it } from "vitest";
import {
  calculateCommission,
  calculateProfit,
  aggregateStats,
  type TradeInput,
} from "../pnl-engine";

// ─── Commission Calculation ───

describe("calculateCommission", () => {
  it("Stars: flat + permille", () => {
    // sell=1000, flat=50, permille=100 (10%)
    // expected: 50 + ROUND(1000 * 100 / 1000) = 50 + 100 = 150
    expect(calculateCommission("STARS", 1000n, 50n, 100)).toBe(150n);
  });

  it("Stars: flat only (permille=0)", () => {
    expect(calculateCommission("STARS", 1000n, 50n, 0)).toBe(50n);
  });

  it("Stars: permille only (flat=0)", () => {
    // sell=1000, permille=50 (5%)
    // ROUND(1000 * 50 / 1000) = 50
    expect(calculateCommission("STARS", 1000n, 0n, 50)).toBe(50n);
  });

  it("Stars: zero commission", () => {
    expect(calculateCommission("STARS", 1000n, 0n, 0)).toBe(0n);
  });

  it("Stars: max permille (1000 = 100%)", () => {
    // ROUND(1000 * 1000 / 1000) = 1000
    expect(calculateCommission("STARS", 1000n, 0n, 1000)).toBe(1000n);
  });

  it("TON: permille only, no flat fee", () => {
    // sell=3_500_000_000 (3.5 TON), permille=100 (10%)
    // ROUND(3_500_000_000 * 100 / 1000) = 350_000_000
    expect(calculateCommission("TON", 3_500_000_000n, 100n, 100)).toBe(350_000_000n);
  });

  it("TON: flat is ignored (different currency)", () => {
    // Even with flat=999, TON only uses permille
    expect(calculateCommission("TON", 1_000_000_000n, 999n, 50)).toBe(50_000_000n);
  });

  it("TON: zero commission", () => {
    expect(calculateCommission("TON", 1_000_000_000n, 0n, 0)).toBe(0n);
  });

  it("rounds permille correctly (banker's rounding)", () => {
    // sell=999, permille=1
    // (999 * 1 + 500) / 1000 = 1499 / 1000 = 1n (integer division)
    expect(calculateCommission("STARS", 999n, 0n, 1)).toBe(1n);
  });

  it("rounds permille for small values", () => {
    // sell=1, permille=1
    // (1 * 1 + 500) / 1000 = 501 / 1000 = 0n (integer division)
    expect(calculateCommission("STARS", 1n, 0n, 1)).toBe(0n);
  });
});

// ─── Profit Calculation ───

describe("calculateProfit", () => {
  it("closed Stars trade: profit", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: 1500n,
      commissionFlatStars: 50n,
      commissionPermille: 100, // 10%
      buyRateUsd: "0.013",
      sellRateUsd: "0.013",
    };

    const result = calculateProfit(trade);
    // gross = 1500 - 1000 = 500
    // commission = 50 + ROUND(1500*100/1000) = 50 + 150 = 200
    // net = 500 - 200 = 300
    expect(result.grossProfit).toBe(500n);
    expect(result.totalCommission).toBe(200n);
    expect(result.netProfit).toBe(300n);
    expect(result.buyValueUsd).toBeCloseTo(13.0, 1); // 1000 * 0.013
    expect(result.sellValueUsd).toBeCloseTo(19.5, 1); // 1500 * 0.013
    expect(result.netProfitUsd).not.toBeNull();
    expect(result.profitPercent).toBeCloseTo(30.0, 0);
  });

  it("closed Stars trade: loss", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: 800n,
      commissionFlatStars: 0n,
      commissionPermille: 0,
      buyRateUsd: "0.013",
      sellRateUsd: "0.013",
    };

    const result = calculateProfit(trade);
    expect(result.netProfit).toBe(-200n);
    expect(result.profitPercent).toBeCloseTo(-20.0, 0);
  });

  it("open trade: null profits", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: null,
      commissionFlatStars: 50n,
      commissionPermille: 100,
      buyRateUsd: "0.013",
      sellRateUsd: null,
    };

    const result = calculateProfit(trade);
    expect(result.netProfit).toBeNull();
    expect(result.grossProfit).toBeNull();
    expect(result.totalCommission).toBeNull();
    expect(result.sellValueUsd).toBeNull();
    expect(result.netProfitUsd).toBeNull();
    expect(result.profitPercent).toBeNull();
    expect(result.buyValueUsd).toBeCloseTo(13.0, 1);
  });

  it("closed TON trade: profit with permille only", () => {
    const trade: TradeInput = {
      tradeCurrency: "TON",
      buyPrice: 5_000_000_000n, // 5 TON
      sellPrice: 8_000_000_000n, // 8 TON
      commissionFlatStars: 100n, // ignored for TON
      commissionPermille: 50, // 5%
      buyRateUsd: "3.50",
      sellRateUsd: "4.00",
    };

    const result = calculateProfit(trade);
    // gross = 8B - 5B = 3B (3 TON)
    // commission = ROUND(8B * 50 / 1000) = 400_000_000 (0.4 TON)
    // net = 3B - 400M = 2_600_000_000 (2.6 TON)
    expect(result.grossProfit).toBe(3_000_000_000n);
    expect(result.totalCommission).toBe(400_000_000n);
    expect(result.netProfit).toBe(2_600_000_000n);
    expect(result.buyValueUsd).toBeCloseTo(17.5, 1); // 5 * 3.50
    expect(result.sellValueUsd).toBeCloseTo(32.0, 1); // 8 * 4.00
  });

  it("null USD rates: profit calculation still works", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: 1500n,
      commissionFlatStars: 0n,
      commissionPermille: 0,
      buyRateUsd: null,
      sellRateUsd: null,
    };

    const result = calculateProfit(trade);
    expect(result.netProfit).toBe(500n);
    expect(result.buyValueUsd).toBeNull();
    expect(result.sellValueUsd).toBeNull();
    expect(result.netProfitUsd).toBeNull();
  });

  it("zero buy price: profit percent is null", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 0n,
      sellPrice: 500n,
      commissionFlatStars: 0n,
      commissionPermille: 0,
      buyRateUsd: null,
      sellRateUsd: null,
    };

    const result = calculateProfit(trade);
    expect(result.netProfit).toBe(500n);
    expect(result.profitPercent).toBeNull();
  });
});

// ─── Aggregate Stats ───

describe("aggregateStats", () => {
  it("mixed trades", () => {
    const trades = [
      {
        tradeCurrency: "STARS" as const,
        result: calculateProfit({
          tradeCurrency: "STARS",
          buyPrice: 1000n,
          sellPrice: 1500n,
          commissionFlatStars: 0n,
          commissionPermille: 0,
          buyRateUsd: "0.013",
          sellRateUsd: "0.013",
        }),
      },
      {
        tradeCurrency: "STARS" as const,
        result: calculateProfit({
          tradeCurrency: "STARS",
          buyPrice: 1000n,
          sellPrice: 800n,
          commissionFlatStars: 0n,
          commissionPermille: 0,
          buyRateUsd: "0.013",
          sellRateUsd: "0.013",
        }),
      },
      {
        tradeCurrency: "STARS" as const,
        result: calculateProfit({
          tradeCurrency: "STARS",
          buyPrice: 500n,
          sellPrice: null,
          commissionFlatStars: 0n,
          commissionPermille: 0,
          buyRateUsd: "0.013",
          sellRateUsd: null,
        }),
      },
    ];

    const stats = aggregateStats(trades);
    expect(stats.totalTrades).toBe(3);
    expect(stats.openTrades).toBe(1);
    expect(stats.closedTrades).toBe(2);
    expect(stats.totalProfitStars).toBe(300n); // 500 + (-200) = 300
    expect(stats.totalProfitNanoton).toBeNull();
    expect(stats.winRate).toBe(50); // 1 win out of 2 closed
    expect(stats.bestTradeStars).toBe(500n);
    expect(stats.worstTradeStars).toBe(-200n);
    expect(stats.bestTradeNanoton).toBeNull();
    expect(stats.worstTradeNanoton).toBeNull();
  });

  it("no trades", () => {
    const stats = aggregateStats([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.closedTrades).toBe(0);
    expect(stats.winRate).toBeNull();
    expect(stats.totalProfitStars).toBeNull();
  });

  it("all open trades", () => {
    const trades = [
      {
        tradeCurrency: "STARS" as const,
        result: calculateProfit({
          tradeCurrency: "STARS",
          buyPrice: 1000n,
          sellPrice: null,
          commissionFlatStars: 0n,
          commissionPermille: 0,
          buyRateUsd: null,
          sellRateUsd: null,
        }),
      },
    ];

    const stats = aggregateStats(trades);
    expect(stats.totalTrades).toBe(1);
    expect(stats.openTrades).toBe(1);
    expect(stats.closedTrades).toBe(0);
    expect(stats.winRate).toBeNull();
  });
});

// ─── Quantity Support ───

describe("calculateProfit with quantity", () => {
  it("quantity multiplies net profit", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: 1500n,
      commissionFlatStars: 0n,
      commissionPermille: 0,
      buyRateUsd: null,
      sellRateUsd: null,
      quantity: 5,
    };

    const result = calculateProfit(trade);
    // Per-unit profit = 1500 - 1000 = 500
    // Total = 500 * 5 = 2500
    expect(result.netProfit).toBe(2500n);
    expect(result.grossProfit).toBe(2500n);
  });

  it("quantity multiplies commission too", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: 1500n,
      commissionFlatStars: 50n,
      commissionPermille: 100, // 10%
      buyRateUsd: null,
      sellRateUsd: null,
      quantity: 3,
    };

    const result = calculateProfit(trade);
    // Per-unit commission = 50 + ROUND(1500*100/1000) = 50 + 150 = 200
    // Per-unit net = 500 - 200 = 300
    // Total net = 300 * 3 = 900
    // Total commission = 200 * 3 = 600
    expect(result.totalCommission).toBe(600n);
    expect(result.netProfit).toBe(900n);
  });

  it("profit percent stays per-unit", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: 1500n,
      commissionFlatStars: 0n,
      commissionPermille: 0,
      buyRateUsd: null,
      sellRateUsd: null,
      quantity: 10,
    };

    const result = calculateProfit(trade);
    // Per-unit profit = 500, per-unit percent = 50%
    expect(result.profitPercent).toBeCloseTo(50.0, 0);
    // But total profit = 5000
    expect(result.netProfit).toBe(5000n);
  });

  it("quantity=1 behaves like no quantity", () => {
    const base: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: 1500n,
      commissionFlatStars: 50n,
      commissionPermille: 100,
      buyRateUsd: "0.013",
      sellRateUsd: "0.013",
    };

    const withoutQty = calculateProfit(base);
    const withQty = calculateProfit({ ...base, quantity: 1 });

    expect(withoutQty.netProfit).toBe(withQty.netProfit);
    expect(withoutQty.totalCommission).toBe(withQty.totalCommission);
    expect(withoutQty.profitPercent).toBe(withQty.profitPercent);
  });

  it("open trade with quantity: USD value is multiplied", () => {
    const trade: TradeInput = {
      tradeCurrency: "STARS",
      buyPrice: 1000n,
      sellPrice: null,
      commissionFlatStars: 0n,
      commissionPermille: 0,
      buyRateUsd: "0.013",
      sellRateUsd: null,
      quantity: 5,
    };

    const result = calculateProfit(trade);
    expect(result.netProfit).toBeNull();
    // buyValueUsd = 1000 * 5 * 0.013 = 65
    expect(result.buyValueUsd).toBeCloseTo(65.0, 1);
  });

  it("TON trade with quantity", () => {
    const trade: TradeInput = {
      tradeCurrency: "TON",
      buyPrice: 5_000_000_000n,
      sellPrice: 8_000_000_000n,
      commissionFlatStars: 100n, // ignored for TON
      commissionPermille: 50,
      buyRateUsd: null,
      sellRateUsd: null,
      quantity: 2,
    };

    const result = calculateProfit(trade);
    // Per-unit: gross=3B, commission=400M, net=2.6B
    // Total: net=5.2B, commission=800M
    expect(result.netProfit).toBe(5_200_000_000n);
    expect(result.totalCommission).toBe(800_000_000n);
  });
});
