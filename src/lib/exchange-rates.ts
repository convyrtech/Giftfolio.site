import { STARS_USD_RATE } from "./currencies";

interface RateCache {
  rate: number;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let tonUsdCache: RateCache | null = null;

/**
 * Fetch TON/USD rate from Binance (primary) or OKX (fallback).
 * Uses Promise.any — first successful response wins.
 * In-memory cache with 5min TTL, stale-while-revalidate on failure.
 */
export async function getTonUsdRate(): Promise<number | null> {
  // Return cached rate if fresh
  if (tonUsdCache && Date.now() - tonUsdCache.fetchedAt < CACHE_TTL_MS) {
    return tonUsdCache.rate;
  }

  try {
    const rate = await Promise.any([fetchBinanceTonRate(), fetchOkxTonRate()]);

    tonUsdCache = { rate, fetchedAt: Date.now() };
    return rate;
  } catch {
    // All sources failed — return stale cache if available
    if (tonUsdCache) {
      return tonUsdCache.rate;
    }
    return null;
  }
}

async function fetchBinanceTonRate(): Promise<number> {
  const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT", {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
  const data = (await res.json()) as { price: string };
  const rate = parseFloat(data.price);
  if (isNaN(rate) || rate <= 0) throw new Error("Binance invalid price");
  return rate;
}

async function fetchOkxTonRate(): Promise<number> {
  const res = await fetch("https://www.okx.com/api/v5/market/ticker?instId=TON-USDT", {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`OKX HTTP ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ last: string }> };
  if (!Array.isArray(data.data) || data.data.length === 0) {
    throw new Error("OKX invalid response structure");
  }
  const rate = parseFloat(data.data[0].last);
  if (isNaN(rate) || rate <= 0) throw new Error("OKX invalid price");
  return rate;
}

/**
 * Get Stars/USD rate. Fixed at $0.013 by Telegram.
 */
export function getStarsUsdRate(): number {
  return STARS_USD_RATE;
}
