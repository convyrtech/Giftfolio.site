/**
 * Floor price fetcher for Telegram gift collections.
 * Source: giftasset.pro API (no auth required).
 * In-memory cache with 1h TTL, true stale-while-revalidate.
 */

interface FloorPriceCache {
  /** collection name (PascalCase, e.g. "EasterEgg") → floor price in Stars (integer) */
  data: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cache: FloorPriceCache | null = null;
let inflight: Promise<Record<string, number>> | null = null;

/**
 * Get floor prices for all gift collections.
 * Returns a map of collection name → floor price in Stars.
 * Never throws — returns empty object on total failure.
 * Uses inflight dedup to prevent cache stampede.
 */
export async function getFloorPrices(): Promise<Record<string, number>> {
  // Fresh cache — return immediately
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  // Stale cache — serve stale, revalidate in background
  if (cache) {
    if (!inflight) {
      inflight = fetchAndCache().finally(() => {
        inflight = null;
      });
    }
    return cache.data;
  }

  // No cache at all — must wait for first fetch (dedup concurrent requests)
  if (inflight) return inflight;
  inflight = fetchAndCache().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchAndCache(): Promise<Record<string, number>> {
  try {
    const res = await fetch(
      "https://giftasset.pro/api/v1/gifts/get_gifts_collections_marketcap",
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`giftasset.pro HTTP ${res.status}`);

    const raw: unknown = await res.json();
    const data = parseMarketcapResponse(raw);

    cache = { data, fetchedAt: Date.now() };
    return data;
  } catch {
    // Return stale cache if available
    if (cache) return cache.data;
    return {};
  }
}

function parseMarketcapResponse(raw: unknown): Record<string, number> {
  const result: Record<string, number> = {};

  // Handle array response: [{ collection_name, floor, ... }]
  if (Array.isArray(raw)) {
    for (const rawItem of raw) {
      if (!rawItem || typeof rawItem !== "object") continue;
      const item = rawItem as Record<string, unknown>;
      const name = typeof item.collection_name === "string"
        ? item.collection_name
        : typeof item.name === "string"
          ? item.name
          : null;
      const floor = typeof item.floor === "number"
        ? item.floor
        : typeof item.floor_price === "number"
          ? item.floor_price
          : null;
      if (name && floor !== null && isFinite(floor) && floor >= 0) {
        result[name] = Math.round(floor);
      }
    }
    return result;
  }

  // Handle object response: { CollectionName: { floor: N }, ... }
  if (raw && typeof raw === "object") {
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "number" && isFinite(value) && value >= 0) {
        result[key] = Math.round(value);
      } else if (value && typeof value === "object" && "floor" in value) {
        const floor = (value as { floor: unknown }).floor;
        if (typeof floor === "number" && isFinite(floor) && floor >= 0) {
          result[key] = Math.round(floor);
        }
      }
    }
  }

  return result;
}
