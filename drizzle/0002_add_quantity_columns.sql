-- Migration: Add quantity, is_hidden, exclude_from_pnl columns
-- Also make gift_link and gift_number nullable for collection mode

-- 1. New columns
ALTER TABLE trades
  ADD COLUMN quantity smallint NOT NULL DEFAULT 1,
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN exclude_from_pnl boolean NOT NULL DEFAULT false;

-- 2. Make gift_link and gift_number nullable (for collections without individual gift URL)
ALTER TABLE trades
  ALTER COLUMN gift_link DROP NOT NULL,
  ALTER COLUMN gift_number DROP NOT NULL;

-- 3. Constraints
ALTER TABLE trades
  ADD CONSTRAINT chk_quantity_range CHECK (quantity >= 1 AND quantity <= 9999);

-- 4. Drop old unique index and recreate with gift_number IS NOT NULL filter
DROP INDEX IF EXISTS uq_trades_user_gift_open;
CREATE UNIQUE INDEX uq_trades_user_gift_open
  ON trades (user_id, gift_slug)
  WHERE sell_date IS NULL AND deleted_at IS NULL AND gift_number IS NOT NULL;

-- 5. Index for hidden trades filter
CREATE INDEX idx_trades_hidden
  ON trades (user_id, is_hidden)
  WHERE deleted_at IS NULL;

-- 6. Recreate VIEW with quantity multiplication
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
        - ROUND(t.sell_price * t.commission_permille / 1000.0)
      ) * t.quantity
    ELSE NULL
  END AS net_profit_stars,

  -- Net profit in NanoTon (only for TON trades with sell_price), multiplied by quantity
  CASE
    WHEN t.trade_currency = 'TON' AND t.sell_price IS NOT NULL THEN
      (t.sell_price - t.buy_price
        - ROUND(t.sell_price * t.commission_permille / 1000.0)
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
          - ROUND(t.sell_price * t.commission_permille / 1000.0) * t.sell_rate_usd
          ) * t.quantity
        WHEN t.trade_currency = 'TON' THEN
          (((t.sell_price / 1000000000.0) * t.sell_rate_usd)
          - ((t.buy_price / 1000000000.0) * t.buy_rate_usd)
          - (ROUND(t.sell_price * t.commission_permille / 1000.0) / 1000000000.0) * t.sell_rate_usd
          ) * t.quantity
      END
    ELSE NULL
  END AS net_profit_usd

FROM trades t
WHERE t.deleted_at IS NULL;
