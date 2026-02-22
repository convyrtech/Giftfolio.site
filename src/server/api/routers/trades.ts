import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, desc, asc, lt, gt } from "drizzle-orm";
import { router, protectedProcedure } from "../trpc";
import { trades, type Trade, userSettings } from "@/server/db/schema";
import { parseGiftUrl, getGiftTelegramUrl } from "@/lib/gift-parser";
import { getTonUsdRate, getStarsUsdRate } from "@/lib/exchange-rates";

const sortColumns = ["buy_date", "sell_date", "buy_price", "sell_price", "created_at"] as const;

const tradeInput = z.object({
  giftUrl: z.string().min(1).max(500),
  tradeCurrency: z.enum(["STARS", "TON"]),
  buyPrice: z.coerce.bigint().min(0n),
  sellPrice: z.coerce.bigint().min(0n).optional(),
  buyDate: z.coerce.date(),
  sellDate: z.coerce.date().optional(),
  commissionFlatStars: z.coerce.bigint().min(0n).optional(),
  commissionPermille: z.number().int().min(0).max(1000).optional(),
  buyMarketplace: z.enum(["fragment", "getgems", "tonkeeper", "p2p", "other"]).optional(),
  sellMarketplace: z.enum(["fragment", "getgems", "tonkeeper", "p2p", "other"]).optional(),
  notes: z.string().max(1000).optional(),
  // Gift attributes (optional, from API)
  attrModel: z.string().optional(),
  attrBackdrop: z.string().optional(),
  attrSymbol: z.string().optional(),
  attrModelRarity: z.string().optional(),
  attrBackdropRarity: z.string().optional(),
  attrSymbolRarity: z.string().optional(),
});

