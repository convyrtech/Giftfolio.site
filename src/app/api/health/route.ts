import { db } from "@/server/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    await db.execute(sql`SELECT 1`);
  } catch {
    return Response.json(
      { status: "error", message: "Database unreachable" },
      { status: 503 },
    );
  }

  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
