-- Migration: Phase 7A audit fixes
-- 1. Fix unique index to include gift_number (C-4)
-- 2. Add CHECK constraints (C-5, sellDate/sellPrice pairing)
-- 3. Fix rounding in VIEW (C-1)

-- 1. Recreate unique index with gift_number
DROP INDEX IF EXISTS uq_trades_user_gift_open;
CREATE UNIQUE INDEX IF NOT EXISTS uq_trades_user_gift_open
  ON trades (user_id, gift_slug, gift_number)
  WHERE sell_date IS NULL AND deleted_at IS NULL AND gift_number IS NOT NULL;

-- 2. Add CHECK constraints (skip if already exist)
DO $$ BEGIN
  ALTER TABLE trades ADD CONSTRAINT chk_trade_currency
    CHECK (trade_currency IN ('STARS', 'TON'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE trades ADD CONSTRAINT chk_ton_no_flat
    CHECK (trade_currency != 'TON' OR commission_flat_stars = 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE trades ADD CONSTRAINT chk_sell_date_price_pair
    CHECK (
      (sell_date IS NULL AND sell_price IS NULL)
      OR (sell_date IS NOT NULL AND sell_price IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Recreate VIEW with FLOOR(x + 0.5) instead of ROUND() for half-up rounding consistency
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
  CASE
    WHEN t.trade_currency = 'STARS' AND t.sell_price IS NOT NULL THEN
      (t.sell_price - t.buy_price
        - t.commission_flat_stars
        - FLOOR(t.sell_price * t.commission_permille / 1000.0 + 0.5)
      ) * t.quantity
    ELSE NULL
  END AS net_profit_stars,

  -- Net profit in NanoTon (only for TON trades with sell_price), multiplied by quantity
  CASE
    WHEN t.trade_currency = 'TON' AND t.sell_price IS NOT NULL THEN
      (t.sell_price - t.buy_price
        - FLOOR(t.sell_price * t.commission_permille / 1000.0 + 0.5)
      ) * t.quantity
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

  -- Net profit in USD (using historical rates), multiplied by quantity
  CASE
    WHEN t.sell_price IS NOT NULL AND t.buy_rate_usd IS NOT NULL AND t.sell_rate_usd IS NOT NULL THEN
      CASE
        WHEN t.trade_currency = 'STARS' THEN
          ((t.sell_price * t.sell_rate_usd)
          - (t.buy_price * t.buy_rate_usd)
          - (t.commission_flat_stars * t.sell_rate_usd)
          - FLOOR(t.sell_price * t.commission_permille / 1000.0 + 0.5) * t.sell_rate_usd
          ) * t.quantity
        WHEN t.trade_currency = 'TON' THEN
          (((t.sell_price / 1000000000.0) * t.sell_rate_usd)
          - ((t.buy_price / 1000000000.0) * t.buy_rate_usd)
          - (FLOOR(t.sell_price * t.commission_permille / 1000.0 + 0.5) / 1000000000.0) * t.sell_rate_usd
          ) * t.quantity
      END
    ELSE NULL
  END AS net_profit_usd

FROM trades t
WHERE t.deleted_at IS NULL;