export const tradesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.coerce.bigint().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        sort: z.enum(sortColumns).default("buy_date"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
        currency: z.enum(["STARS", "TON"]).optional(),
        showDeleted: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { cursor, limit, sort, sortDir, currency, showDeleted } = input;

      const conditions = [eq(trades.userId, userId)];

      if (!showDeleted) {
        conditions.push(isNull(trades.deletedAt));
      }
      if (currency) {
        conditions.push(eq(trades.tradeCurrency, currency));
      }

      // Cursor pagination: fetch items after cursor ID
      if (cursor) {
        conditions.push(
          sortDir === "desc" ? lt(trades.id, cursor) : gt(trades.id, cursor),
        );
      }

      const sortCol = trades[sort === "buy_date" ? "buyDate" : sort === "sell_date" ? "sellDate" : sort === "buy_price" ? "buyPrice" : sort === "sell_price" ? "sellPrice" : "createdAt"];

      const items = await ctx.db
        .select()
        .from(trades)
        .where(and(...conditions))
        .orderBy(sortDir === "desc" ? desc(sortCol) : asc(sortCol), desc(trades.id))
        .limit(limit + 1); // +1 to check if there are more

      const hasMore = items.length > limit;
      const data = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore && data.length > 0 ? data[data.length - 1]!.id : undefined;

      return { data, nextCursor };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.coerce.bigint() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const [trade] = await ctx.db
        .select()
        .from(trades)
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId)));

      return trade ?? null;
    }),

  add: protectedProcedure.input(tradeInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    // Parse gift URL
    const parsed = parseGiftUrl(input.giftUrl);
    if (!parsed) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid gift URL format" });
    }

    // Lock commission from user settings (or use override)
    const [settings] = await ctx.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));

    const commissionFlat =
      input.commissionFlatStars ?? settings?.defaultCommissionStars ?? 0n;
    const commissionPerm =
      input.commissionPermille ?? settings?.defaultCommissionPermille ?? 0;

    // Lock USD rate at trade time
    let buyRateUsd: string | null = null;
    if (input.tradeCurrency === "STARS") {
      buyRateUsd = getStarsUsdRate().toString();
    } else {
      const tonRate = await getTonUsdRate();
      buyRateUsd = tonRate?.toString() ?? null;
    }

    // Lock sell rate if selling immediately
    let sellRateUsd: string | null = null;
    if (input.sellPrice !== undefined && input.sellDate) {
      if (input.tradeCurrency === "STARS") {
        sellRateUsd = getStarsUsdRate().toString();
      } else {
        const tonRate = await getTonUsdRate();
        sellRateUsd = tonRate?.toString() ?? null;
      }
    }

    const [trade] = await ctx.db
      .insert(trades)
      .values({
        userId,
        giftLink: getGiftTelegramUrl(parsed.slug),
        giftSlug: parsed.slug,
        giftName: parsed.name,
        giftNumber: BigInt(parsed.number),
        tradeCurrency: input.tradeCurrency,
        buyPrice: input.buyPrice,
        sellPrice: input.sellPrice ?? null,
        buyDate: input.buyDate,
        sellDate: input.sellDate ?? null,
        commissionFlatStars: commissionFlat,
        commissionPermille: commissionPerm,
        buyRateUsd,
        sellRateUsd,
        buyMarketplace: input.buyMarketplace ?? null,
        sellMarketplace: input.sellMarketplace ?? null,
        notes: input.notes ?? null,
        attrModel: input.attrModel ?? null,
        attrBackdrop: input.attrBackdrop ?? null,
        attrSymbol: input.attrSymbol ?? null,
        attrModelRarity: input.attrModelRarity ?? null,
        attrBackdropRarity: input.attrBackdropRarity ?? null,
        attrSymbolRarity: input.attrSymbolRarity ?? null,
      })
      .returning();

    return trade!;
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.coerce.bigint(),
        sellPrice: z.coerce.bigint().min(0n).optional(),
        sellDate: z.coerce.date().optional(),
        sellMarketplace: z
          .enum(["fragment", "getgems", "tonkeeper", "p2p", "other"])
          .optional(),
        notes: z.string().max(1000).optional(),
        commissionFlatStars: z.coerce.bigint().min(0n).optional(),
        commissionPermille: z.number().int().min(0).max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Get existing trade to check ownership and get currency
      const [existing] = await ctx.db
        .select()
        .from(trades)
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId)));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      }

      const updateData: Partial<Trade> = {
        updatedAt: new Date(),
      };

      if (input.sellPrice !== undefined) {
        updateData.sellPrice = input.sellPrice;
      }
      if (input.sellDate !== undefined) {
        updateData.sellDate = input.sellDate;

        // Lock sell rate at close time
        if (existing.tradeCurrency === "STARS") {
          updateData.sellRateUsd = getStarsUsdRate().toString();
        } else {
          const tonRate = await getTonUsdRate();
          updateData.sellRateUsd = tonRate?.toString() ?? null;
        }
      }
      if (input.sellMarketplace !== undefined) {
        updateData.sellMarketplace = input.sellMarketplace;
      }
      if (input.notes !== undefined) {
        updateData.notes = input.notes;
      }
      if (input.commissionFlatStars !== undefined) {
        updateData.commissionFlatStars = input.commissionFlatStars;
      }
      if (input.commissionPermille !== undefined) {
        updateData.commissionPermille = input.commissionPermille;
      }

      const [updated] = await ctx.db
        .update(trades)
        .set(updateData)
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId)))
        .returning();

      return updated!;
    }),

  softDelete: protectedProcedure
    .input(z.object({ id: z.coerce.bigint() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const [updated] = await ctx.db
        .update(trades)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(trades.id, input.id),
            eq(trades.userId, userId),
            isNull(trades.deletedAt),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found or already deleted" });
      }

      return { success: true };
    }),

  restore: protectedProcedure
    .input(z.object({ id: z.coerce.bigint() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const [updated] = await ctx.db
        .update(trades)
        .set({
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      }

      return { success: true };
    }),

  exportCsv: protectedProcedure
    .input(
      z.object({
        currency: z.enum(["STARS", "TON"]).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const conditions = [eq(trades.userId, userId), isNull(trades.deletedAt)];

      if (input.currency) {
        conditions.push(eq(trades.tradeCurrency, input.currency));
      }

      const allTrades = await ctx.db
        .select()
        .from(trades)
        .where(and(...conditions))
        .orderBy(desc(trades.buyDate));

      return allTrades;
    }),
});
