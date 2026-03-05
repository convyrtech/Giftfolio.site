/**
 * Floor price fetcher for Telegram gift collections.
 * Source: gift-bubbles.up.railway.app (via getGiftBubblesData, which has its own 5min cache).
 *
 * Returns a map of normalized name → floor price in Stars.
 * Normalized name: lowercase, spaces/hyphens removed ("Easter Egg" → "easteregg").
 * Conversion: floorprice_usd / Stars_per_USD → rounded integer Stars.
 * Never throws — returns empty object on total failure.
 */

import { getGiftBubblesData } from "./gift-bubbles";
import { getStarsUsdRate } from "./exchange-rates";

export async function getFloorPrices(): Promise<Record<string, number>> {
  const { items, available } = await getGiftBubblesData();
  if (!available || items.length === 0) return {};

  const starsUsdRate = getStarsUsdRate(); // $0.013 per Star (fixed by Telegram)
  const result: Record<string, number> = {};

  for (const item of items) {
    // Normalize: "Easter Egg" → "easteregg" to match trade.giftName lookup
    const key = item.name.toLowerCase().replace(/[\s-]/g, "");
    const floorStars = Math.round(item.floorprice_usd / starsUsdRate);
    if (floorStars > 0) {
      result[key] = floorStars;
    }
  }

  return result;
}
