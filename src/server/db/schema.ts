import { sql } from "drizzle-orm";
import {
  pgTable,
  pgView,
  bigint,
  bigserial,
  text,
  smallint,
  date,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

// ─── Enums (text with TypeScript inference) ───

const tradeCurrencies = ["STARS", "TON"] as const;
export type TradeCurrency = (typeof tradeCurrencies)[number];

const marketplaces = ["fragment", "getgems", "tonkeeper", "p2p", "other"] as const;
export type Marketplace = (typeof marketplaces)[number];

// ─── Users ───

export const users = pgTable("users", {
  id: bigserial({ mode: "bigint" }).primaryKey(),
  telegramId: bigint("telegram_id", { mode: "bigint" }).notNull().unique(),
  username: text(),
  firstName: text("first_name"),
  photoUrl: text("photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── User Settings ───

export const userSettings = pgTable("user_settings", {
  id: bigserial({ mode: "bigint" }).primaryKey(),
  userId: bigint("user_id", { mode: "bigint" })
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultCommissionStars: bigint("default_commission_stars", { mode: "bigint" })
    .default(0n)
    .notNull(),
  defaultCommissionPermille: smallint("default_commission_permille").default(0).notNull(),
  defaultCurrency: text("default_currency", { enum: tradeCurrencies }).default("STARS").notNull(),
  timezone: text().default("UTC").notNull(),
});

// ─── Trades ───

export const trades = pgTable(
  "trades",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    userId: bigint("user_id", { mode: "bigint" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Gift identification
    giftLink: text("gift_link").notNull(),
    giftSlug: text("gift_slug").notNull(),
    giftName: text("gift_name").notNull(),
    giftNumber: bigint("gift_number", { mode: "bigint" }).notNull(),

    // Gift attributes (nullable — populated from API)
    attrModel: text("attr_model"),
    attrBackdrop: text("attr_backdrop"),
    attrSymbol: text("attr_symbol"),
    attrModelRarity: text("attr_model_rarity"),
    attrBackdropRarity: text("attr_backdrop_rarity"),
    attrSymbolRarity: text("attr_symbol_rarity"),

    // Currency
    tradeCurrency: text("trade_currency", { enum: tradeCurrencies }).notNull(),

    // Prices — BIGINT: Stars as whole numbers, TON as nanotons
    buyPrice: bigint("buy_price", { mode: "bigint" }).notNull(),
    sellPrice: bigint("sell_price", { mode: "bigint" }),

    // Dates
    buyDate: date("buy_date", { mode: "date" }).notNull(),
    sellDate: date("sell_date", { mode: "date" }),

    // Commission (locked at trade creation — NOT joined from user_settings)
    commissionFlatStars: bigint("commission_flat_stars", { mode: "bigint" }).default(0n).notNull(),
    commissionPermille: smallint("commission_permille").default(0).notNull(),

    // USD rates (locked at trade time, null if fetch failed)
    buyRateUsd: numeric("buy_rate_usd", { precision: 12, scale: 8 }),
    sellRateUsd: numeric("sell_rate_usd", { precision: 12, scale: 8 }),

    // Marketplaces (separate buy/sell)
    buyMarketplace: text("buy_marketplace", { enum: marketplaces }),
    sellMarketplace: text("sell_marketplace", { enum: marketplaces }),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    notes: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Prevent duplicate open positions for same gift by same user
    uniqueIndex("uq_trades_user_gift_open").on(table.userId, table.giftSlug).where(
      sql`${table.sellDate} IS NULL AND ${table.deletedAt} IS NULL`,
    ),
    // Fast lookup: user's active trades sorted by date
    index("idx_trades_user_active")
      .on(table.userId, table.buyDate.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    // Gift slug lookup
    index("idx_trades_gift_slug").on(table.userId, table.giftSlug),
    // Currency check: Stars trades must have Stars-range prices (positive)
    check("chk_buy_price_positive", sql`${table.buyPrice} >= 0`),
    check(
      "chk_sell_price_positive",
      sql`${table.sellPrice} IS NULL OR ${table.sellPrice} >= 0`,
    ),
    check(
      "chk_commission_flat_nonneg",
      sql`${table.commissionFlatStars} >= 0`,
    ),
    check(
      "chk_commission_permille_range",
      sql`${table.commissionPermille} >= 0 AND ${table.commissionPermille} <= 1000`,
    ),
  ],
);

// ─── VIEW: trade_profits ───
// Managed via custom migration (CREATE OR REPLACE VIEW), NOT by drizzle-kit
// .existing() tells drizzle-kit to skip this in migrations

export const tradeProfits = pgView("trade_profits", {
  id: bigint({ mode: "bigint" }),
  userId: bigint("user_id", { mode: "bigint" }),
  giftSlug: text("gift_slug"),
  giftName: text("gift_name"),
  giftNumber: bigint("gift_number", { mode: "bigint" }),
  tradeCurrency: text("trade_currency"),
  buyPrice: bigint("buy_price", { mode: "bigint" }),
  sellPrice: bigint("sell_price", { mode: "bigint" }),
  commissionFlatStars: bigint("commission_flat_stars", { mode: "bigint" }),
  commissionPermille: smallint("commission_permille"),
  netProfitStars: bigint("net_profit_stars", { mode: "bigint" }),
  netProfitNanoton: bigint("net_profit_nanoton", { mode: "bigint" }),
  netProfitUsd: numeric("net_profit_usd", { precision: 18, scale: 8 }),
  buyValueUsd: numeric("buy_value_usd", { precision: 18, scale: 8 }),
  sellValueUsd: numeric("sell_value_usd", { precision: 18, scale: 8 }),
  buyRateUsd: numeric("buy_rate_usd", { precision: 12, scale: 8 }),
  sellRateUsd: numeric("sell_rate_usd", { precision: 12, scale: 8 }),
  buyDate: date("buy_date", { mode: "date" }),
  sellDate: date("sell_date", { mode: "date" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}).existing();

// ─── Type Exports ───

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserSetting = typeof userSettings.$inferSelect;
export type NewUserSetting = typeof userSettings.$inferInsert;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type TradeProfit = typeof tradeProfits.$inferSelect;
