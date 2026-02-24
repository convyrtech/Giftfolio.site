import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { z } from "zod";
import crypto from "crypto";
import { env } from "@/env";
import { db } from "@/server/db";
import { userSettings } from "@/server/db/schema";
import { authRateLimit } from "@/lib/rate-limit";

/** Type guard for Better Auth adapter results that have an `id` field. */
function assertHasId(value: unknown): asserts value is { id: string } {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof (value as Record<string, unknown>).id !== "string"
  ) {
    throw new Error("Adapter returned object without string id");
  }
}

const telegramAuthSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().max(64).optional(),
  last_name: z.string().max(64).optional(),
  username: z.string().max(32).optional(),
  photo_url: z.string().max(512).url().optional(),
  auth_date: z.number().int().positive(),
  hash: z.string().regex(/^[0-9a-f]{64}$/i),
  timezone: z.string().max(50).optional(),
});

/**
 * Custom Better Auth plugin for Telegram Login Widget.
 *
 * Verifies HMAC-SHA256 signature, creates/updates user,
 * creates session, sets cookie via BA's internal cookie system.
 */
export const telegramPlugin = () => {
  return {
    id: "telegram",
    endpoints: {
      telegramCallback: createAuthEndpoint(
        "/telegram/callback",
        {
          method: "POST",
          body: telegramAuthSchema,
        },
        async (ctx) => {
          // Rate limit by IP (5 per minute)
          const ip = ctx.request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
          const { success } = await authRateLimit.limit(ip);
          if (!success) {
            return ctx.json({ error: "Too many requests" }, { status: 429 });
          }

          const { body } = ctx;
          const botToken = env.TELEGRAM_BOT_TOKEN;

          // Check freshness first (cheap) before HMAC verification (expensive)
          const now = Math.floor(Date.now() / 1000);
          if (now - body.auth_date > 86400) {
            return ctx.json({ error: "Auth data expired" }, { status: 401 });
          }

          // Exclude non-Telegram fields (timezone is added by our client, not signed by Telegram)
          const { timezone: _tz, ...telegramFields } = body;
          if (!verifyTelegramAuth(telegramFields, botToken)) {
            return ctx.json({ error: "Invalid Telegram auth data" }, { status: 401 });
          }

          const telegramId = String(body.id);
          const displayName = [body.first_name, body.last_name].filter(Boolean).join(" ") || `User ${body.id}`;

          // Find existing user by Telegram ID
          const existingUser = await ctx.context.adapter.findOne({
            model: "user",
            where: [{ field: "telegramId", value: telegramId }],
          });

          let userId: string;
          let isNewUser = false;

          if (existingUser) {
            // Update existing user
            assertHasId(existingUser);
            userId = existingUser.id;
            await ctx.context.adapter.update({
              model: "user",
              where: [{ field: "id", value: userId }],
              update: {
                name: displayName,
                username: body.username ?? null,
                image: body.photo_url ?? null,
                updatedAt: new Date(),
              },
            });
          } else {
            // Create new user — unique constraint on telegramId handles race conditions
            try {
              const newUser = await ctx.context.adapter.create({
                model: "user",
                data: {
                  name: displayName,
                  email: `${body.id}@telegram.user`,
                  emailVerified: false,
                  image: body.photo_url ?? null,
                  telegramId,
                  username: body.username ?? null,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              });
              assertHasId(newUser);
              userId = newUser.id;
              isNewUser = true;

              // Create default user settings via direct Drizzle (not BA adapter)
              await db.insert(userSettings).values({
                userId,
                defaultCommissionStars: 0n,
                defaultCommissionPermille: 0,
                defaultCurrency: "STARS",
                timezone: body.timezone ?? "UTC",
              }).onConflictDoNothing();
            } catch {
              // Race condition: another request created the user first (unique constraint)
              const raceUser = await ctx.context.adapter.findOne({
                model: "user",
                where: [{ field: "telegramId", value: telegramId }],
              });
              if (!raceUser) {
                return ctx.json({ error: "Failed to create user" }, { status: 500 });
              }
              assertHasId(raceUser);
              userId = raceUser.id;
            }
          }

          // Create session via Better Auth's internal API
          const session = await ctx.context.internalAdapter.createSession(
            userId,
            false, // dontRememberMe
          );

          if (!session) {
            return ctx.json({ error: "Failed to create session" }, { status: 500 });
          }

          // Fetch full user for cookie cache
          const user = await ctx.context.adapter.findOne({
            model: "user",
            where: [{ field: "id", value: userId }],
          });

          if (!user) {
            return ctx.json({ error: "Failed to fetch user" }, { status: 500 });
          }

          // Set session cookie via Better Auth's official cookie system
          // Handles: correct cookie name (incl. __Secure- prefix), session data cache, dontRememberMe
          assertHasId(user);
          await setSessionCookie(ctx, {
            session,
            user: user as { id: string; name: string; email: string; emailVerified: boolean; createdAt: Date; updatedAt: Date; image: string | null },
          });

          return ctx.json({
            success: true,
            user: { id: userId, name: displayName },
            redirect: isNewUser ? "/trades?onboarding=1" : "/trades",
          });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};

/**
 * Verify Telegram Login Widget data using HMAC-SHA256.
 *
 * Algorithm:
 * 1. Create data-check-string from all fields except hash (sorted alphabetically)
 * 2. Create secret key: SHA256(bot_token)
 * 3. HMAC-SHA256(data-check-string, secret_key)
 * 4. Compare with provided hash using timingSafeEqual
 *
 * Hash is pre-validated as 64 hex chars by Zod, so length is always 32 bytes.
 */
function verifyTelegramAuth(
  data: z.infer<typeof telegramAuthSchema>,
  botToken: string,
): boolean {
  const { hash, ...rest } = data;

  // Build data-check-string: key=value pairs sorted alphabetically
  const checkString = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // Secret key = SHA256(bot_token)
  const secretKey = crypto.createHash("sha256").update(botToken).digest();

  // HMAC-SHA256
  const hmac = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  // Both are guaranteed 64 hex chars (32 bytes) — hash validated by Zod, hmac by SHA256
  const hmacBuf = Buffer.from(hmac, "hex");
  const hashBuf = Buffer.from(hash, "hex");

  return crypto.timingSafeEqual(hmacBuf, hashBuf);
}
