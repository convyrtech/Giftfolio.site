# Telegram Gifts — API & Data Extraction

## URL Parsing
Link format: `https://t.me/nft/EasterEgg-52095`
- slug = "EasterEgg-52095"
- name = everything before last `-` → "EasterEgg"
- number = everything after last `-` → 52095
- Human-readable name: insert spaces before capitals → "Easter Egg"
- Lowercase for CDN: "easteregg"

## Fragment CDN (NO AUTH REQUIRED)
Base: `https://nft.fragment.com/gift/{name_lower}-{number}`
- `.webp` — WebP image (best for web)
- `.large.jpg` — large JPG
- `.medium.jpg` — medium JPG
- `.small.jpg` — small JPG (thumbnails)
- `.lottie.json` — Lottie animation
- `.tgs` — Telegram sticker format
- `.json` — metadata (only for blockchain-exported gifts)
- Collection thumbnail: `https://fragment.com/file/gifts/{name}/thumb.webp`

## Free Community APIs
### api.changes.tg
- `GET /gift/:gift` — full gift info (models, backdrops, symbols)
- `GET /models/:gift` — models
- `GET /backdrops/:gift` — backdrops
- `GET /symbols/:gift` — symbols
- `GET /original/:giftId.png` — PNG image
- Telegram channel: @GiftChangesAPI

### giftasset.pro
- `GET /api/v1/gifts/get_gift_by_name?name=EasterEgg-1` — full data by name
- `GET /api/v1/gifts/get_gift_by_user?username=xxx` — user's gifts
- Returns: attributes, market_floor (avg/min/max), media links, rarity_index
- Docs: https://giftasset.pro/docs

## Telegram MTProto API (REQUIRES AUTH)
- `payments.getUniqueStarGift(slug)` — full gift object
- `payments.getStarGifts` — all available gifts
- `payments.getResaleStarGifts` — gifts on resale
- Requires Telethon/Pyrogram session

## Telegram Bot API
- `getAvailableGifts` — list of all gifts (regular, not unique)
- UniqueGift, UniqueGiftModel, UniqueGiftSymbol, UniqueGiftBackdrop objects

## Recommended Approach for MVP
1. Parse slug from URL
2. Images from Fragment CDN (webp/jpg)
3. Metadata from api.changes.tg or giftasset.pro
4. No auth needed for basic functionality
