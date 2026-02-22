-- Custom migration: CREATE VIEW trade_profits
-- This VIEW is declared as .existing() in schema.ts — drizzle-kit does NOT manage it.
-- Run this AFTER the initial schema migration.

CREATE OR REPLACE VIEW trade_profits AS
SELECT
  t.id,
  t.user_id,
  t.gift_slug,
  t.gift_name,
  t.gift_number,
  t.trade_currency,
  t.buy_price,
  t.sell_price,
  t.commission_flat_stars,
  t.commission_permille,
  t.buy_rate_usd,
  t.sell_rate_usd,
  t.buy_date,
  t.sell_date,
  t.deleted_at,

  -- Net profit in Stars (only for STARS trades with sell_price)
  CASE
    WHEN t.trade_currency = 'STARS' AND t.sell_price IS NOT NULL THEN
      t.sell_price - t.buy_price
        - t.commission_flat_stars
        - ROUND(t.sell_price * t.commission_permille / 1000.0)
    ELSE NULL
  END AS net_profit_stars,

  -- Net profit in NanoTon (only for TON trades with sell_price)
  -- No flat fee for TON (flat is in Stars, different currency)
  CASE
    WHEN t.trade_currency = 'TON' AND t.sell_price IS NOT NULL THEN
      t.sell_price - t.buy_price
        - ROUND(t.sell_price * t.commission_permille / 1000.0)
    ELSE NULL
  END AS net_profit_nanoton,

  -- Buy value in USD
  CASE
    WHEN t.buy_rate_usd IS NOT NULL THEN
      CASE
        WHEN t.trade_currency = 'STARS' THEN t.buy_price * t.buy_rate_usd
        WHEN t.trade_currency = 'TON' THEN (t.buy_price / 1000000000.0) * t.buy_rate_usd
      END
    ELSE NULL
  END AS buy_value_usd,

  -- Sell value in USD
  CASE
    WHEN t.sell_price IS NOT NULL AND t.sell_rate_usd IS NOT NULL THEN
      CASE
        WHEN t.trade_currency = 'STARS' THEN t.sell_price * t.sell_rate_usd
        WHEN t.trade_currency = 'TON' THEN (t.sell_price / 1000000000.0) * t.sell_rate_usd
      END
    ELSE NULL
  END AS sell_value_usd,

  -- Net profit in USD (using historical rates)
  CASE
    WHEN t.sell_price IS NOT NULL AND t.buy_rate_usd IS NOT NULL AND t.sell_rate_usd IS NOT NULL THEN
      CASE
        WHEN t.trade_currency = 'STARS' THEN
          (t.sell_price * t.sell_rate_usd)
          - (t.buy_price * t.buy_rate_usd)
          - (t.commission_flat_stars * t.sell_rate_usd)
          - ROUND(t.sell_price * t.commission_permille / 1000.0) * t.sell_rate_usd
        WHEN t.trade_currency = 'TON' THEN
          ((t.sell_price / 1000000000.0) * t.sell_rate_usd)
          - ((t.buy_price / 1000000000.0) * t.buy_rate_usd)
          - (ROUND(t.sell_price * t.commission_permille / 1000.0) / 1000000000.0) * t.sell_rate_usd
      END
    ELSE NULL
  END AS net_profit_usd

FROM trades t
WHERE t.deleted_at IS NULL;
