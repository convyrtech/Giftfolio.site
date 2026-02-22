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
      const userId = ctx.user.id;

      // Get user timezone for date filtering
      const [settings] = await ctx.db
        .select({ timezone: userSettings.timezone })
        .from(userSettings)
        .where(eq(userSettings.userId, userId));

      const tz = settings?.timezone ?? "UTC";

      const baseConditions = [
        eq(trades.userId, userId),
        isNull(trades.deletedAt),
      ];

      if (input.currency) {
        baseConditions.push(eq(trades.tradeCurrency, input.currency));
      }

      // Period filter on sell_date (completed trades only for PnL)
      const pnlConditions = [...baseConditions, isNotNull(trades.sellDate)];
      if (input.period !== "total") {
        const days = input.period === "day" ? 1 : input.period === "week" ? 7 : 30;
        pnlConditions.push(
          gte(
            trades.sellDate,
            sql`(CURRENT_DATE AT TIME ZONE ${tz} - make_interval(days => ${days}))::date`,
          ),
        );
      }

      // PnL stats — only closed trades (with sellDate)
      const pnlResult = await ctx.db
        .select({
          tradeCurrency: trades.tradeCurrency,
          closedTrades: sql<number>`count(*)::int`.mapWith(Number),
          totalBuy: sql<bigint>`coalesce(sum(${trades.buyPrice}), 0)`.mapWith(BigInt),
          totalSell: sql<bigint>`coalesce(sum(${trades.sellPrice}), 0)`.mapWith(BigInt),
          totalCommissionFlat: sql<bigint>`coalesce(sum(${trades.commissionFlatStars}), 0)`.mapWith(BigInt),
          totalPermilleCommission: sql<bigint>`coalesce(sum(${trades.sellPrice} * ${trades.commissionPermille} / 1000), 0)`.mapWith(BigInt),
        })
        .from(trades)
        .where(and(...pnlConditions))
        .groupBy(trades.tradeCurrency);

      // Total trade count + open positions — always unfiltered by period
      const countResult = await ctx.db
        .select({
          tradeCurrency: trades.tradeCurrency,
          totalTrades: sql<number>`count(*)::int`.mapWith(Number),
          openTrades: sql<number>`count(*) filter (where ${trades.sellDate} is null)::int`.mapWith(Number),
        })
        .from(trades)
        .where(and(...baseConditions))
        .groupBy(trades.tradeCurrency);

      // Merge results
      return countResult.map((c) => {
        const pnl = pnlResult.find((p) => p.tradeCurrency === c.tradeCurrency);
        return {
          tradeCurrency: c.tradeCurrency,
          totalTrades: c.totalTrades,
          openTrades: c.openTrades,
          closedTrades: pnl?.closedTrades ?? 0,
          totalBuy: pnl?.totalBuy ?? 0n,
          totalSell: pnl?.totalSell ?? 0n,
          totalCommissionFlat: pnl?.totalCommissionFlat ?? 0n,
          totalPermilleCommission: pnl?.totalPermilleCommission ?? 0n,
        };
      });
    }),
});
