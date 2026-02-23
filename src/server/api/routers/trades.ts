import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, isNotNull, desc, inArray, sql } from "drizzle-orm";
import { router, protectedProcedure, rateLimitedProcedure } from "../trpc";
import { trades, type Trade, userSettings } from "@/server/db/schema";
import { parseGiftUrl, getGiftTelegramUrl } from "@/lib/gift-parser";
import { getTonUsdRate, getStarsUsdRate } from "@/lib/exchange-rates";

const sortColumns = ["buy_date", "sell_date", "buy_price", "sell_price", "created_at"] as const;
const marketplaceEnum = z.enum(["fragment", "getgems", "tonkeeper", "p2p", "other"]);
const MAX_EXPORT_ROWS = 10_000;

const tradeInput = z.object({
  giftUrl: z.string().min(1).max(500).optional(),
  giftName: z.string().min(1).max(200).optional(),
  tradeCurrency: z.enum(["STARS", "TON"]),
  buyPrice: z.coerce.bigint().min(0n),
  sellPrice: z.coerce.bigint().min(0n).optional(),
  buyDate: z.coerce.date(),
  sellDate: z.coerce.date().optional(),
  quantity: z.number().int().min(1).max(9999).default(1),
  commissionFlatStars: z.coerce.bigint().min(0n).optional(),
  commissionPermille: z.number().int().min(0).max(1000).optional(),
  buyMarketplace: marketplaceEnum.optional(),
  sellMarketplace: marketplaceEnum.optional(),
  excludeFromPnl: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
  // Gift attributes (optional, from API)
  attrModel: z.string().max(100).optional(),
  attrBackdrop: z.string().max(100).optional(),
  attrSymbol: z.string().max(100).optional(),
  attrModelRarity: z.string().max(50).optional(),
  attrBackdropRarity: z.string().max(50).optional(),
  attrSymbolRarity: z.string().max(50).optional(),
}).refine(
  (data) => data.giftUrl || data.giftName,
  { message: "Either giftUrl or giftName is required" },
).refine(
  (data) => !data.sellDate || data.sellPrice !== undefined,
  { message: "sellPrice is required when sellDate is set", path: ["sellPrice"] },
).refine(
  (data) => data.sellPrice === undefined || data.sellDate,
  { message: "sellDate is required when sellPrice is set", path: ["sellDate"] },
).refine(
  (data) => !data.sellDate || !data.buyDate || data.sellDate >= data.buyDate,
  { message: "Sell date cannot be before buy date", path: ["sellDate"] },
);

