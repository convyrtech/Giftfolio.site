# Telegram Gift Marketplaces — API Reference (Updated Feb 2026)

## 1. MRKT (tgmrkt.io) — BEST DOCUMENTED REST API
- **Base URL**: `https://api.tgmrkt.io/api/v1`
- **Auth**: POST `/auth` with `{"data": init_data}` (Telegram WebApp tgWebAppData)
- **Token**: valid >24 hours, obtained via Pyrogram RequestAppWebView or browser DevTools
- **Key Endpoints**:
  - `POST /gifts/saling` — list gifts for sale
    - Filters: collectionNames, modelNames, backdropNames, symbolNames, ordering, lowToHigh, maxPrice, minPrice, mintable, count, cursor, query, promotedFirst
- **GitHub Docs**: https://github.com/boostNT/MRKT-API
- **Volume**: Part of $34M+ TG gifts trading ecosystem (Dune data)
- **Plans**: Expanding to usernames, domains, numbers
- **Notes**: Uses internal balance system (deposits/withdrawals), not direct on-chain trades

## 2. Portals Market (@portals_market_bot) — PYTHON API AVAILABLE!
- **Base URL**: `https://portals-market.com` (Mini App backend)
- **Python Library**: `pip install portalsmp` (sync) / `pip install aportalsmp` (async)
- **GitHub**: https://github.com/bleach-hub/portalsmp
- **Auth**: Telegram WebApp token, header `Authorization: tma <token>`
  - Method 1: Manual from DevTools (expires 1-7 days)
  - Method 2: Programmatic via kurigram (Pyrogram fork) with api_id + api_hash
- **Key Methods**:
  - `search(sort, offset, limit, gift_name, model, backdrop, symbol, min_price, max_price)` — search listings
  - `giftsFloors()` — floor prices for all collections
  - `filterFloors(gift_name)` — models/backdrops/symbols floors for specific collection
  - `collections(limit)` — all collections with names, floors, daily volumes
  - `marketActivity(sort, activityType, gift_name, ...)` — activity feed (buy, listing, price_update, offer)
  - `myPortalsGifts(listed)` — user's gifts
  - `myActivity()` — user's transaction history
  - `sale(nft_id, price)` — list for sale
  - `buy(nft_id, owner_id, price)` — purchase
  - `makeOffer(nft_id, offer_price, expiration_days)` — place offer
  - `collectionOffer()` / `cancelCollectionOffer()` — collection-level offers
- **Sort options**: price_asc, price_desc, latest, gift_id_asc, gift_id_desc, model_rarity_asc, model_rarity_desc
- **PortalsGift attributes**: id, tg_id, collection_id, owner_id, name, price, floor_price, model, model_rarity, symbol, symbol_rarity, backdrop, backdrop_rarity, listed_at, animation_url, emoji_id, unlocks_at
- **Stats**: 1.1M+ monthly active users (Nov 2025)
- **Economy**: TON cryptocurrency, built-in wallet, referral program (20-50%)

## 3. Getgems (getgems.io) — GraphQL, NO OFFICIAL DOCS
- **GraphQL**: `https://api.getgems.io/graphql`
- **Tech**: Apollo Server
- **Auth**: No auth required for READ operations
- **Introspection**: Available — use GraphQL Playground or Apollo Sandbox to discover schema
- **GitHub**: https://github.com/getgems-io/nft-contracts (smart contracts only)
- **Known operations**: Collection queries, NFT metadata, floor prices, sales history
- **Notes**: Largest TON NFT marketplace. No public API docs — must use introspection
- **On-chain vs Off-chain**: Supports both. Off-chain gifts cannot be converted to on-chain via Getgems (only via Telegram/Fragment)

## 4. Fragment (fragment.com) — NO PUBLIC API
- **Type**: Official Telegram marketplace
- **API**: No documented public API
- **Internal API**: `https://fragment.com/api/...` (returns JSON, discoverable via DevTools)
- **Alternative**: Gift data available via TON blockchain APIs (all TG gifts are NFTs on TON)
- **Volume**: Major volume — official marketplace for TG gifts
- **Notes**: Auth via Telegram for trading. Read-only data accessible via TON blockchain queries

## 5. TonAPI (tonapi.io) — UNIVERSAL TON BLOCKCHAIN API
- **Base URL**: `https://tonapi.io/api/v2`
- **Docs**: https://docs.tonconsole.com/tonapi/rest-api
- **NFT Docs**: https://docs.tonconsole.com/tonapi/rest-api/nft
- **Swagger**: https://tonapi.io/api-v2 (interactive testing)
- **GitHub**: https://github.com/tonkeeper/tonapi
- **Auth**: API key via @tonapi_bot (`/get_server_key`, `/get_client_key`)
- **Key NFT Endpoints**:
  - `GET /v2/accounts/{id}/nfts` — all NFTs by account
  - `GET /v2/nfts/{id}` — NFT item details
  - `GET /v2/nfts/collections/{id}` — collection info
  - `GET /v2/accounts/{id}/nfts/history` — NFT transfer history
  - `GET /v2/nfts/{addresses}` — batch NFT lookup
- **Features**: Actions-based event model (Jetton Transfer, NFT Purchase, etc.)
- **SDKs**: Multiple languages available
- **Rate limits**: Depends on tier (free ~1 req/sec)

## 6. Telegram Official MTProto API
- **Docs**: https://core.telegram.org/api/gifts
- **Type**: MTProto (requires Telethon/Pyrogram session)
- **Structures**: StarGift, StarGiftUnique, SavedStarGift + attribute types
- **Key Methods**:
  - `payments.getStarGifts` — all available gifts
  - `payments.getResaleStarGifts` — gifts on resale
  - `payments.getSavedStarGifts` — user's saved gifts
  - `payments.getUniqueStarGift` — single gift by slug
  - `payments.updateStarGiftPrice` — set resale price
  - `payments.getStarGiftWithdrawalUrl` — withdraw to TON (requires 2FA)
- **Commission Config Keys**:
  - `stars_stargift_resale_commission_permille` — Stars commission
  - `ton_stargift_resale_commission_permille` — TON commission
  - `stars_stargift_resale_amount_min/max` — price bounds (Stars)
  - `ton_stargift_resale_amount_min/max` — price bounds (TON)
- **Gift Attributes**: model, pattern, backdrop with rarity_permille

## 7. Telegram Bot API (Gift Methods)
- `getAvailableGifts` — list all gifts
- `sendGift` — send a gift
- `getBusinessAccountGifts` — business account gifts
- Objects: UniqueGift, UniqueGiftModel, UniqueGiftSymbol, UniqueGiftBackdrop
- Fields: is_from_blockchain, publisher_chat, origin (gifted_upgrade, offer)

---

## Integration Strategy for GIFTSSITE

### MVP (Phase 1 — Manual Entry)
- Fragment CDN — gift images (no auth)
- api.changes.tg / giftasset.pro — gift metadata (no auth)
- User manually inputs buy/sell prices and dates

### Phase 2 — Market Prices
- **Portals API** (`portalsmp`) — floor prices, collection data (easiest to integrate, Python lib ready)
- **MRKT API** — listings and prices (well-documented REST)
- **Getgems GraphQL** — floor prices (no auth for reads)

### Phase 3 — Auto-Import
- **TonAPI** — on-chain transaction history, NFT transfers → auto-detect trades
- **Portals API** — `myActivity()` → import trade history
- **MRKT API** — trade history (if endpoint available)

### Phase 4 — Real-Time
- Live price feeds from multiple marketplaces
- Price comparison across MRKT / Portals / Getgems / Fragment
- Arbitrage detection (price differences between platforms)
