/**
 * Floor price fetcher for Telegram gift collections.
 * Source: giftasset.pro API (no auth required).
 * In-memory cache with 1h TTL, stale-while-revalidate on failure.
 */

interface CollectionMarketcap {
  collection_name?: string;
  name?: string;
  floor?: number;
  floor_price?: number;
  ton_mcap?: number;
  available_gifts?: number;
}

interface FloorPriceCache {
  /** collection name (PascalCase, e.g. "EasterEgg") → floor price in Stars */
  data: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let cache: FloorPriceCache | null = null;

/**
 * Get floor prices for all gift collections.
 * Returns a map of collection name → floor price in Stars.
 * Never throws — returns empty object on total failure.
 */
export async function getFloorPrices(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

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
    // Stale-while-revalidate: return old cache on failure
    if (cache) return cache.data;
    return {};
  }
}

function parseMarketcapResponse(raw: unknown): Record<string, number> {
  const result: Record<string, number> = {};

  // Handle array response: [{ collection_name, floor, ... }]
  if (Array.isArray(raw)) {
    for (const item of raw as CollectionMarketcap[]) {
      const name = item.collection_name ?? item.name;
      const floor = item.floor ?? item.floor_price;
      if (name && typeof floor === "number" && floor > 0) {
        result[name] = floor;
      }
    }
    return result;
  }

  // Handle object response: { CollectionName: { floor: N }, ... }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (typeof value === "number" && value > 0) {
        result[key] = value;
      } else if (value && typeof value === "object" && "floor" in value) {
        const floor = (value as { floor: unknown }).floor;
        if (typeof floor === "number" && floor > 0) {
          result[key] = floor;
        }
      }
    }
  }

  return result;
}
