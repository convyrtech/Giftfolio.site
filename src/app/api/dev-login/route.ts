import { NextResponse } from "next/server";
import crypto from "crypto";
import { env } from "@/env";

export const runtime = "nodejs";

/**
 * Dev-only login bypass. Returns an auto-submitting form that calls
 * the real Telegram auth callback with properly signed data.
 * Only works in development mode.
 *
 * Usage: navigate to /api/dev-login in browser
 */
export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  // Build fake Telegram user data
  const authDate = Math.floor(Date.now() / 1000);
  const data: Record<string, string | number> = {
    id: 999999999,
    first_name: "Dev",
    last_name: "Tester",
    username: "dev_tester",
    auth_date: authDate,
  };

  // Sign with real bot token (same HMAC-SHA256 as Telegram)
  const checkString = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(env.TELEGRAM_BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  const payload = JSON.stringify({ ...data, hash, timezone: "Europe/Moscow" });

  // Return HTML that auto-submits to the real callback, which sets cookies properly
  const html = `<!DOCTYPE html>
<html><body><p>Logging in...</p><script>
fetch("/api/auth/telegram/callback", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: ${JSON.stringify(payload)},
  credentials: "include"
})
.then(r => r.json())
.then(d => { window.location.href = d.redirect || "/trades"; })
.catch(() => { document.body.textContent = "Login failed"; });
</script></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
