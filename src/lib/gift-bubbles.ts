/**
 * Gift Bubbles market data fetcher.
 * Source: gift-bubbles.up.railway.app (third-party, no SLA, Railway free tier).
 *
 * In-memory cache with 5-min TTL, stale-while-revalidate, inflight dedup.
 * Never throws — returns { items: [], available: false } on total failure.
 */

import { z } from "zod";

const GiftBubbleItemSchema = z.object({
  id: z.number(),
  name: z.string(),
  floorprice: z.number(),
  floorprice_usd: z.number(),
  change: z.number(),
  change_7d: z.number(),
  change_30d: z.number(),
  change_usd: z.number(),
  change_7d_usd: z.number().nullable(),
  change_30d_usd: z.number().nullable(),
  /** Number of active floor listings (NOT 24h trade volume) */
  volume: z.number().int(),
  /** Not rendered — we use Fragment CDN instead. Validated for structural integrity. */
  img_src: z.string().url(),
});

export type GiftBubbleItem = z.infer<typeof GiftBubbleItemSchema>;

export interface GiftBubblesResult {
  items: GiftBubbleItem[];
  fetchedAt: number;
  /** True if data is from stale cache due to upstream failure */
  stale: boolean;
  /** False if no data available at all */
  available: boolean;
}

const GIFT_BUBBLES_URL = "https://gift-bubbles.up.railway.app/data-gifts";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_TIMEOUT_MS = 12_000; // 12 sec — avoids waiting full Railway cold start

interface Cache {
  result: GiftBubblesResult;
  fetchedAt: number;
}

let cache: Cache | null = null;
let inflight: Promise<GiftBubblesResult> | null = null;

/**
 * Get all gift market data from gift-bubbles.
 * Uses stale-while-revalidate: returns cached data immediately, revalidates in background.
 */
export async function getGiftBubblesData(): Promise<GiftBubblesResult> {
  const now = Date.now();

  // Fresh cache — return immediately
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.result;
  }

  // Stale cache — serve stale, revalidate in background
  if (cache) {
    if (!inflight) {
      inflight = fetchAndCache().finally(() => {
        inflight = null;
      });
    }
    return { ...cache.result, stale: true };
  }

  // No cache — must fetch (dedup concurrent requests)
  if (inflight) return inflight;
  inflight = fetchAndCache().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchAndCache(): Promise<GiftBubblesResult> {
  try {
    const res = await fetch(GIFT_BUBBLES_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`gift-bubbles HTTP ${res.status}`);

    const raw: unknown = await res.json();
    if (!Array.isArray(raw)) throw new Error("gift-bubbles: expected array");

    const items: GiftBubbleItem[] = [];
    for (const entry of raw) {
      const parsed = GiftBubbleItemSchema.safeParse(entry);
      if (parsed.success) items.push(parsed.data);
    }

    if (items.length === 0) throw new Error("gift-bubbles: no valid items");

    const result: GiftBubblesResult = {
      items,
      fetchedAt: Date.now(),
      stale: false,
      available: true,
    };
    cache = { result, fetchedAt: Date.now() };
    return result;
  } catch {
    // Return stale cache if available
    if (cache) return { ...cache.result, stale: true };
    return { items: [], fetchedAt: Date.now(), stale: false, available: false };
  }
}

/**
 * Build Fragment CDN image URL for a gift collection.
 * Uses item #1 as the representative collection image.
 */
export function getCollectionImageUrl(name: string): string {
  // Remove spaces, hyphens, apostrophes and other non-alphanumeric chars
  const nameLower = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://nft.fragment.com/gift/${nameLower}-1.webp`;
}
