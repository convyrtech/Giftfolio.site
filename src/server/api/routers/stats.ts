import { z } from "zod";
import { and, eq, isNull, isNotNull, gte, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { trades, userSettings } from "@/server/db/schema";

export const statsRouter = router({
  dashboard: protectedProcedure
    .input(
      z.object({
        period: z.enum(["day", "week", "month", "total"]).default("total"),
        currency: z.enum(["STARS", "TON"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = BigInt(ctx.user.id);

      // Get user timezone for date filtering
      const [settings] = await ctx.db
        .select({ timezone: userSettings.timezone })
        .from(userSettings)
        .where(eq(userSettings.userId, userId));

      const tz = settings?.timezone ?? "UTC";

      const conditions = [
        eq(trades.userId, userId),
        isNull(trades.deletedAt),
      ];

      if (input.currency) {
        conditions.push(eq(trades.tradeCurrency, input.currency));
      }

      // Period filter on sell_date (completed trades only for PnL)
      if (input.period !== "total") {
        const interval =
          input.period === "day"
            ? "1 day"
            : input.period === "week"
              ? "7 days"
              : "30 days";

        conditions.push(isNotNull(trades.sellDate));
        conditions.push(
          gte(
            trades.sellDate,
            sql`(CURRENT_DATE AT TIME ZONE ${tz} - INTERVAL '${sql.raw(interval)}')::date`,
          ),
        );
      }

      // Aggregate stats in a single query per currency
      const result = await ctx.db
        .select({
          tradeCurrency: trades.tradeCurrency,
          totalTrades: sql<number>`count(*)::int`,
          closedTrades: sql<number>`count(${trades.sellDate})::int`,
          totalBuy: sql<bigint>`coalesce(sum(${trades.buyPrice}), 0)`.mapWith(BigInt),
          totalSell: sql<bigint>`coalesce(sum(${trades.sellPrice}), 0)`.mapWith(BigInt),
          totalCommissionFlat: sql<bigint>`coalesce(sum(${trades.commissionFlatStars}), 0)`.mapWith(BigInt),
          avgPermille: sql<number>`coalesce(avg(${trades.commissionPermille}), 0)::int`,
        })
        .from(trades)
        .where(and(...conditions))
        .groupBy(trades.tradeCurrency);

      return result;
    }),
});
