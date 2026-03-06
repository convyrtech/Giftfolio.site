import { z } from "zod";
import { and, eq, isNull, isNotNull, sql, desc, asc } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { trades, tradeProfits, userSettings } from "@/server/db/schema";

const rangeSchema = z.enum(["7d", "30d", "90d", "1y", "all"]).default("30d");
const granularitySchema = z.enum(["day", "week", "month"]).default("day");

function rangeToDays(range: z.infer<typeof rangeSchema>): number | null {
  switch (range) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "1y": return 365;
    case "all": return null;
  }
}

export const analyticsRouter = router({
  /**
   * Cumulative PnL time series for area chart.
   * Groups closed trades by sell_date, returns running total.
   */
  pnlTimeSeries: protectedProcedure
    .input(
      z.object({
        granularity: granularitySchema,
        range: rangeSchema,
        currency: z.enum(["STARS", "TON"]).default("STARS"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const days = rangeToDays(input.range);

      const [settings] = await ctx.db
        .select({ timezone: userSettings.timezone })
        .from(userSettings)
        .where(eq(userSettings.userId, userId));
      const tz = settings?.timezone ?? "UTC";

      // Date truncation based on granularity
      // sell_date is `date` type — must cast to `timestamp` before AT TIME ZONE
      const dateTrunc = input.granularity === "day"
        ? sql`(${tradeProfits.sellDate}::timestamp AT TIME ZONE ${tz})::date`
        : input.granularity === "week"
          ? sql`date_trunc('week', ${tradeProfits.sellDate}::timestamp AT TIME ZONE ${tz})::date`
          : sql`date_trunc('month', ${tradeProfits.sellDate}::timestamp AT TIME ZONE ${tz})::date`;

      const conditions = [
        eq(tradeProfits.userId, userId),
        isNull(tradeProfits.deletedAt),
        isNotNull(tradeProfits.sellDate),
        eq(tradeProfits.excludeFromPnl, false),
      ];

      conditions.push(eq(tradeProfits.tradeCurrency, input.currency));

      if (days !== null) {
        conditions.push(
          sql`${tradeProfits.sellDate} >= (CURRENT_TIMESTAMP AT TIME ZONE ${tz} - make_interval(days => ${days}))::date`,
        );
      }

      // Profit column depends on currency filter
      const profitCol = input.currency === "TON"
        ? tradeProfits.netProfitNanoton
        : tradeProfits.netProfitStars;

      const rows = await ctx.db
        .select({
          date: sql<string>`${dateTrunc}`.as("period_date"),
          profit: sql<string>`coalesce(sum(${profitCol}), 0)::bigint`.as("period_profit"),
          count: sql<number>`count(*)::int`.mapWith(Number),
        })
        .from(tradeProfits)
        .where(and(...conditions))
        .groupBy(sql`1`)
        .orderBy(sql`1`);

      // Compute cumulative sum
      let cumulative = 0n;
      return rows.map((row) => {
        cumulative += BigInt(row.profit);
        return {
          date: row.date,
          profit: row.profit,
          cumulative: cumulative.toString(),
          trades: row.count,
        };
      });
    }),

  /**
   * Portfolio composition — top N gifts by total buy value (open positions).
   */
  portfolioComposition: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const rows = await ctx.db
      .select({
        giftName: trades.giftName,
        count: sql<number>`sum(${trades.quantity})::int`.mapWith(Number),
        totalBuy: sql<string>`coalesce(sum(${trades.buyPrice} * ${trades.quantity}), 0)::bigint`,
        currency: trades.tradeCurrency,
      })
      .from(trades)
      .where(
        and(
          eq(trades.userId, userId),
          isNull(trades.sellDate),
          isNull(trades.deletedAt),
          eq(trades.excludeFromPnl, false),
        ),
      )
      .groupBy(trades.giftName, trades.tradeCurrency)
      .orderBy(sql`sum(${trades.buyPrice} * ${trades.quantity}) desc`)
      .limit(10);

    return rows.map((row) => ({
      giftName: row.giftName,
      count: row.count,
      totalBuy: row.totalBuy,
      currency: row.currency,
    }));
  }),

  /**
   * Trade outcomes — win/loss/breakeven counts + win rate.
   */
  tradeOutcomes: protectedProcedure
    .input(
      z.object({
        period: z.enum(["week", "month", "total"]).default("total"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const conditions = [
        eq(tradeProfits.userId, userId),
        isNull(tradeProfits.deletedAt),
        isNotNull(tradeProfits.sellDate),
        eq(tradeProfits.excludeFromPnl, false),
      ];

      if (input.period !== "total") {
        const [settings] = await ctx.db
          .select({ timezone: userSettings.timezone })
          .from(userSettings)
          .where(eq(userSettings.userId, userId));
        const tz = settings?.timezone ?? "UTC";
        const days = input.period === "week" ? 7 : 30;
        conditions.push(
          sql`${tradeProfits.sellDate} >= (CURRENT_TIMESTAMP AT TIME ZONE ${tz} - make_interval(days => ${days}))::date`,
        );
      }

      // Currency-aware profit: use Stars column for STARS trades, nanoton for TON
      const profitExpr = sql`CASE WHEN ${tradeProfits.tradeCurrency} = 'TON'
        THEN coalesce(${tradeProfits.netProfitNanoton}, 0)
        ELSE coalesce(${tradeProfits.netProfitStars}, 0) END`;

      const [result] = await ctx.db
        .select({
          total: sql<number>`count(*)::int`.mapWith(Number),
          wins: sql<number>`(count(*) filter (where ${profitExpr} > 0))::int`.mapWith(Number),
          losses: sql<number>`(count(*) filter (where ${profitExpr} < 0))::int`.mapWith(Number),
          breakeven: sql<number>`(count(*) filter (where ${profitExpr} = 0))::int`.mapWith(Number),
        })
        .from(tradeProfits)
        .where(and(...conditions));

      if (!result) {
        return { total: 0, wins: 0, losses: 0, breakeven: 0, winRate: null };
      }

      return {
        ...result,
        winRate: result.total > 0 ? Math.round((result.wins / result.total) * 100) : null,
      };
    }),

  /**
   * Best & worst trades — top 3 by profit per currency + worst trade.
   */
  bestTrades: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const baseWhere = and(
      eq(tradeProfits.userId, userId),
      isNull(tradeProfits.deletedAt),
      isNotNull(tradeProfits.sellDate),
      eq(tradeProfits.excludeFromPnl, false),
    );

    const selectFields = {
      id: tradeProfits.id,
      giftName: tradeProfits.giftName,
      giftNumber: tradeProfits.giftNumber,
      tradeCurrency: tradeProfits.tradeCurrency,
      buyPrice: tradeProfits.buyPrice,
      sellPrice: tradeProfits.sellPrice,
      quantity: tradeProfits.quantity,
      netProfitStars: tradeProfits.netProfitStars,
      netProfitNanoton: tradeProfits.netProfitNanoton,
    };

    // Best Stars trades (top 3 by net_profit_stars DESC)
    const bestStars = await ctx.db
      .select(selectFields)
      .from(tradeProfits)
      .where(and(baseWhere, eq(tradeProfits.tradeCurrency, "STARS"), isNotNull(tradeProfits.netProfitStars)))
      .orderBy(desc(tradeProfits.netProfitStars))
      .limit(3);

    // Best TON trades (top 3 by net_profit_nanoton DESC)
    const bestTon = await ctx.db
      .select(selectFields)
      .from(tradeProfits)
      .where(and(baseWhere, eq(tradeProfits.tradeCurrency, "TON"), isNotNull(tradeProfits.netProfitNanoton)))
      .orderBy(desc(tradeProfits.netProfitNanoton))
      .limit(3);

    // Worst trades: only show actually losing trades (profit < 0)
    const [worstStars] = await ctx.db
      .select(selectFields)
      .from(tradeProfits)
      .where(and(baseWhere, eq(tradeProfits.tradeCurrency, "STARS"), isNotNull(tradeProfits.netProfitStars), sql`${tradeProfits.netProfitStars} < 0`))
      .orderBy(asc(tradeProfits.netProfitStars))
      .limit(1);

    const [worstTon] = await ctx.db
      .select(selectFields)
      .from(tradeProfits)
      .where(and(baseWhere, eq(tradeProfits.tradeCurrency, "TON"), isNotNull(tradeProfits.netProfitNanoton), sql`${tradeProfits.netProfitNanoton} < 0`))
      .orderBy(asc(tradeProfits.netProfitNanoton))
      .limit(1);

    type TradeRow = (typeof bestStars)[number];
    function addRoi(trade: TradeRow): TradeRow & { roiPercent: number | null } {
      const buyPrice = trade.buyPrice ?? 0n;
      const qty = trade.quantity;
      if (qty === null) return { ...trade, roiPercent: null };
      const buyTotal = buyPrice * BigInt(qty);
      if (buyTotal === 0n) return { ...trade, roiPercent: null };
      const profit = trade.tradeCurrency === "TON" ? trade.netProfitNanoton : trade.netProfitStars;
      if (profit === null) return { ...trade, roiPercent: null };
      return { ...trade, roiPercent: Number((profit * 10000n) / buyTotal) / 100 };
    }

    return {
      bestStars: bestStars.map(addRoi),
      bestTon: bestTon.map(addRoi),
      worstStars: worstStars ? addRoi(worstStars) : null,
      worstTon: worstTon ? addRoi(worstTon) : null,
    };
  }),
});
