import type { Stars, NanoTon } from "./currencies";

/**
 * PnL Engine — pure functions for profit/loss calculations.
 *
 * All calculations use BigInt arithmetic to avoid floating-point errors.
 * These functions mirror the SQL VIEW `trade_profits` logic exactly.
 */

export interface TradeInput {
  tradeCurrency: "STARS" | "TON";
  buyPrice: bigint;
  sellPrice: bigint | null;
  commissionFlatStars: bigint;
  commissionPermille: number; // 0-1000, where 1000 = 100%
  buyRateUsd: string | null; // NUMERIC as string from DB
  sellRateUsd: string | null;
  quantity?: number; // default 1
}

export interface ProfitResult {
  /** Net profit in native currency (Stars or NanoTon). Null if trade is open. */
  netProfit: bigint | null;
  /** Gross profit before commission. Null if trade is open. */
  grossProfit: bigint | null;
  /** Total commission deducted. Null if trade is open. */
  totalCommission: bigint | null;
  /** Buy value in USD. Null if rate unavailable. */
  buyValueUsd: number | null;
  /** Sell value in USD. Null if trade is open or rate unavailable. */
  sellValueUsd: number | null;
  /** Net profit in USD. Null if either rate unavailable or trade is open. */
  netProfitUsd: number | null;
  /** Profit percentage. Null if trade is open or buy price is 0. */
  profitPercent: number | null;
}

/**
 * Calculate commission for a closed trade.
 *
 * Stars: flat + ROUND(sellPrice * permille / 1000)
 * TON: ROUND(sellPrice * permille / 1000)  — no flat fee (different currency)
 */
export function calculateCommission(
  tradeCurrency: "STARS" | "TON",
  sellPrice: bigint,
  commissionFlatStars: bigint,
  commissionPermille: number,
): bigint {
  const permilleCommission = (sellPrice * BigInt(commissionPermille) + 500n) / 1000n;

  if (tradeCurrency === "STARS") {
    return commissionFlatStars + permilleCommission;
  }
  // TON: no flat fee (flat is in Stars, can't mix currencies)
  return permilleCommission;
}

/**
 * Calculate full profit/loss for a trade.
 */
export function calculateProfit(trade: TradeInput): ProfitResult {
  const { tradeCurrency, buyPrice, sellPrice, commissionFlatStars, commissionPermille } = trade;
  const qty = BigInt(trade.quantity ?? 1);

  // Open trade — no profit yet
  if (sellPrice === null) {
    const buyValueUsd = computeUsdValue(tradeCurrency, buyPrice * qty, trade.buyRateUsd);
    return {
      netProfit: null,
      grossProfit: null,
      totalCommission: null,
      buyValueUsd,
      sellValueUsd: null,
      netProfitUsd: null,
      profitPercent: null,
    };
  }

  // Per-unit commission (each gift = one transfer)
  const unitCommission = calculateCommission(
    tradeCurrency,
    sellPrice,
    commissionFlatStars,
    commissionPermille,
  );

  const unitGross = sellPrice - buyPrice;
  const unitNet = unitGross - unitCommission;

  // Total = per-unit * quantity
  const totalCommission = unitCommission * qty;
  const grossProfit = unitGross * qty;
  const netProfit = unitNet * qty;

  const buyValueUsd = computeUsdValue(tradeCurrency, buyPrice * qty, trade.buyRateUsd);
  const sellValueUsd = computeUsdValue(tradeCurrency, sellPrice * qty, trade.sellRateUsd);

  let netProfitUsd: number | null = null;
  if (buyValueUsd !== null && sellValueUsd !== null) {
    const commissionUsd = computeUsdValue(tradeCurrency, totalCommission, trade.sellRateUsd);
    if (commissionUsd !== null) {
      netProfitUsd = sellValueUsd - buyValueUsd - commissionUsd;
    }
  }

  // Profit percent stays per-unit (% doesn't change with quantity)
  let profitPercent: number | null = null;
  if (buyPrice > 0n) {
    profitPercent = Number((unitNet * 10000n) / buyPrice) / 100;
  }

  return {
    netProfit,
    grossProfit,
    totalCommission,
    buyValueUsd,
    sellValueUsd,
    netProfitUsd,
    profitPercent,
  };
}

/**
 * Convert a BigInt price to USD using rate string.
 * Stars: price * STARS_USD_RATE (0.013)
 * TON: nanotons / 1e9 * rate
 */
function computeUsdValue(
  currency: "STARS" | "TON",
  price: bigint,
  rateUsd: string | null,
): number | null {
  if (rateUsd === null) return null;
  const rate = parseFloat(rateUsd);
  if (isNaN(rate) || rate <= 0) return null;

  if (currency === "STARS") {
    return Number(price) * rate;
  }
  // TON: nanotons → TON → USD
  return (Number(price) / 1e9) * rate;
}

/**
 * Aggregate dashboard stats from an array of trade profits.
 */
export interface DashboardStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  totalProfitStars: Stars | null;
  totalProfitNanoton: NanoTon | null;
  totalProfitUsd: number | null;
  winRate: number | null; // 0-100
  bestTrade: bigint | null;
  worstTrade: bigint | null;
}

export function aggregateStats(
  trades: Array<{ result: ProfitResult; tradeCurrency: "STARS" | "TON" }>,
): DashboardStats {
  let totalStars = 0n;
  let totalNanoton = 0n;
  let totalUsd = 0;
  let hasStars = false;
  let hasNanoton = false;
  let hasUsd = false;
  let wins = 0;
  let closed = 0;
  let bestTrade: bigint | null = null;
  let worstTrade: bigint | null = null;

  for (const { result, tradeCurrency } of trades) {
    if (result.netProfit === null) continue; // skip open trades
    closed++;

    if (result.netProfit > 0n) wins++;

    if (tradeCurrency === "STARS") {
      totalStars += result.netProfit;
      hasStars = true;
      if (bestTrade === null || result.netProfit > bestTrade) bestTrade = result.netProfit;
      if (worstTrade === null || result.netProfit < worstTrade) worstTrade = result.netProfit;
    } else {
      totalNanoton += result.netProfit;
      hasNanoton = true;
    }

    if (result.netProfitUsd !== null) {
      totalUsd += result.netProfitUsd;
      hasUsd = true;
    }
  }

  return {
    totalTrades: trades.length,
    openTrades: trades.length - closed,
    closedTrades: closed,
    totalProfitStars: hasStars ? (totalStars as Stars) : null,
    totalProfitNanoton: hasNanoton ? (totalNanoton as NanoTon) : null,
    totalProfitUsd: hasUsd ? totalUsd : null,
    winRate: closed > 0 ? (wins / closed) * 100 : null,
    bestTrade,
    worstTrade,
  };
}
