import { NextResponse } from "next/server";
import { env } from "@/env";
import { db } from "@/server/db";
import { users, userSettings, sessions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "better-auth";

export const runtime = "nodejs";

/**
 * Sign a cookie value the same way Hono / Better Auth does:
 * HMAC-SHA256(value, secret) → base64
 */
async function signToken(value: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Dev-only login bypass. Creates user + session directly in DB,
 * sets a properly signed session cookie, and redirects to /trades.
 *
 * Usage: navigate to /api/dev-login in browser or Playwright
 */
export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const telegramId = "999999999";
  const displayName = "Dev Tester";

  // Find or create dev user
  let [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.telegramId, telegramId))
    .limit(1);

  if (!user) {
    const userId = generateId();
    await db.insert(users).values({
      id: userId,
      name: displayName,
      email: `${telegramId}@telegram.user`,
      emailVerified: false,
      telegramId,
      username: "dev_tester",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(userSettings).values({
      userId,
      defaultCommissionStars: 0n,
      defaultCommissionPermille: 0,
      defaultCurrency: "TON",
      timezone: "Europe/Moscow",
      locale: "ru",
    }).onConflictDoNothing();
    user = { id: userId };
  }

  // Create session directly in DB
  const token = generateId(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: generateId(),
    userId: user.id,
    token,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Sign cookie value: "token.base64(HMAC-SHA256(token, secret))"
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
  const signature = await signToken(token, secret);
  const signedValue = `${token}.${signature}`;

  // Build redirect with signed session cookie
  const isSecure = env.NEXT_PUBLIC_APP_URL.startsWith("https");
  const response = NextResponse.redirect(new URL("/trades", env.NEXT_PUBLIC_APP_URL));

  response.cookies.set("better-auth.session_token", signedValue, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
    maxAge: 7 * 24 * 60 * 60,
  });

  // Locale cookie for next-intl
  const [settings] = await db
    .select({ locale: userSettings.locale })
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);

  if (settings?.locale) {
    response.cookies.set("locale", settings.locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 365 * 24 * 60 * 60,
    });
  }

  return response;
}
