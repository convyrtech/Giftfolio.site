# Steamfolio.com — Detailed UI Reference

## Tech Stack
- Next.js (App Router) + Tailwind CSS + shadcn/ui
- Azure hosting, Cloudflare DNS
- Token-based color system (CSS variables: bg-os-background-100, foreground)

## Auth
- Steam OAuth (primary), Discord, Email
- /sign-in page: centered, dark, logo + "Welcome Back" + trust badges

## Navigation
- Fixed navbar ~80px, backdrop-blur
- Logo left, links center (Popular Skins, Contact), CTA right (Go to App)
- Inside app: Portfolio tabs (Active, Sold, Add Item, Manage, Overview)

## Portfolio Table (MAIN FEATURE)
### Summary cards above table:
- Total Invested | Worth Now | Gain | Estimated Gain After Fees

### Table columns (Active):
- Item image (small icon) + Name
- Buy Price (user input)
- Current Market Price (auto-updated)
- Quantity
- Total Value
- Profit/Loss (absolute)
- % Change
- Sparkline (7d mini SVG chart)
- 1d/7d/30d changes (toggle)
- Actions (edit, sell, delete)

### Toolbar:
- Toggle Details (show 1d/7d/30d)
- Export: Excel, PDF
- Edit (pencil), Move to Sold (box), Delete (trash)

### Sold Items:
- Same table but with fixed sell price
- Shows realized profit

## Add Item
- Search by name → select → enter Buy Price + Quantity + Notes
- Or from item detail page: "Add to Portfolio"

## Item Detail Page
- Current price (large), period change
- Chart: line (default) / candlestick (toggle)
- Period selector: week/month/year/all-time
- Stats cards: Market Volume, Sales Week/Month/Year, Average prices, Change %
- Buttons: Add to Portfolio, View on Steam Market

## Popular Skins (/popular)
- Table: Item (image+name) | Price | Volume 24h | Volume 7d | 24h% | 7d% | 30d% | Sparkline
- Search bar, Watchlist tab, category filters (cases, capsules, stickers, agents)

## Design System
- Dark theme default (deep dark bg, ~#0a0a0f)
- Green = profit, Red = loss
- Rounded cards, animate-in fade-in-50
- max-w-7xl (1280px), anti-aliased fonts
- PWA support (site.webmanifest)

## Monetization
- Free tier + Premium (advanced analytics, higher limits)

## Key Adaptation for GIFTSSITE
- Steam OAuth → Telegram Login Widget / email
- CS2 skins → Telegram gifts (from t.me/nft/ links)
- Auto market prices → manual buy/sell (no live market feed yet)
- Commission: Steam ~13% → Telegram gift transfer fee (configurable)
- Sparklines → maybe later, start with simple profit calc
