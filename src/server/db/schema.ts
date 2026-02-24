import { sql } from "drizzle-orm";
import {
  pgTable,
  pgView,
  bigint,
  bigserial,
  text,
  smallint,
  boolean,
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

// ─── Users (Better Auth managed + custom fields) ───

export const users = pgTable("users", {
  id: text().primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text(),
  email: text(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text(),
  // Telegram-specific fields (text for Better Auth adapter compatibility)
  telegramId: text("telegram_id").unique(),
  username: text(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ─── Sessions (Better Auth managed) ───

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

// ─── Accounts (Better Auth managed) ───

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text(),
    password: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    uniqueIndex("accounts_provider_account_idx").on(table.providerId, table.accountId),
  ],
);

// ─── Verifications (Better Auth managed) ───

export const verifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);

// ─── User Settings ───

export const userSettings = pgTable("user_settings", {
  id: bigserial({ mode: "bigint" }).primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultCommissionStars: bigint("default_commission_stars", { mode: "bigint" })
    .default(0n)
    .notNull(),
  defaultCommissionPermille: smallint("default_commission_permille").default(0).notNull(),
  defaultCurrency: text("default_currency", { enum: tradeCurrencies }).default("TON").notNull(),
  timezone: text().default("UTC").notNull(),
});

// ─── Trades ───

export const trades = pgTable(
  "trades",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Gift identification
    giftLink: text("gift_link"),
    giftSlug: text("gift_slug").notNull(),
    giftName: text("gift_name").notNull(),
    giftNumber: bigint("gift_number", { mode: "bigint" }),

    // Collection / batch support
    quantity: smallint().default(1).notNull(),

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

    // Visibility & PnL flags
    isHidden: boolean("is_hidden").default(false).notNull(),
    excludeFromPnl: boolean("exclude_from_pnl").default(false).notNull(),

    // Soft delete
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    notes: text(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Prevent duplicate open positions for same numbered gift by same user
    uniqueIndex("uq_trades_user_gift_open").on(table.userId, table.giftSlug, table.giftNumber).where(
      sql`${table.sellDate} IS NULL AND ${table.deletedAt} IS NULL AND ${table.giftNumber} IS NOT NULL`,
    ),
    // Fast lookup for hidden trades filter
    index("idx_trades_hidden").on(table.userId, table.isHidden).where(
      sql`${table.deletedAt} IS NULL`,
    ),
    // Fast lookup: user's active trades sorted by date
    index("idx_trades_user_active")
      .on(table.userId, table.buyDate.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    // Gift slug lookup
    index("idx_trades_gift_slug").on(table.userId, table.giftSlug),
    check("chk_quantity_range", sql`${table.quantity} >= 1 AND ${table.quantity} <= 9999`),
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
    check(
      "chk_trade_currency",
      sql`${table.tradeCurrency} IN ('STARS', 'TON')`,
    ),
    check(
      "chk_ton_no_flat",
      sql`${table.tradeCurrency} != 'TON' OR ${table.commissionFlatStars} = 0`,
    ),
    check(
      "chk_sell_date_price_pair",
      sql`(${table.sellDate} IS NULL AND ${table.sellPrice} IS NULL) OR (${table.sellDate} IS NOT NULL AND ${table.sellPrice} IS NOT NULL)`,
    ),
  ],
);

// ─── VIEW: trade_profits ───

export const tradeProfits = pgView("trade_profits", {
  id: bigint({ mode: "bigint" }),
  userId: text("user_id"),
  giftSlug: text("gift_slug"),
  giftName: text("gift_name"),
  giftNumber: bigint("gift_number", { mode: "bigint" }),
  tradeCurrency: text("trade_currency"),
  quantity: smallint(),
  buyPrice: bigint("buy_price", { mode: "bigint" }),
  sellPrice: bigint("sell_price", { mode: "bigint" }),
  commissionFlatStars: bigint("commission_flat_stars", { mode: "bigint" }),
  commissionPermille: smallint("commission_permille"),
  isHidden: boolean("is_hidden"),
  excludeFromPnl: boolean("exclude_from_pnl"),
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
