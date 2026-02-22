import { router, protectedProcedure } from "../trpc";
import { getTonUsdRate, getStarsUsdRate } from "@/lib/exchange-rates";

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
});
