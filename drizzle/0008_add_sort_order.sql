-- Migration: Add sort_order column for custom row drag/reorder
-- 0 = not manually sorted (use default sort), >0 = custom position

ALTER TABLE trades
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX idx_trades_sort_order
  ON trades (user_id, sort_order)
  WHERE deleted_at IS NULL;
