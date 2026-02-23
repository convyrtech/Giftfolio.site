import { z } from "zod";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { parseGiftUrl, pascalCaseToSpaces } from "@/lib/gift-parser";
import { getFloorPrices } from "@/lib/floor-prices";

export const giftsRouter = router({
  parseUrl: publicProcedure
    .input(z.object({ input: z.string().min(1).max(500) }))
    .query(({ input }) => {
      return parseGiftUrl(input.input);
    }),

  /** Return gift collection names + floor prices for autocomplete. */
  catalog: protectedProcedure.query(async () => {
    const floorPrices = await getFloorPrices();
    return Object.entries(floorPrices)
      .map(([name, floor]) => ({
        name,
        displayName: pascalCaseToSpaces(name),
        floorStars: floor,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }),
});