export const tradesRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        cursor: z.object({
          id: z.coerce.bigint(),
          sortValue: z.string(),
        }).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        sort: z.enum(sortColumns).default("buy_date"),
        sortDir: z.enum(["asc", "desc"]).default("desc"),
        currency: z.enum(["STARS", "TON"]).optional(),
        showDeleted: z.boolean().default(false),
        showHidden: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { cursor, limit, sort, sortDir, currency, showDeleted, showHidden } = input;

      const conditions = [eq(trades.userId, userId)];

      if (!showDeleted) {
        conditions.push(isNull(trades.deletedAt));
      }
      if (!showHidden) {
        conditions.push(eq(trades.isHidden, false));
      }
      if (currency) {
        conditions.push(eq(trades.tradeCurrency, currency));
      }

      const sortColKey = sort === "buy_date" ? "buyDate" : sort === "sell_date" ? "sellDate" : sort === "buy_price" ? "buyPrice" : sort === "sell_price" ? "sellPrice" : "createdAt";
      const sortCol = trades[sortColKey];
      const isDateCol = sortColKey === "buyDate" || sortColKey === "sellDate" || sortColKey === "createdAt";
      const isNullableCol = sortColKey === "sellDate" || sortColKey === "sellPrice";

      // For nullable columns, COALESCE to push NULLs to the end (NULLS LAST behavior)
      const sortExpr = isNullableCol
        ? (isDateCol
            ? sql`COALESCE(${sortCol}, '9999-12-31T23:59:59Z'::timestamptz)`
            : sql`COALESCE(${sortCol}, ${BigInt("9223372036854775807")}::bigint)`)
        : sortCol;

      // Compound cursor: (sortExpr, id) for correct pagination on non-unique sort columns
      if (cursor) {
        const cursorSortVal = isDateCol
          ? sql`${new Date(cursor.sortValue)}::timestamptz`
          : sql`${BigInt(cursor.sortValue)}::bigint`;

        if (sortDir === "desc") {
          conditions.push(
            sql`(${sortExpr}, ${trades.id}) < (${cursorSortVal}, ${cursor.id})`,
          );
        } else {
          conditions.push(
            sql`(${sortExpr}, ${trades.id}) > (${cursorSortVal}, ${cursor.id})`,
          );
        }
      }

      const items = await ctx.db
        .select()
        .from(trades)
        .where(and(...conditions))
        .orderBy(
          sortDir === "desc" ? sql`${sortExpr} DESC` : sql`${sortExpr} ASC`,
          desc(trades.id),
        )
        .limit(limit + 1); // +1 to check if there are more

      const hasMore = items.length > limit;
      const data = hasMore ? items.slice(0, limit) : items;

      let nextCursor: { id: bigint; sortValue: string } | undefined;
      if (hasMore && data.length > 0) {
        const lastItem = data[data.length - 1]!;
        const lastSortVal = lastItem[sortColKey];
        // For NULL values, use the same sentinel as COALESCE to keep cursor consistent
        const serialized = lastSortVal == null
          ? (isDateCol ? "9999-12-31T23:59:59Z" : "9223372036854775807")
          : (lastSortVal instanceof Date ? lastSortVal.toISOString() : String(lastSortVal));
        nextCursor = { id: lastItem.id, sortValue: serialized };
      }

      return { data, nextCursor };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.coerce.bigint() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const [trade] = await ctx.db
        .select()
        .from(trades)
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId), isNull(trades.deletedAt)));

      return trade ?? null;
    }),

  add: rateLimitedProcedure.input(tradeInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    // Determine gift identification (item mode vs collection mode)
    let giftLink: string | null = null;
    let giftSlug: string;
    let giftName: string;
    let giftNumber: bigint | null = null;

    if (input.giftUrl) {
      // Item mode: parse URL
      const parsed = parseGiftUrl(input.giftUrl);
      if (!parsed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid gift URL format" });
      }
      giftLink = getGiftTelegramUrl(parsed.slug);
      giftSlug = parsed.slug;
      giftName = parsed.name;
      giftNumber = BigInt(parsed.number);
    } else if (input.giftName) {
      // Collection mode: generate synthetic slug
      giftName = input.giftName;
      giftSlug = `${giftName}-batch-${crypto.randomUUID()}`;
      giftLink = null;
      giftNumber = null;
    } else {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Either giftUrl or giftName is required" });
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
        giftLink,
        giftSlug,
        giftName,
        giftNumber,
        quantity: input.quantity,
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
        excludeFromPnl: input.excludeFromPnl,
        notes: input.notes ?? null,
        attrModel: input.attrModel ?? null,
        attrBackdrop: input.attrBackdrop ?? null,
        attrSymbol: input.attrSymbol ?? null,
        attrModelRarity: input.attrModelRarity ?? null,
        attrBackdropRarity: input.attrBackdropRarity ?? null,
        attrSymbolRarity: input.attrSymbolRarity ?? null,
      })
      .returning();

    if (!trade) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create trade" });
    }

    return trade;
  }),

  update: rateLimitedProcedure
    .input(
      z.object({
        id: z.coerce.bigint(),
        sellPrice: z.coerce.bigint().min(0n).optional(),
        sellDate: z.coerce.date().optional(),
        sellMarketplace: marketplaceEnum.optional(),
        notes: z.string().max(1000).optional(),
        commissionFlatStars: z.coerce.bigint().min(0n).optional(),
        commissionPermille: z.number().int().min(0).max(1000).optional(),
        quantity: z.number().int().min(1).max(9999).optional(),
        isHidden: z.boolean().optional(),
        excludeFromPnl: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Get existing trade to check ownership and get currency
      const [existing] = await ctx.db
        .select()
        .from(trades)
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId), isNull(trades.deletedAt)));

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      }

      // Validate sellDate/sellPrice pairing after merge with existing values
      const finalSellDate = input.sellDate !== undefined ? input.sellDate : existing.sellDate;
      const finalSellPrice = input.sellPrice !== undefined ? input.sellPrice : existing.sellPrice;
      if ((finalSellDate == null) !== (finalSellPrice == null)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "sellDate and sellPrice must both be set or both be empty",
        });
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
      if (input.quantity !== undefined) {
        updateData.quantity = input.quantity;
      }
      if (input.isHidden !== undefined) {
        updateData.isHidden = input.isHidden;
      }
      if (input.excludeFromPnl !== undefined) {
        updateData.excludeFromPnl = input.excludeFromPnl;
      }

      const [updated] = await ctx.db
        .update(trades)
        .set(updateData)
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId), isNull(trades.deletedAt)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      }

      return updated;
    }),

  softDelete: rateLimitedProcedure
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

  restore: rateLimitedProcedure
    .input(z.object({ id: z.coerce.bigint() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const [updated] = await ctx.db
        .update(trades)
        .set({
          deletedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId), isNotNull(trades.deletedAt)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found or not deleted" });
      }

      return { success: true };
    }),

  bulkUpdate: rateLimitedProcedure
    .input(
      z.object({
        ids: z.array(z.coerce.bigint()).min(1).max(500),
        sellPrice: z.coerce.bigint().min(0n).optional(),
        sellDate: z.coerce.date().optional(),
        isHidden: z.boolean().optional(),
        excludeFromPnl: z.boolean().optional(),
        commissionFlatStars: z.coerce.bigint().min(0n).optional(),
        commissionPermille: z.number().int().min(0).max(1000).optional(),
      }).refine(
        (d) => (d.sellDate !== undefined) === (d.sellPrice !== undefined),
        { message: "sellDate and sellPrice must both be provided together in bulk updates" },
      ),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const { ids, ...fields } = input;

      const updateData: Partial<Trade> = { updatedAt: new Date() };

      if (fields.sellPrice !== undefined) updateData.sellPrice = fields.sellPrice;
      if (fields.isHidden !== undefined) updateData.isHidden = fields.isHidden;
      if (fields.excludeFromPnl !== undefined) updateData.excludeFromPnl = fields.excludeFromPnl;
      if (fields.commissionFlatStars !== undefined) updateData.commissionFlatStars = fields.commissionFlatStars;
      if (fields.commissionPermille !== undefined) updateData.commissionPermille = fields.commissionPermille;

      // If setting sellDate, split by currency for correct rate locking (in transaction)
      if (fields.sellDate !== undefined) {
        updateData.sellDate = fields.sellDate;
        const starsRate = getStarsUsdRate().toString();
        const tonRate = (await getTonUsdRate())?.toString() ?? null;

        const result = await ctx.db.transaction(async (tx) => {
          const baseWhere = and(
            inArray(trades.id, ids),
            eq(trades.userId, userId),
            isNull(trades.deletedAt),
          );

          const starsUpdated = await tx
            .update(trades)
            .set({ ...updateData, sellRateUsd: starsRate })
            .where(and(baseWhere, eq(trades.tradeCurrency, "STARS")))
            .returning({ id: trades.id });

          const tonUpdated = await tx
            .update(trades)
            .set({ ...updateData, sellRateUsd: tonRate })
            .where(and(baseWhere, eq(trades.tradeCurrency, "TON")))
            .returning({ id: trades.id });

          return starsUpdated.length + tonUpdated.length;
        });

        return { count: result };
      }

      const updated = await ctx.db
        .update(trades)
        .set(updateData)
        .where(
          and(
            inArray(trades.id, ids),
            eq(trades.userId, userId),
            isNull(trades.deletedAt),
          ),
        )
        .returning({ id: trades.id });

      return { count: updated.length };
    }),

  bulkDelete: rateLimitedProcedure
    .input(z.object({ ids: z.array(z.coerce.bigint()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      const deleted = await ctx.db
        .update(trades)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            inArray(trades.id, input.ids),
            eq(trades.userId, userId),
            isNull(trades.deletedAt),
          ),
        )
        .returning({ id: trades.id });

      return { count: deleted.length };
    }),

  toggleHidden: rateLimitedProcedure
    .input(z.object({ id: z.coerce.bigint() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Atomic toggle using SQL NOT to avoid TOCTOU race
      const [updated] = await ctx.db
        .update(trades)
        .set({
          isHidden: sql`NOT ${trades.isHidden}`,
          updatedAt: new Date(),
        })
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId), isNull(trades.deletedAt)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      }

      return updated;
    }),

  toggleExclude: rateLimitedProcedure
    .input(z.object({ id: z.coerce.bigint() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Atomic toggle using SQL NOT to avoid TOCTOU race
      const [updated] = await ctx.db
        .update(trades)
        .set({
          excludeFromPnl: sql`NOT ${trades.excludeFromPnl}`,
          updatedAt: new Date(),
        })
        .where(and(eq(trades.id, input.id), eq(trades.userId, userId), isNull(trades.deletedAt)))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trade not found" });
      }

      return updated;
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
        .orderBy(desc(trades.buyDate))
        .limit(MAX_EXPORT_ROWS);

      return allTrades;
    }),
});
