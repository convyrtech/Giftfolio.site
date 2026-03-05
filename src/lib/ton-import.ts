/**
 * TON wallet auto-import utility.
 * Fetches NftPurchase events from TonAPI for a given wallet address,
 * filters for Telegram gift NFTs, and returns detected trades.
 *
 * Only marketplace buys/sells are detectable (price available).
 * P2P transfers (no price) are intentionally skipped.
 *
 * Rate limit: TonAPI free tier = 1 RPS. We add 1.2s delay between pages.
 */

import { z } from "zod";

// ─── TonAPI response schemas ─────────────────────────────────────────────────

const PriceSchema = z.object({
  value: z.string().regex(/^\d+$/, "Price must be a non-negative integer string"), // nanoTON as string
  token_name: z.string(),
});

const AccountAddressSchema = z.object({
  address: z.string(),
  name: z.string().optional(),
  is_scam: z.boolean().optional(),
});

const NftItemSchema = z.object({
  address: z.string(),
  collection: z
    .object({
      address: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  owner: AccountAddressSchema.optional(),
  metadata: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
  dns: z.string().optional(),
});

const NftPurchaseActionSchema = z.object({
  amount: PriceSchema,
  seller: AccountAddressSchema,
  buyer: AccountAddressSchema,
  auction_type: z.string().optional(),
  nft: NftItemSchema,
});

const ActionSchema = z.object({
  type: z.string(),
  status: z.string(),
  NftPurchase: NftPurchaseActionSchema.optional(),
});

const AccountEventSchema = z.object({
  event_id: z.string(),
  timestamp: z.number(),
  actions: z.array(ActionSchema),
  lt: z.number(),
});

const EventsResponseSchema = z.object({
  events: z.array(AccountEventSchema),
  next_from: z.number().optional(),
});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DetectedTrade {
  /** Telegram gift name (e.g. "Easter Egg") */
  giftName: string;
  /** Gift number parsed from NFT name (e.g. 1234) */
  giftNumber: number;
  /** Normalized slug (e.g. "easteregg-1234") */
  giftSlug: string;
  /** Buy or sell side from wallet perspective */
  side: "buy" | "sell";
  /** Price in nanoTON */
  priceNanoton: bigint;
  /** Unix timestamp (seconds) */
  timestamp: number;
  /** TonAPI event ID for deduplication */
  eventId: string;
}

export interface ImportResult {
  trades: DetectedTrade[];
  /** Total events fetched from API */
  eventsFetched: number;
  /** True if TonAPI returned rate-limit error */
  rateLimited: boolean;
  /** True if wallet address was invalid or API unreachable */
  error: string | null;
}

// ─── Gift name parsing ────────────────────────────────────────────────────────

/**
 * Telegram gift NFTs have metadata name like "Easter Egg #1234".
 * Returns null if the name doesn't match the pattern.
 *
 * @internal exported for testing only
 */
export function parseGiftNftName(
  rawName: string,
): { giftName: string; giftNumber: number } | null {
  const match = /^(.+?)\s+#(\d+)$/.exec(rawName.trim());
  if (!match) return null;
  const giftName = match[1]!.trim();
  const giftNumber = parseInt(match[2]!, 10);
  if (isNaN(giftNumber) || giftNumber <= 0) return null;
  return { giftName, giftNumber };
}

/**
 * Build a gift slug from name + number: "Easter Egg" + 1234 → "easteregg-1234"
 *
 * @internal exported for testing only
 */
export function buildGiftSlug(giftName: string, giftNumber: number): string {
  const namePart = giftName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${namePart}-${giftNumber}`;
}

// ─── TonAPI fetcher ───────────────────────────────────────────────────────────

const TONAPI_BASE = "https://tonapi.io/v2";
const PAGE_LIMIT = 100;
const MAX_PAGES = 10; // max 1000 events per import run
const PAGE_DELAY_MS = 1200; // 1.2s — safely under 1 RPS free tier limit

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a TON wallet address to raw form (0:hexhash) by calling TonAPI.
 * This is necessary because TonAPI event responses use raw addresses internally
 * while users typically provide user-friendly addresses (UQ…, EQ…).
 * Returns the original address lowercased if normalization fails (safe fallback).
 */
async function normalizeWalletAddress(address: string): Promise<string> {
  try {
    // GET /v2/accounts/{account_id} returns the account with normalized address fields.
    // TonAPI accepts friendly (UQ/EQ) and raw (0:hex) formats in the path.
    const url = `${TONAPI_BASE}/accounts/${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return address.toLowerCase();
    const raw: unknown = await res.json();
    const parsed = z.object({ address: z.string().optional() }).safeParse(raw);
    // `address` field is the raw form: "0:abcdef..."
    return ((parsed.success ? parsed.data.address : undefined) ?? address).toLowerCase();
  } catch {
    return address.toLowerCase();
  }
}

/**
 * Fetch all NftPurchase events for a wallet, across multiple pages.
 * Returns detected Telegram gift trades (buy or sell).
 */
export async function importTradesFromWallet(
  walletAddress: string,
): Promise<ImportResult> {
  const trades: DetectedTrade[] = [];
  let eventsFetched = 0;
  let beforeLt: number | undefined = undefined;
  let rateLimited = false;

  // Normalize to raw address form for consistent comparison with API responses
  const normalizedWallet = await normalizeWalletAddress(walletAddress);

  for (let page = 0; page < MAX_PAGES; page++) {
    if (page > 0) {
      await sleep(PAGE_DELAY_MS);
    }

    const url = new URL(
      `${TONAPI_BASE}/accounts/${encodeURIComponent(walletAddress)}/events`,
    );
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("subject_only", "true");
    if (beforeLt !== undefined) {
      url.searchParams.set("before_lt", String(beforeLt));
    }

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      return {
        trades,
        eventsFetched,
        rateLimited: false,
        error: e instanceof Error ? e.message : "Network error",
      };
    }

    if (res.status === 429) {
      rateLimited = true;
      break;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (body.includes("rate limit")) {
        rateLimited = true;
        break;
      }
      return {
        trades,
        eventsFetched,
        rateLimited: false,
        error: `TonAPI error ${res.status}: ${body.slice(0, 200)}`,
      };
    }

    const raw: unknown = await res.json().catch(() => null);
    if (!raw) {
      return {
        trades,
        eventsFetched,
        rateLimited: false,
        error: "Failed to parse TonAPI response",
      };
    }

    const parsed = EventsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        trades,
        eventsFetched,
        rateLimited: false,
        error: `Unexpected TonAPI schema: ${parsed.error.message.slice(0, 200)}`,
      };
    }

    const { events, next_from } = parsed.data;
    eventsFetched += events.length;

    for (const event of events) {
      for (const action of event.actions) {
        if (action.type !== "NftPurchase" || !action.NftPurchase) continue;
        if (action.status !== "ok") continue;

        const purchase = action.NftPurchase;
        const nftName = purchase.nft.metadata?.name ?? "";
        const giftParsed = parseGiftNftName(nftName);
        if (!giftParsed) continue;

        const { giftName, giftNumber } = giftParsed;
        const buyerAddr = purchase.buyer.address.toLowerCase();
        const sellerAddr = purchase.seller.address.toLowerCase();

        let side: "buy" | "sell";
        if (buyerAddr === normalizedWallet) {
          side = "buy";
        } else if (sellerAddr === normalizedWallet) {
          side = "sell";
        } else {
          continue;
        }

        const priceNanoton = BigInt(purchase.amount.value);

        trades.push({
          giftName,
          giftNumber,
          giftSlug: buildGiftSlug(giftName, giftNumber),
          side,
          priceNanoton,
          timestamp: event.timestamp,
          eventId: event.event_id,
        });
      }
    }

    if (!next_from || events.length < PAGE_LIMIT) break;
    beforeLt = next_from;
  }

  return { trades, eventsFetched, rateLimited, error: null };
}
