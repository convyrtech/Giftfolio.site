import { router, protectedProcedure } from "../trpc";
import { getTonUsdRate, getStarsUsdRate } from "@/lib/exchange-rates";
import { getFloorPrices } from "@/lib/floor-prices";

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
});
