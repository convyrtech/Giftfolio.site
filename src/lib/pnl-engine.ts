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

// ─── Unrealized PnL ───

export interface UnrealizedPnlResult {
  /** Floor price in Stars (always Stars, from giftasset.pro) */
  floorPriceStars: bigint;
  /** Unrealized net profit (total, qty-multiplied). Null for TON trades (cross-currency). */
  unrealizedPnl: bigint | null;
  /** Unrealized profit percent (per-unit). Null for TON or zero buy price. */
  unrealizedPercent: number | null;
}

/**
 * Calculate unrealized PnL for an open position using floor price.
 *
 * Floor prices from giftasset.pro are always in Stars.
 * - Stars trades: (floor - buy - commission) * qty
 * - TON trades: null (can't subtract NanoTon from Stars without rate)
 *
 * Commission is calculated as if selling at floor price.
 */
export function calculateUnrealizedPnl(
  buyPrice: bigint,
  tradeCurrency: "STARS" | "TON",
  floorPriceStars: number,
  commissionFlatStars: bigint,
  commissionPermille: number,
  quantity: number,
): UnrealizedPnlResult {
  // Guard against NaN/Infinity — treat as "no data"
  if (!Number.isFinite(floorPriceStars) || floorPriceStars <= 0) {
    return { floorPriceStars: 0n as Stars, unrealizedPnl: null, unrealizedPercent: null };
  }

  const floor = BigInt(Math.round(floorPriceStars));

  if (tradeCurrency === "TON") {
    return { floorPriceStars: floor, unrealizedPnl: null, unrealizedPercent: null };
  }

  const qty = BigInt(quantity);
  // Commission on hypothetical sell at floor price (per-unit)
  const unitCommission = calculateCommission("STARS", floor, commissionFlatStars, commissionPermille);
  const unitNet = floor - buyPrice - unitCommission;
  const totalNet = unitNet * qty;

  let percent: number | null = null;
  if (buyPrice > 0n) {
    percent = Number((unitNet * 10000n) / buyPrice) / 100;
  }

  return {
    floorPriceStars: floor,
    unrealizedPnl: totalNet,
    unrealizedPercent: percent,
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
  bestTradeStars: bigint | null;
  worstTradeStars: bigint | null;
  bestTradeNanoton: bigint | null;
  worstTradeNanoton: bigint | null;
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
  let bestTradeStars: bigint | null = null;
  let worstTradeStars: bigint | null = null;
  let bestTradeNanoton: bigint | null = null;
  let worstTradeNanoton: bigint | null = null;

  for (const { result, tradeCurrency } of trades) {
    if (result.netProfit === null) continue; // skip open trades
    closed++;

    if (result.netProfit > 0n) wins++;

    if (tradeCurrency === "STARS") {
      totalStars += result.netProfit;
      hasStars = true;
      if (bestTradeStars === null || result.netProfit > bestTradeStars) bestTradeStars = result.netProfit;
      if (worstTradeStars === null || result.netProfit < worstTradeStars) worstTradeStars = result.netProfit;
    } else {
      totalNanoton += result.netProfit;
      hasNanoton = true;
      if (bestTradeNanoton === null || result.netProfit > bestTradeNanoton) bestTradeNanoton = result.netProfit;
      if (worstTradeNanoton === null || result.netProfit < worstTradeNanoton) worstTradeNanoton = result.netProfit;
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
    bestTradeStars,
    worstTradeStars,
    bestTradeNanoton,
    worstTradeNanoton,
  };
}
