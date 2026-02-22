import { z } from "zod";
import { and, eq, isNull, isNotNull, gte, sql } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { trades, userSettings } from "@/server/db/schema";
import { getFloorPrices } from "@/lib/floor-prices";

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
        // Only fetch timezone when needed for date filtering
        const [settings] = await ctx.db
          .select({ timezone: userSettings.timezone })
          .from(userSettings)
          .where(eq(userSettings.userId, userId));
        const tz = settings?.timezone ?? "UTC";

        const days = input.period === "day" ? 1 : input.period === "week" ? 7 : 30;
        pnlConditions.push(
          gte(
            trades.sellDate,
            sql`(CURRENT_DATE AT TIME ZONE ${tz} - make_interval(days => ${days}))::date`,
          ),
        );
      }

      // PnL stats — only closed trades (with sellDate), multiplied by quantity
      const pnlResult = await ctx.db
        .select({
          tradeCurrency: trades.tradeCurrency,
          closedTrades: sql<number>`sum(${trades.quantity})::int`.mapWith(Number),
          totalBuy: sql<bigint>`coalesce(sum(${trades.buyPrice} * ${trades.quantity}), 0)`.mapWith(BigInt),
          totalSell: sql<bigint>`coalesce(sum(${trades.sellPrice} * ${trades.quantity}), 0)`.mapWith(BigInt),
          totalCommissionFlat: sql<bigint>`coalesce(sum(${trades.commissionFlatStars} * ${trades.quantity}), 0)`.mapWith(BigInt),
          totalPermilleCommission: sql<bigint>`coalesce(sum(ROUND(${trades.sellPrice} * ${trades.commissionPermille} / 1000.0) * ${trades.quantity}), 0)`.mapWith(BigInt),
        })
        .from(trades)
        .where(and(...pnlConditions))
        .groupBy(trades.tradeCurrency);

      // Total trade count + open positions — always unfiltered by period, use quantity
      const countResult = await ctx.db
        .select({
          tradeCurrency: trades.tradeCurrency,
          totalTrades: sql<number>`sum(${trades.quantity})::int`.mapWith(Number),
          openTrades: sql<number>`coalesce(sum(${trades.quantity}) filter (where ${trades.sellDate} is null), 0)::int`.mapWith(Number),
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

  portfolioValue: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Group open positions by gift name with quantity sum to reduce data transfer.
    const openGroups = await ctx.db
      .select({
        giftName: trades.giftName,
        count: sql<number>`sum(${trades.quantity})::int`.mapWith(Number),
      })
      .from(trades)
      .where(
        and(
          eq(trades.userId, userId),
          isNull(trades.sellDate),
          isNull(trades.deletedAt),
        ),
      )
      .groupBy(trades.giftName);

    const totalPositions = openGroups.reduce((sum, g) => sum + g.count, 0);

    if (openGroups.length === 0) {
      return { totalStars: 0, positions: 0, available: false };
    }

    const floorPrices = await getFloorPrices();
    const hasFloorData = Object.keys(floorPrices).length > 0;

    if (!hasFloorData) {
      return { totalStars: 0, positions: totalPositions, available: false };
    }

    let totalStars = 0;
    let matched = 0;

    for (const group of openGroups) {
      const floor = floorPrices[group.giftName];
      if (floor !== undefined) {
        totalStars += floor * group.count;
        matched += group.count;
      }
    }

    return {
      totalStars,
      positions: totalPositions,
      matched,
      available: true,
    };
  }),
});
