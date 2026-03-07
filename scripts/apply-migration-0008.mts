import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main(): Promise<void> {
  console.log("Applying migration 0008: add sort_order column...");

  await sql`ALTER TABLE trades ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0`;
  console.log("  Column sort_order added");

  await sql`CREATE INDEX IF NOT EXISTS idx_trades_sort_order ON trades (user_id, sort_order) WHERE deleted_at IS NULL`;
  console.log("  Index idx_trades_sort_order created");

  const verify = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'trades' AND column_name = 'sort_order'`;
  console.log("  Verify:", verify.length > 0 ? "OK" : "FAILED");
}

main().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
