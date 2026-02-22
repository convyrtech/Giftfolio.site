import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { parseGiftUrl } from "@/lib/gift-parser";

export const giftsRouter = router({
  parseUrl: publicProcedure
    .input(z.object({ input: z.string().min(1).max(500) }))
    .query(({ input }) => {
      return parseGiftUrl(input.input);
    }),
});
