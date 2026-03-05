import { router, protectedProcedure, publicRateLimitedProcedure } from "../trpc";
import { getTonUsdRate, getStarsUsdRate } from "@/lib/exchange-rates";
import { getFloorPrices } from "@/lib/floor-prices";
import { getGiftBubblesData } from "@/lib/gift-bubbles";

export const marketRouter = router({
  exchangeRates: protectedProcedure.query(async () => {
    const tonUsd = await getTonUsdRate();
    const starsUsd = getStarsUsdRate();

    return {
      tonUsd,
      starsUsd,
      fetchedAt: new Date().toISOString(),
    };
  }),

  floorPrices: protectedProcedure.query(async () => {
    const prices = await getFloorPrices();
    return prices;
  }),

  /** Public market data — gift collection floor prices, % changes, listings count */
  list: publicRateLimitedProcedure.query(async () => {
    return getGiftBubblesData();
  }),
});
