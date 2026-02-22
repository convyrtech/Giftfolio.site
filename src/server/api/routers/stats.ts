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

  portfolioValue: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    // Get gift names of open positions (not sold, not deleted)
    const openPositions = await ctx.db
      .select({ giftName: trades.giftName })
      .from(trades)
      .where(
        and(
          eq(trades.userId, userId),
          isNull(trades.sellDate),
          isNull(trades.deletedAt),
        ),
      );

    if (openPositions.length === 0) {
      return { totalStars: 0, positions: 0, available: false };
    }

    const floorPrices = await getFloorPrices();
    const hasFloorData = Object.keys(floorPrices).length > 0;

    if (!hasFloorData) {
      return { totalStars: 0, positions: openPositions.length, available: false };
    }

    let totalStars = 0;
    let matched = 0;

    for (const pos of openPositions) {
      const floor = floorPrices[pos.giftName];
      if (floor) {
        totalStars += floor;
        matched++;
      }
    }

    return {
      totalStars,
      positions: openPositions.length,
      matched,
      available: true,
    };
  }),
});
