import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/env";

function createRedis(): Redis | null {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return null;
}

const redis = createRedis();

/** Auth endpoint: 5 requests per 60s per IP */
const authLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      prefix: "rl:auth",
      analytics: false,
    })
  : null;

/** tRPC mutations: 30 requests per 60s per user */
const mutationLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "60 s"),
      prefix: "rl:mutation",
      analytics: false,
    })
  : null;

/** Rate limit check — returns { success: true } if no Redis (dev mode passthrough) */
async function check(limiter: Ratelimit | null, key: string): Promise<{ success: boolean }> {
  if (!limiter) return { success: true };
  return limiter.limit(key);
}

export const authRateLimit = { limit: (key: string) => check(authLimiter, key) };
export const mutationRateLimit = { limit: (key: string) => check(mutationLimiter, key) };
