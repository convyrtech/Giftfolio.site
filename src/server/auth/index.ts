import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/env";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { telegramPlugin } from "./telegram-plugin";

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  session: {
    expiresIn: 7 * 24 * 60 * 60, // 7 days
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 min — avoid DB hit on every request
    },
  },
  plugins: [telegramPlugin(), nextCookies()],
  user: {
    additionalFields: {
      telegramId: {
        type: "string",
        required: false,
      },
      username: {
        type: "string",
        required: false,
      },
    },
  },
  trustedOrigins: [env.NEXT_PUBLIC_APP_URL],
});

export type Session = typeof auth.$Infer.Session;
