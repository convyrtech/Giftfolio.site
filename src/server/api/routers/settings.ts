import { z } from "zod";
import { eq } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { userSettings } from "@/server/db/schema";

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, BigInt(ctx.user.id)));

    if (!settings) {
      // Create default settings if missing (shouldn't happen after auth setup)
      const [created] = await ctx.db
        .insert(userSettings)
        .values({ userId: BigInt(ctx.user.id) })
        .returning();
      return created!;
    }

    return settings;
  }),

  update: protectedProcedure
    .input(
      z.object({
        defaultCommissionStars: z.coerce.bigint().min(0n).optional(),
        defaultCommissionPermille: z.number().int().min(0).max(1000).optional(),
        defaultCurrency: z.enum(["STARS", "TON"]).optional(),
        timezone: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = BigInt(ctx.user.id);

      const updateData: Record<string, unknown> = {};
      if (input.defaultCommissionStars !== undefined) {
        updateData.defaultCommissionStars = input.defaultCommissionStars;
      }
      if (input.defaultCommissionPermille !== undefined) {
        updateData.defaultCommissionPermille = input.defaultCommissionPermille;
      }
      if (input.defaultCurrency !== undefined) {
        updateData.defaultCurrency = input.defaultCurrency;
      }
      if (input.timezone !== undefined) {
        updateData.timezone = input.timezone;
      }

      if (Object.keys(updateData).length === 0) {
        return { success: true };
      }

      await ctx.db
        .update(userSettings)
        .set(updateData)
        .where(eq(userSettings.userId, userId));

      return { success: true };
    }),
});
