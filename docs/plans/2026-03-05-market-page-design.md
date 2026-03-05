# Market Page Design — Giftfolio.site

> **Status:** Design complete (v2 — after full fact-check)
> **Date:** 2026-03-05
> **Goal:** Публичная страница /market с floor prices, % изменением и листингами по всем Telegram подаркам

---

## Table of Contents

1. [Overview — верифицированные факты](#overview)
2. [Public vs Private и роутинг](#1-public-vs-private-и-роутинг)
3. [Надёжность API и кэширование](#2-надёжность-api-и-кэширование)
4. [UX и навигация](#3-ux-и-навигация)
5. [Безопасность и rate limiting](#4-безопасность-и-rate-limiting)
6. [Критические баги в существующем коде](#5-критические-баги-в-существующем-коде)
7. [Implementation Plan — финальный чеклист](#implementation-plan)

---

## Overview

### Источник данных — верифицирован curl-запросом

**`https://gift-bubbles.up.railway.app/data-gifts`**

| Поле | Тип | Пример | Заметки |
|------|-----|--------|---------|
| `id` | number | 1 | порядковый |
| `name` | string | "Astral Shard" | Title Case с пробелами, НЕ PascalCase |
| `floorprice` | number | 190.9 | TON float |
| `floorprice_usd` | number | 236.53 | USD float |
| `change` | number | -0.83 | 24h % |
| `change_7d` | number | -2.0 | 7d % |
| `change_30d` | number | -2.09 | 30d % |
| `change_usd` | number | -0.83 | 24h % в USD |
| `change_7d_usd` | number | -8.43 | nullable |
| `change_30d_usd` | number\|null | -11.13 | null у 2 коллекций |
| `volume` | number | 1 | кол-во листингов по floor цене, НЕ 24h объём |
| `img_src` | string | "https://gifts.coffin.meme/astral%20shard/Ocean%20Jasper.png" | per-variant, coffin.meme CDN |

**Итого: 109 коллекций.**

**ВАЖНО — `volume` неверно интерпретирован ранее.** Значения: 1, 2, 3 — это количество активных листингов по floor цене. Лейблить как "Listings", НЕ "Volume". Иначе вводим пользователя в заблуждение.

**ВАЖНО — `img_src` нельзя использовать напрямую:**
- coffin.meme не в CSP (`img-src 'self' data: https://nft.fragment.com https://t.me https://*.t.me`)
- Нужно добавить coffin.meme в CSP ИЛИ использовать Fragment CDN
- **Решение: Fragment CDN** `https://nft.fragment.com/gift/{nameLower}-1.webp` — уже в remotePatterns, уже в проекте
- `nameLower` = `name.toLowerCase().replace(/\s+/g, '')` (пример: "Astral Shard" → "astralshard")

### Key Decisions (финальные)

| Аспект | Решение | Обоснование |
|--------|---------|-------------|
| Доступ | Публичная | floor prices = commodity |
| Роутинг | `(public)/market/` отдельный route group | bounded context |
| Рендеринг | ISR `revalidate = 300` на page.tsx | статик + автообновление, нет проблем с cold start |
| tRPC | `publicProcedure` для list, `protectedProcedure` для myPositions | |
| Кэш lib-уровень | In-memory L1 (5 мин) + Neon L2 (30 мин) | Railway засыпает |
| Rate limit | IP-based 60/60s + fail-closed Redis fix | |
| Nav коллизия | MarketShell = conditional: если session → рендерит те же navItems что dashboard | |
| Имена → маппинг | `str.toLowerCase().replace(/[\s-]/g, '')` | "Easter Egg" → "easteregg" = "EasterEgg" → "easteregg" |
| Изображения | Fragment CDN (`nft.fragment.com/gift/{nameLower}-1.webp`) | уже в CSP и remotePatterns |
| Root redirect | `/` + no session → `/market` (вместо `/login`) | acquisition funnel |
| volume label | "Listings" не "Volume" | реальный смысл поля |

---

## 1. Public vs Private и роутинг

**Решение: публичная `(public)/market/` + ISR**

**Middleware (верифицирован):** matcher = `["/", "/trades/:path*", "/analytics/:path*", "/settings/:path*", "/login"]`. Путь `/market` не в matcher — middleware не запускается. Это значит публичный `/market` работает **без единого изменения в middleware**.

**Единственное изменение в middleware:** строка 16 — `redirect("/login")` при `pathname === "/"` без сессии → заменить на `redirect("/market")`. Это меняет acquisition funnel: новый пользователь сразу видит рынок.

**ISR вместо runtime SSR для page.tsx:**
```ts
export const revalidate = 300; // 5 минут
```
Next.js строит статическую страницу при деплое и ревалидирует каждые 5 мин. Преимущества:
- Zero latency при cold start gift-bubbles — данные уже в статике
- Нет нагрузки на Railway при каждом запросе
- Проблема cold start решается на уровне рендеринга, а не только кэша

Для персонализации (данные специфичные для пользователя) — client-side `useQuery` отдельным запросом.

**Nav коллизия — решение:**

Проблема: залогиненный пользователь кликает "Market" в DashboardShell nav → попадает на `(public)/layout.tsx` → теряет DashboardShell.

Решение: MarketShell (layout для `(public)/`) получает сессию и условно рендерит навигацию:
```tsx
// src/app/(public)/layout.tsx
const session = await auth.api.getSession({ headers: await headers() });
// если session есть → рендерим ВЕСЬ dashboard nav (те же navItems)
// если session нет → минимальный header с "Sign in"
```

`navItems` выносится как shared константа в `src/lib/nav-items.ts` и импортируется и из DashboardShell, и из MarketShell.

**Структура файлов:**
```
src/
  lib/
    nav-items.ts              # shared navItems константа (NEW)
    gift-bubbles.ts           # fetch + L1 cache (NEW)
  app/
    (public)/
      layout.tsx              # MarketShell с conditional nav (NEW)
      market/
        page.tsx              # ISR, revalidate=300 (NEW)
        loading.tsx           # skeleton (NEW)
        _components/
          market-table.tsx    # TanStack Table (NEW)
          stale-banner.tsx    # показывается если данные старые (NEW)
    (dashboard)/
      _components/
        dashboard-shell.tsx   # импортирует из nav-items.ts (EDIT)
    page.tsx                  # меняем redirect для unauthenticated (EDIT)
```

---

## 2. Надёжность API и кэширование

**Решение: In-memory L1 (5 мин) + Neon L2 (30 мин)**

ISR решает проблему cold start на уровне страницы, но lib-уровень кэш нужен для tRPC персонализации и для ревалидации ISR.

**Порядок разрешения при fetch:**
1. In-memory L1 (свежее 5 мин) → немедленный возврат
2. Neon L2 (свежее 30 мин) → немедленный возврат + async revalidate gift-bubbles
3. Fetch gift-bubbles (таймаут 12 сек, inflight dedup)
4. Stale Neon L2 (любой возраст) → вернуть с `stale: true`
5. `[]` + `available: false` → UI показывает banner

**Zod-схема на основе реального ответа:**
```ts
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
  volume: z.number().int(),  // = кол-во листингов, НЕ объём
  img_src: z.string().url(), // игнорируем, используем Fragment CDN
});
```

**Новая таблица `external_cache` в schema.ts:**
```sql
external_cache(
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
```

---

## 3. UX и навигация

**Колонки таблицы (проверенные поля):**

| Колонка | Источник | Лейбл | Формат |
|---------|----------|-------|--------|
| Изображение | Fragment CDN | — | 32×32 Next/Image |
| Название | `name` | Gift | "Astral Shard" |
| Floor TON | `floorprice` | Floor | "190.9 TON" |
| Floor USD | `floorprice_usd` | USD | "$236.53" |
| 24h % | `change` | 24h | "+1.2%" зелёный/красный |
| 7d % | `change_7d` | 7d | "+3.5%" |
| Листингов | `volume` | Listings | "2" (НЕ "Volume") |

**Колонки НЕ включаем в MVP:** `change_30d`, `change_usd`, `change_7d_usd`, `change_30d_usd` — это вторичные данные, перегрузят таблицу.

**CTA для незалогиненных:** не попап, не банер-спам. Sticky строка под хедером: `"Track your P&L → Sign in with Telegram"` — одна строка, однократно.

**Root `/` для незалогиненных → `/market`** (acquisition funnel). Middleware: строка 16.

**Иконка Market в nav:** `TrendingUp` уже используется в Analytics. Используем `BarChart2` или `ShoppingCart` — проверить что не занята.

---

## 4. Безопасность и rate limiting

**Три изменения:**

**1. Fail-closed fix (`rate-limit.ts`):**
```ts
// Текущий код — тихий fail-open:
if (!limiter) return { success: true };  // ОПАСНО

// Исправление: throw при старте в production
// В createRedis(): if (prod && !env) throw new Error(...)
```

**2. `publicReadLimiter`** — новый лимитер в `rate-limit.ts`:
- 60 req / 60 sec per IP
- IP: `x-forwarded-for` первое значение (валидация regex), fallback `"public:global"`

**3. Новый `publicRateLimitedProcedure`** в `trpc.ts`:
```ts
export const publicRateLimitedProcedure = t.procedure.use(async (opts) => {
  const ip = getClientIp(opts.ctx.headers);
  const { success } = await publicReadLimiter.limit(ip);
  if (!success) throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
  return opts.next();
});
```

**CSP и images (next.config.ts):**
- Добавить `gifts.coffin.meme` в `img-src` НЕ нужно — используем Fragment CDN
- Добавить `gift-bubbles.up.railway.app` в `connect-src` — НЕ нужно (server-side fetch, CSP применяется только к browser)
- **Нужно добавить: `gift-bubbles.up.railway.app`** в `connect-src` ТОЛЬКО если будет client-side fetch (не планируем)

---

## 5. Критические баги в существующем коде (обнаружены в процессе)

### BUG-1: giftasset.pro требует API ключ — floor prices сломаны

`src/lib/floor-prices.ts` вызывает `giftasset.pro/api/v1/gifts/get_gifts_collections_marketcap`. Запрос теперь возвращает `{"code": "UNAUTHORIZED", "message": "Invalid or inactive API key"}`.

Следствие: `getFloorPrices()` возвращает `{}` для всех коллекций. Столбец Floor Price в trades таблице пуст.

**Это отдельный баг, не в скопе Market page.** Но обнаружен и должен быть зафиксирован. Требует отдельного тикета.

Потенциальные альтернативы для Stars floor prices:
- Найти другой публичный endpoint giftasset.pro (API могло измениться частично)
- Использовать gift-bubbles `floorprice` (в TON) + конвертация в Stars через exchange rate
- MRKT API или Getgems GraphQL

---

## Implementation Plan

### Phase 1: MVP (базовая страница)

- [ ] 1. Выяснить иконку для Market nav (проверить занятые иконки в dashboard-shell.tsx)
- [ ] 2. Создать `src/lib/nav-items.ts` — shared navItems константа
- [ ] 3. Обновить `src/app/(dashboard)/_components/dashboard-shell.tsx` — импортировать из nav-items, добавить Market
- [ ] 4. Создать `src/lib/gift-bubbles.ts` — fetch + Zod + in-memory cache (L1, 5 мин, inflight dedup, таймаут 12 сек, never throws)
- [ ] 5. Добавить `market.list` → `publicRateLimitedProcedure` в `src/server/api/routers/market.ts`
- [ ] 6. Создать `src/lib/rate-limit.ts` — добавить `publicReadLimiter` (60/60s IP) + fix fail-open guard
- [ ] 7. Создать `src/server/api/trpc.ts` — добавить `publicRateLimitedProcedure` с IP extraction
- [ ] 8. Создать `src/app/(public)/layout.tsx` — MarketShell (conditional nav через session)
- [ ] 9. Создать `src/app/(public)/market/page.tsx` — ISR `revalidate=300`, fetch market.list, без redirect
- [ ] 10. Создать `src/app/(public)/market/loading.tsx` — skeleton
- [ ] 11. Создать `market-table.tsx` — TanStack Table, колонки: img (Fragment CDN), name, floor TON, floor USD, 24h%, 7d%, Listings
- [ ] 12. Обновить `src/app/page.tsx` — unauthenticated → `/market` (вместо `/login`)
- [ ] 13. Обновить `next.config.ts` — добавить `robots: index: true` override для (public) (через metadata в layout)
- [ ] 14. Запустить `npx tsc --noEmit && npm run lint && npm test && npm run build`

### Phase 2: Reliability (Neon L2 кэш)

- [ ] 15. Добавить таблицу `external_cache` в `src/server/db/schema.ts`
- [ ] 16. `npx drizzle-kit generate && npx drizzle-kit push`
- [ ] 17. Обновить `src/lib/gift-bubbles.ts` — добавить L2 Neon (read при cold start, write после fetch)
- [ ] 18. Создать `stale-banner.tsx` — banner если `stale: true` в ответе
- [ ] 19. Верификационная цепочка

### Phase 3: Персонализация (после Phase 1+2)

- [ ] 20. Определить маппинг: `giftBubblesName.toLowerCase().replace(/[\s-]/g, '')` ↔ `giftName.toLowerCase()`
- [ ] 21. Добавить `market.myPositions` → `protectedProcedure` — GROUP BY giftName, возвращает {count, avgBuyPrice, unrealizedPnl}
- [ ] 22. В market page — client-side `useQuery` для myPositions (только если залогинен)
- [ ] 23. Market table — overlay колонка "My Positions" для залогиненных

### Отдельный тикет (не в скопе Market page)

- [ ] BUG-1: Исследовать и починить `src/lib/floor-prices.ts` — giftasset.pro требует API ключ

---

## Зависимости и риски

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| gift-bubbles Railway засыпает | Высокая | L2 Neon кэш + ISR статика |
| gift-bubbles меняет формат ответа | Средняя | Zod с `.passthrough()`, graceful fallback |
| Railway не пробрасывает x-forwarded-for | Средняя | Fallback на `"public:global"` global limiter |
| name маппинг не совпадает для новых коллекций | Низкая | Логировать промахи, добавлять в таблицу маппинга |
| Fragment CDN недоступен | Низкая | `<img>` fallback с placeholder |
| ISR revalidation зависает при gift-bubbles cold start | Средняя | 12 сек таймаут, Next.js показывает последний успешный билд |
