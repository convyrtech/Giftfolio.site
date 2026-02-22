# GIFTSSITE — Project Overview

## Purpose
Telegram collectible gift trading tracker. Users input buy/sell data for gifts, 
the system calculates profit, daily/weekly/monthly PnL, and displays gift images.

## Design Reference
- steamfolio.com — dark theme, minimalist, table-centric portfolio tracker
- Fixed navbar with blur, main content = data table

## Tech Stack (Final)
- Next.js 15 (App Router) + tRPC + TypeScript strict
- Drizzle ORM + PostgreSQL (Neon serverless, @neondatabase/serverless)
- Better Auth + custom Telegram Login Widget plugin
- TanStack Table v8 + shadcn/ui + Tailwind CSS v4
- Railway (app) + Neon (DB)

## Core Features
1. Manual input: buy date, sell date, gift link, buy price, sell price
2. Auto-calculated: profit, daily/weekly/monthly/total profit, buy/sell volume
3. Gift commission: DUAL model — flat Stars + permille (‰), global default + per-trade override
4. Gift image + name + number extracted from t.me/nft/ link
5. Future: PnL charts, more analytics

## Key Data Sources
- Gift images: `nft.fragment.com/gift/{name_lower}-{number}.webp` (no auth needed)
- Gift metadata: `api.changes.tg` or `giftasset.pro` (free APIs)
- URL format: `t.me/nft/{PascalCaseName}-{Number}`
