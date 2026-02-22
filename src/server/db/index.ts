import { Pool, neon, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleWS } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleHTTP } from "drizzle-orm/neon-http";
import ws from "ws";
import * as schema from "./schema";
import { env } from "@/env";

// WebSocket for Node.js runtime (Railway)
neonConfig.webSocketConstructor = ws;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err: Error) => {
  // Sanitize: Neon driver may embed connection string in error message
  const safeMsg = err.message.replace(/postgresql:\/\/[^\s]+/gi, "[REDACTED]");
  console.error("[db] Pool error:", safeMsg);
});

// Primary: WebSocket pool (transactions, writes)
export const db = drizzleWS(pool, { schema });

// Fallback: HTTP (stateless reads, works in Edge)
export const dbHttp = drizzleHTTP(neon(env.DATABASE_URL), { schema });

// Graceful shutdown (idempotent — safe against double signal)
let isShuttingDown = false;

async function shutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("[db] Draining pool...");
  const timeout = setTimeout(() => {
    console.error("[db] Pool drain timeout, forcing exit");
    process.exit(1);
  }, 2500);
  await pool.end();
  clearTimeout(timeout);
  console.log("[db] Pool drained");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
