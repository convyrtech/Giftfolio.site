import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { router, protectedProcedure, rateLimitedProcedure } from "../trpc";
import { userSettings, type UserSetting } from "@/server/db/schema";

const ianaTimezone = z.string().max(50).refine(
  (tz) => {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Invalid IANA timezone" },
);

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, ctx.user.id));

    if (!settings) {
      // Create default settings if missing — ON CONFLICT handles concurrent race
      await ctx.db
        .insert(userSettings)
        .values({ userId: ctx.user.id })
        .onConflictDoNothing({ target: userSettings.userId });

      const [created] = await ctx.db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, ctx.user.id));

      if (!created) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create settings" });
      }
      return created;
    }

    return settings;
  }),

  update: rateLimitedProcedure
    .input(
      z.object({
        defaultCommissionStars: z.coerce.bigint().min(0n).optional(),
        defaultCommissionPermille: z.number().int().min(0).max(1000).optional(),
        defaultCurrency: z.enum(["STARS", "TON", "USDT"]).optional(),
        timezone: ianaTimezone.optional(),
        starsToTonRate: z.string().regex(/^\d+(\.\d{1,9})?$/, "Must be a positive decimal number").refine((v) => parseFloat(v) > 0, "Rate must be greater than 0").nullable().optional(),
        locale: z.enum(["en", "ru", "zh"]).optional(),
        profileType: z.enum(["flip", "invest"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const updateData: Partial<UserSetting> = {};
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
      if (input.starsToTonRate !== undefined) {
        updateData.starsToTonRate = input.starsToTonRate;
      }
      if (input.locale !== undefined) {
        updateData.locale = input.locale;
      }
      if (input.profileType !== undefined) {
        updateData.profileType = input.profileType;
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

  updateWalletAddress: rateLimitedProcedure
    .input(
      z.object({
        // null = clear the wallet address
        tonWalletAddress: z
          .string()
          .trim()
          .max(100)
          .regex(/^[a-zA-Z0-9_\-:]+$/, "Invalid TON wallet address format")
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Upsert: creates settings row if it doesn't exist yet (e.g. new user who hasn't opened settings)
      await ctx.db
        .insert(userSettings)
        .values({ userId, tonWalletAddress: input.tonWalletAddress })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: { tonWalletAddress: input.tonWalletAddress },
        });

      return { success: true };
    }),
});
