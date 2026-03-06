-- Migration: Add transferred_count column for collection commission
-- Commission = flat × COALESCE(transferred_count, quantity) + permille × sell_price × quantity

-- 1. Add column (nullable, null = same as quantity)
ALTER TABLE trades
  ADD COLUMN transferred_count smallint;

-- 2. Constraints
ALTER TABLE trades
  ADD CONSTRAINT chk_transferred_count_range
    CHECK (transferred_count IS NULL OR (transferred_count >= 1 AND transferred_count <= 9999)),
  ADD CONSTRAINT chk_transferred_lte_quantity
    CHECK (transferred_count IS NULL OR transferred_count <= quantity);

-- 3. Recreate VIEW with transferred_count in commission formula
CREATE OR REPLACE VIEW trade_profits AS
SELECT
  t.id,
  t.user_id,
  t.gift_slug,
  t.gift_name,
  t.gift_number,
  t.trade_currency,
  t.quantity,
  t.buy_price,
  t.sell_price,
  t.commission_flat_stars,
  t.commission_permille,
  t.is_hidden,
  t.exclude_from_pnl,
  t.buy_rate_usd,
  t.sell_rate_usd,
  t.buy_date,
  t.sell_date,
  t.deleted_at,

  -- Net profit in Stars (only for STARS trades with sell_price), multiplied by quantity
  -- Commission: flat × COALESCE(transferred_count, quantity) + ROUND(sell × permille/1000) × quantity
  CASE
    WHEN t.trade_currency = 'STARS' AND t.sell_price IS NOT NULL THEN
      (t.sell_price - t.buy_price) * t.quantity
        - t.commission_flat_stars * COALESCE(t.transferred_count, t.quantity)
        - FLOOR(t.sell_price * t.commission_permille / 1000.0 + 0.5) * t.quantity
    ELSE NULL
  END AS net_profit_stars,

  -- Net profit in NanoTon (only for TON trades with sell_price), multiplied by quantity
  -- No flat fee for TON (flat is in Stars, different currency)
  CASE
    WHEN t.trade_currency = 'TON' AND t.sell_price IS NOT NULL THEN
      (t.sell_price - t.buy_price) * t.quantity
        - FLOOR(t.sell_price * t.commission_permille / 1000.0 + 0.5) * t.quantity
    ELSE NULL
  END AS net_profit_nanoton,

  -- Buy value in USD (per-unit * quantity)
  CASE
    WHEN t.buy_rate_usd IS NOT NULL THEN
      CASE
        WHEN t.trade_currency = 'STARS' THEN t.buy_price * t.buy_rate_usd * t.quantity
        WHEN t.trade_currency = 'TON' THEN (t.buy_price / 1000000000.0) * t.buy_rate_usd * t.quantity
      END
    ELSE NULL
  END AS buy_value_usd,

  -- Sell value in USD (per-unit * quantity)
  CASE
    WHEN t.sell_price IS NOT NULL AND t.sell_rate_usd IS NOT NULL THEN
      CASE
        WHEN t.trade_currency = 'STARS' THEN t.sell_price * t.sell_rate_usd * t.quantity
        WHEN t.trade_currency = 'TON' THEN (t.sell_price / 1000000000.0) * t.sell_rate_usd * t.quantity
      END
    ELSE NULL
  END AS sell_value_usd,

  -- Net profit in USD (using historical rates)
  -- sell_value_usd - buy_value_usd - commission_usd (commission at sell_rate)
  CASE
    WHEN t.sell_price IS NOT NULL AND t.buy_rate_usd IS NOT NULL AND t.sell_rate_usd IS NOT NULL THEN
      CASE
        WHEN t.trade_currency = 'STARS' THEN
          (t.sell_price * t.sell_rate_usd * t.quantity)
          - (t.buy_price * t.buy_rate_usd * t.quantity)
          - (t.commission_flat_stars * COALESCE(t.transferred_count, t.quantity) * t.sell_rate_usd)
          - (FLOOR(t.sell_price * t.commission_permille / 1000.0 + 0.5) * t.quantity * t.sell_rate_usd)
        WHEN t.trade_currency = 'TON' THEN
          ((t.sell_price / 1000000000.0) * t.sell_rate_usd * t.quantity)
          - ((t.buy_price / 1000000000.0) * t.buy_rate_usd * t.quantity)
          - ((FLOOR(t.sell_price * t.commission_permille / 1000.0 + 0.5) / 1000000000.0) * t.quantity * t.sell_rate_usd)
      END
    ELSE NULL
  END AS net_profit_usd

FROM trades t
WHERE t.deleted_at IS NULL;
