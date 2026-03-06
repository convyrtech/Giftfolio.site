import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull, isNotNull, desc, inArray, sql } from "drizzle-orm";
import { router, protectedProcedure, rateLimitedProcedure } from "../trpc";
import { trades, type Trade, userSettings } from "@/server/db/schema";
import { parseGiftUrl, getGiftTelegramUrl, buildGiftPascalSlug, giftNameToPascalCase } from "@/lib/gift-parser";
import { getTonUsdRate, getStarsUsdRate } from "@/lib/exchange-rates";
import { importRowSchema } from "@/lib/csv-import-schema";
import { importRateLimit } from "@/lib/rate-limit";
import { importTradesFromWallet } from "@/lib/ton-import";

const sortColumns = ["buy_date", "sell_date", "buy_price", "sell_price", "created_at"] as const;
const marketplaceEnum = z.enum(["fragment", "getgems", "tonkeeper", "p2p", "other"]);
const MAX_EXPORT_ROWS = 10_000;
const MAX_IMPORT_ROWS = 500;
const IMPORT_BATCH_SIZE = 100;

const tradeInput = z.object({
  giftUrl: z.string().min(1).max(500).optional(),
  giftName: z.string().min(1).max(200).optional(),
  tradeCurrency: z.enum(["STARS", "TON"]),
  buyPrice: z.coerce.bigint().min(0n),
  sellPrice: z.coerce.bigint().min(0n).optional(),
  buyDate: z.coerce.date(),
  sellDate: z.coerce.date().optional(),
  quantity: z.number().int().min(1).max(9999).default(1),
  transferredCount: z.number().int().min(1).max(9999).optional(),
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
).refine(
  (data) => !data.transferredCount || data.transferredCount <= data.quantity,
  { message: "Transferred count cannot exceed quantity", path: ["transferredCount"] },
);

type SellMatchRow = {
  eventId: string;
  giftName: string;
  giftNumber: number;
  priceNanoton: string;
  timestamp: number;
  matchedTradeId: string | null;
  matchedBuyDate: string | null;
};

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

    // Lock USD rate at trade time (external calls outside transaction)
    const tonRate = input.tradeCurrency === "TON" ? await getTonUsdRate() : null;
    const rateStr = input.tradeCurrency === "STARS"
      ? getStarsUsdRate().toString()
      : tonRate?.toString() ?? null;

    const buyRateUsd = rateStr;
    const sellRateUsd = (input.sellPrice !== undefined && input.sellDate) ? rateStr : null;

    // Transaction: read settings + insert trade atomically
    const trade = await ctx.db.transaction(async (tx) => {
      const [settings] = await tx
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId));

      const commissionFlat =
        input.commissionFlatStars ?? settings?.defaultCommissionStars ?? 0n;
      const commissionPerm =
        input.commissionPermille ?? settings?.defaultCommissionPermille ?? 0;

      const [created] = await tx
        .insert(trades)
        .values({
          userId,
          giftLink,
          giftSlug,
          giftName,
          giftNumber,
          quantity: input.quantity,
          transferredCount: input.transferredCount ?? null,
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

      if (!created) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create trade" });
      }

      return created;
    });

    return trade;
  }),

  update: rateLimitedProcedure
    .input(
      z.object({
        id: z.coerce.bigint(),
        buyPrice: z.coerce.bigint().min(0n).optional(),
        buyDate: z.coerce.date().optional(),
        sellPrice: z.coerce.bigint().min(0n).optional(),
        sellDate: z.coerce.date().optional(),
        buyMarketplace: marketplaceEnum.nullable().optional(),
        sellMarketplace: marketplaceEnum.nullable().optional(),
        notes: z.string().max(1000).optional(),
        commissionFlatStars: z.coerce.bigint().min(0n).optional(),
        commissionPermille: z.number().int().min(0).max(1000).optional(),
        quantity: z.number().int().min(1).max(9999).optional(),
        transferredCount: z.number().int().min(1).max(9999).nullable().optional(),
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

      // Validate buyDate does not exceed sellDate
      const finalBuyDate = input.buyDate !== undefined ? input.buyDate : existing.buyDate;
      if (finalSellDate && finalBuyDate > finalSellDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Buy date cannot be after sell date",
        });
      }

      // Validate transferredCount does not exceed quantity after merge
      const finalQuantity = input.quantity ?? existing.quantity;
      const finalTransferred = input.transferredCount !== undefined
        ? input.transferredCount
        : existing.transferredCount;
      if (finalTransferred !== null && finalTransferred > finalQuantity) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Transferred count cannot exceed quantity",
        });
      }

      const updateData: Partial<Trade> = {
        updatedAt: new Date(),
      };

      // Pre-fetch TON rate once if any date field changes — avoids duplicate network calls
      const needsTonRate =
        existing.tradeCurrency === "TON" &&
        (input.buyDate !== undefined || input.sellDate !== undefined);
      const tonRateForUpdate = needsTonRate ? await getTonUsdRate() : null;

      if (input.buyPrice !== undefined) {
        updateData.buyPrice = input.buyPrice;
      }
      if (input.buyDate !== undefined) {
        updateData.buyDate = input.buyDate;

        // Re-lock buy rate to the corrected date (mirrors sellDate rate-locking pattern)
        if (existing.tradeCurrency === "STARS") {
          updateData.buyRateUsd = getStarsUsdRate().toString();
        } else {
          updateData.buyRateUsd = tonRateForUpdate?.toString() ?? null;
        }
      }
      if (input.sellPrice !== undefined) {
        updateData.sellPrice = input.sellPrice;
      }
      if (input.sellDate !== undefined) {
        updateData.sellDate = input.sellDate;

        // Lock sell rate at close time
        if (existing.tradeCurrency === "STARS") {
          updateData.sellRateUsd = getStarsUsdRate().toString();
        } else {
          updateData.sellRateUsd = tonRateForUpdate?.toString() ?? null;
        }
      }
      if (input.buyMarketplace !== undefined) {
        updateData.buyMarketplace = input.buyMarketplace;
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
      if (input.transferredCount !== undefined) {
        updateData.transferredCount = input.transferredCount;
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
        buyPrice: z.coerce.bigint().min(0n).optional(),
        buyDate: z.coerce.date().optional(),
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

      // Note: buyDate <= sellDate not validated per-trade in bulk ops (would require SELECT per row).
      // Note: If bulk quantity change is ever added, must also null transferredCount to avoid
      //   chk_transferred_lte_quantity constraint violation. Individual update handles this.
      // Bulk is best-effort — user should verify.
      if (fields.buyPrice !== undefined) updateData.buyPrice = fields.buyPrice;
      if (fields.sellPrice !== undefined) updateData.sellPrice = fields.sellPrice;
      if (fields.isHidden !== undefined) updateData.isHidden = fields.isHidden;
      if (fields.excludeFromPnl !== undefined) updateData.excludeFromPnl = fields.excludeFromPnl;
      if (fields.commissionFlatStars !== undefined) updateData.commissionFlatStars = fields.commissionFlatStars;
      if (fields.commissionPermille !== undefined) updateData.commissionPermille = fields.commissionPermille;

      // If setting dates, split by currency for correct rate locking (in transaction)
      const needsRateLocking = fields.sellDate !== undefined || fields.buyDate !== undefined;
      if (needsRateLocking) {
        if (fields.sellDate !== undefined) updateData.sellDate = fields.sellDate;
        if (fields.buyDate !== undefined) updateData.buyDate = fields.buyDate;
        const starsRate = getStarsUsdRate().toString();
        const tonRate = (await getTonUsdRate())?.toString() ?? null;

        const result = await ctx.db.transaction(async (tx) => {
          const baseWhere = and(
            inArray(trades.id, ids),
            eq(trades.userId, userId),
            isNull(trades.deletedAt),
          );

          const starsUpdateData = { ...updateData };
          const tonUpdateData = { ...updateData };
          if (fields.sellDate !== undefined) {
            starsUpdateData.sellRateUsd = starsRate;
            tonUpdateData.sellRateUsd = tonRate;
          }
          if (fields.buyDate !== undefined) {
            starsUpdateData.buyRateUsd = starsRate;
            tonUpdateData.buyRateUsd = tonRate;
          }

          const starsUpdated = await tx
            .update(trades)
            .set(starsUpdateData)
            .where(and(baseWhere, eq(trades.tradeCurrency, "STARS")))
            .returning({ id: trades.id });

          const tonUpdated = await tx
            .update(trades)
            .set(tonUpdateData)
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

  bulkImport: protectedProcedure
    .input(
      z.object({
        rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_ROWS),
        skipErrors: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Rate limit: 5 imports/hour
      const rl = await importRateLimit.limit(userId);
      if (!rl.success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Import rate limit exceeded. Try again later.",
        });
      }

      // Fetch user settings for commission defaults
      const [settings] = await ctx.db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId));

      const defaultFlat = settings?.defaultCommissionStars ?? 0n;
      const defaultPerm = settings?.defaultCommissionPermille ?? 0;

      // Pre-fetch exchange rates
      const hasTon = input.rows.some((r) => r.tradeCurrency === "TON");
      const hasStars = input.rows.some((r) => r.tradeCurrency === "STARS");
      const tonRate = hasTon ? await getTonUsdRate() : null;
      const starsRate = hasStars ? getStarsUsdRate() : null;

      /** Build insert value from a validated row */
      function buildInsertValue(row: (typeof input.rows)[number]): typeof trades.$inferInsert {
        let giftLink: string | null = null;
        let giftSlug: string;
        let giftNumber: bigint | null = null;

        if (row.giftNumber) {
          const num = parseInt(row.giftNumber, 10);
          giftSlug = buildGiftPascalSlug(row.giftName, num);
          giftLink = getGiftTelegramUrl(giftSlug);
          giftNumber = BigInt(num);
        } else {
          giftSlug = `${giftNameToPascalCase(row.giftName)}-batch-${crypto.randomUUID()}`;
        }

        const rateStr = row.tradeCurrency === "TON"
          ? tonRate?.toString() ?? null
          : starsRate?.toString() ?? null;

        return {
          userId,
          giftLink,
          giftSlug,
          giftName: row.giftName,
          giftNumber,
          quantity: row.quantity,
          tradeCurrency: row.tradeCurrency,
          buyPrice: row.buyPrice,
          sellPrice: row.sellPrice,
          buyDate: row.buyDate,
          sellDate: row.sellDate,
          // TON trades cannot have flat Stars commission (DB constraint)
          commissionFlatStars: row.tradeCurrency === "TON" ? 0n : defaultFlat,
          commissionPermille: defaultPerm,
          buyRateUsd: rateStr,
          sellRateUsd: row.sellPrice !== null ? rateStr : null,
          buyMarketplace: row.buyMarketplace,
          sellMarketplace: row.sellMarketplace,
          excludeFromPnl: false,
          notes: null,
        };
      }

      /** Sanitize DB error messages to avoid leaking schema internals */
      function sanitizeError(err: unknown): string {
        const msg = err instanceof Error ? err.message : "Insert failed";
        if (msg.includes("uq_trades_user_gift_open")) return "Duplicate open position for this gift";
        if (msg.includes("chk_")) return "Data validation constraint failed";
        return "Row could not be inserted";
      }

      const errors: Array<{ row: number; message: string }> = [];
      let inserted = 0;

      if (input.skipErrors) {
        // Insert row-by-row without a transaction — each row is independent
        for (let i = 0; i < input.rows.length; i++) {
          try {
            await ctx.db.insert(trades).values(buildInsertValue(input.rows[i]!));
            inserted++;
          } catch (e) {
            errors.push({ row: i + 1, message: sanitizeError(e) });
          }
        }
      } else {
        // All-or-nothing: batch insert inside a transaction
        await ctx.db.transaction(async (tx) => {
          for (let batchStart = 0; batchStart < input.rows.length; batchStart += IMPORT_BATCH_SIZE) {
            const batch = input.rows.slice(batchStart, batchStart + IMPORT_BATCH_SIZE);
            const values = batch.map((row) => buildInsertValue(row));
            await tx.insert(trades).values(values);
            inserted += values.length;
          }
        });
      }

      return { inserted, skipped: errors.length, errors };
    }),

  walletImportPreview: rateLimitedProcedure
    .input(
      z.object({
        // Override wallet address, or omit to use saved address from user settings
        walletAddress: z
          .string()
          .trim()
          .max(100)
          .regex(/^[a-zA-Z0-9_\-:]+$/, "Invalid TON wallet address format")
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Rate limit: shared with CSV import (5/hour)
      const rl = await importRateLimit.limit(userId);
      if (!rl.success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Import rate limit exceeded. Try again later.",
        });
      }

      // Resolve wallet address: input > saved settings
      let walletAddress = input.walletAddress;
      if (!walletAddress) {
        const [settings] = await ctx.db
          .select()
          .from(userSettings)
          .where(eq(userSettings.userId, userId));
        walletAddress = settings?.tonWalletAddress ?? undefined;
      }

      if (!walletAddress) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No TON wallet address configured. Set one in Settings or provide it directly.",
        });
      }

      const result = await importTradesFromWallet(walletAddress);

      if (result.error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error,
        });
      }

      // Sell-side: find open positions matching each detected sell event
      const sellTrades = result.trades.filter((t) => t.side === "sell");

      const sellMatches: SellMatchRow[] = [];

      if (sellTrades.length > 0) {
        // Batch: one query for all sell gifts, match in memory (avoids N+1)
        const sellSlugs = sellTrades.map((s) =>
          buildGiftPascalSlug(s.giftName, s.giftNumber),
        );

        let openPositions: Array<{
          id: bigint;
          buyDate: Date;
          giftSlug: string;
          giftNumber: bigint | null;
        }> = [];
        try {
          openPositions = await ctx.db
            .select({
              id: trades.id,
              buyDate: trades.buyDate,
              giftSlug: trades.giftSlug,
              giftNumber: trades.giftNumber,
            })
            .from(trades)
            .where(
              and(
                eq(trades.userId, userId),
                inArray(trades.giftSlug, sellSlugs),
                isNull(trades.sellDate),
                isNull(trades.deletedAt),
              ),
            )
            .orderBy(trades.buyDate); // FIFO: ascending buyDate
        } catch {
          // If DB lookup fails, return all sells as unmatched — preview still shows buys
          openPositions = [];
        }

        // Match each sell to the oldest unused open position (FIFO)
        const usedTradeIds = new Set<string>();

        for (const sell of sellTrades) {
          const slug = buildGiftPascalSlug(sell.giftName, sell.giftNumber);
          const giftNum = BigInt(sell.giftNumber);

          // Find oldest unused open position for this slug+number
          const match = openPositions.find(
            (p) =>
              p.giftSlug === slug &&
              p.giftNumber === giftNum &&
              !usedTradeIds.has(p.id.toString()),
          );

          if (match) {
            usedTradeIds.add(match.id.toString());
          }

          sellMatches.push({
            eventId: sell.eventId,
            giftName: sell.giftName,
            giftNumber: sell.giftNumber,
            priceNanoton: sell.priceNanoton.toString(),
            timestamp: sell.timestamp,
            matchedTradeId: match?.id.toString() ?? null,
            matchedBuyDate: match?.buyDate?.toISOString() ?? null,
          });
        }
      }

      // Serialize bigint prices as strings for JSON transport
      return {
        trades: result.trades
          .filter((t) => t.side === "buy")
          .map((t) => ({
            giftName: t.giftName,
            giftNumber: t.giftNumber,
            side: t.side,
            priceNanoton: t.priceNanoton.toString(),
            timestamp: t.timestamp,
            eventId: t.eventId,
          })),
        sellMatches,
        eventsFetched: result.eventsFetched,
        rateLimited: result.rateLimited,
      };
    }),

  walletImportConfirm: rateLimitedProcedure
    .input(
      z.object({
        trades: z
          .array(
            z.object({
              giftName: z.string().min(1).max(200),
              giftNumber: z.number().int().positive(),
              // giftSlug is NOT accepted from client — re-derived server-side for security
              priceNanoton: z.string().regex(/^\d+$/, "Must be a non-negative integer string"),
              timestamp: z.number().int().positive(),
              // Stripped to alphanumeric + safe chars to prevent stored XSS in notes
              eventId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9\-_]+$/, "Invalid event ID"),
            }),
          )
          .min(1)
          .max(MAX_IMPORT_ROWS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Rate limit: shared with CSV import (5/hour)
      const rl = await importRateLimit.limit(userId);
      if (!rl.success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Import rate limit exceeded. Try again later.",
        });
      }

      // Fetch user settings for commission defaults
      const [settings] = await ctx.db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId));

      const defaultPerm = settings?.defaultCommissionPermille ?? 0;

      // Lock TON rate once for all inserts
      const tonRate = await getTonUsdRate();
      const tonRateStr = tonRate?.toString() ?? null;

      const values = input.trades.map((t) => {
        // Re-derive giftSlug server-side in canonical PascalCase format — never trust client
        const giftSlug = buildGiftPascalSlug(t.giftName, t.giftNumber);
        const giftLink = getGiftTelegramUrl(giftSlug);
        const buyDate = new Date(t.timestamp * 1000);

        return {
          userId,
          giftLink,
          giftSlug,
          giftName: t.giftName,
          giftNumber: BigInt(t.giftNumber),
          quantity: 1,
          tradeCurrency: "TON" as const,
          buyPrice: BigInt(t.priceNanoton),
          sellPrice: null,
          buyDate,
          sellDate: null,
          commissionFlatStars: 0n, // TON trades: no flat Stars commission
          commissionPermille: defaultPerm,
          buyRateUsd: tonRateStr,
          sellRateUsd: null,
          buyMarketplace: null, // can't reliably determine marketplace from event data
          sellMarketplace: null,
          excludeFromPnl: false,
          notes: `Imported from wallet (event: ${t.eventId})`,
        };
      });

      const errors: Array<{ row: number; message: string }> = [];
      let inserted = 0;

      // Insert row-by-row to skip duplicates gracefully
      for (let i = 0; i < values.length; i++) {
        try {
          await ctx.db.insert(trades).values(values[i]!);
          inserted++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          if (msg.includes("uq_trades_user_gift_open")) {
            errors.push({ row: i + 1, message: "Already have an open position for this gift" });
          } else {
            errors.push({ row: i + 1, message: "Could not insert trade" });
          }
        }
      }

      return { inserted, skipped: errors.length, errors };
    }),

  walletSellConfirm: rateLimitedProcedure
    .input(
      z.object({
        sells: z
          .array(
            z.object({
              tradeId: z.coerce.bigint().positive(),
              priceNanoton: z.string().regex(/^\d+$/, "Must be a non-negative integer string"),
              timestamp: z.number().int().positive(),
              eventId: z.string().min(1).max(200).regex(/^[a-zA-Z0-9\-_]+$/, "Invalid event ID"),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Rate limit: shared with CSV/wallet import (5/hour)
      const rl = await importRateLimit.limit(userId);
      if (!rl.success) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Import rate limit exceeded. Try again later.",
        });
      }

      const tonRate = await getTonUsdRate();
      const tonRateStr = tonRate?.toString() ?? null;

      let closed = 0;
      const errors: Array<{ eventId: string; message: string }> = [];

      for (const sell of input.sells) {
        // Security: verify ownership before any update
        const [trade] = await ctx.db
          .select({ id: trades.id, sellDate: trades.sellDate })
          .from(trades)
          .where(and(eq(trades.id, sell.tradeId), eq(trades.userId, userId), isNull(trades.deletedAt)))
          .limit(1);

        if (!trade) {
          errors.push({ eventId: sell.eventId, message: "Trade not found" });
          continue;
        }
        if (trade.sellDate !== null) {
          errors.push({ eventId: sell.eventId, message: "Position already closed" });
          continue;
        }

        const noteAppend = `Sell imported from wallet (event: ${sell.eventId})`;
        try {
          await ctx.db
            .update(trades)
            .set({
              sellPrice: BigInt(sell.priceNanoton),
              sellDate: new Date(sell.timestamp * 1000),
              sellRateUsd: tonRateStr,
              updatedAt: new Date(),
              notes: sql`COALESCE(${trades.notes} || E'\n', '') || ${noteAppend}`,
            })
            .where(and(eq(trades.id, sell.tradeId), eq(trades.userId, userId), isNull(trades.deletedAt)));
          closed++;
        } catch {
          errors.push({ eventId: sell.eventId, message: "Failed to close position" });
        }
      }

      return { closed, skipped: errors.length, errors };
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
