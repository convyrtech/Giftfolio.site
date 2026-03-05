import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { cache } from "react";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { auth } from "@/server/auth";
import { mutationRateLimit, publicRateLimit } from "@/lib/rate-limit";

export const createTRPCContext = cache(async () => {
  const headersList = await headers();

  const session = await auth.api.getSession({
    headers: headersList,
  });

  return {
    db,
    headers: headersList,
    session,
  };
});

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const createCallerFactory = t.createCallerFactory;
export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return opts.next({
    ctx: {
      ...ctx,
      session: ctx.session,
      user: ctx.session.user,
    },
  });
});

/** Protected procedure with rate limiting for mutations (30/min per user) */
export const rateLimitedProcedure = protectedProcedure.use(async (opts) => {
  const { ctx } = opts;
  const { success } = await mutationRateLimit.limit(ctx.user.id);
  if (!success) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
  }
  return opts.next();
});

/**
 * Public procedure with IP-based rate limiting (60 req/60s).
 * For unauthenticated endpoints like market data.
 */
export const publicRateLimitedProcedure = t.procedure.use(async (opts) => {
  const headersList = opts.ctx.headers;
  const forwarded = headersList.get("x-forwarded-for");
  // Take first IP from x-forwarded-for (may be comma-separated list)
  const rawIp = forwarded ? forwarded.split(",")[0]?.trim() : null;
  // Validate basic IP format (v4 or v6), fallback to global key
  const ip =
    rawIp && /^[\d.:a-fA-F]+$/.test(rawIp) ? rawIp : "public:global";
  const { success } = await publicRateLimit.limit(ip);
  if (!success) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded" });
  }
  return opts.next();
});
