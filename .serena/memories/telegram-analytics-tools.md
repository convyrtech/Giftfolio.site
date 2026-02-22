# Telegram Gift Analytics & Data Tools

## Price Tracking & Analytics
| Tool | URL | What it does |
|------|-----|-------------|
| **GiftStat** | giftstat.com / giftstat.app | Market analytics, price tracking, trends. Community "42 Club" channel |
| **See.TG** | see.tg | Real-time gift upgrade tracker — monitors which gifts are being upgraded |
| **DappRadar** | dappradar.com/dapp/telegram-gifts | NFT trading volume, floor prices, historical charts |
| **Dune Analytics** | dune.com/rdmcd/telegram-gifts | On-chain + off-chain SQL dashboards, API streaming |
| **DropStab** | dropstab.com | Research & price analysis for TG gifts |

## Free Data APIs (No Auth)
| API | URL | Data |
|-----|-----|------|
| **api.changes.tg** | api.changes.tg | Gift info, models, backdrops, symbols, PNG images |
| **giftasset.pro** | giftasset.pro/api/v1 | Full gift data, market floor (avg/min/max), rarity index |
| **Fragment CDN** | nft.fragment.com/gift/{name}-{num} | Images (.webp, .jpg), Lottie animations, metadata |

## Market Stats (Feb 2026)
- ~138 total gift types issued
- 450M Telegram daily active users
- 20M+ gifts sent (Jan 2025 milestone)
- $34M+ trading volume (Dune data)
- Snoop Dogg collab: 1M gifts, $12M in ~30 min (Jul 2025)
- Gift upgrade → 21 days → on-chain mint (NFT on TON)

## Gift Structure
- **Collection**: name (e.g. "Toy Bear")
- **Attributes**: Model, Backdrop, Symbol — each with rarity percentage
- **Number**: unique within collection (e.g. #5475 of 6962)
- **States**: off-chain (Telegram servers) → on-chain (TON blockchain NFT)
- **Price units**: Telegram Stars, TON, nanotons
