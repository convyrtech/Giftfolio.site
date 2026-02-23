import { router, createCallerFactory } from "./trpc";
import { tradesRouter } from "./routers/trades";
import { settingsRouter } from "./routers/settings";
import { giftsRouter } from "./routers/gifts";
import { statsRouter } from "./routers/stats";
import { marketRouter } from "./routers/market";

export const appRouter = router({
  trades: tradesRouter,
  settings: settingsRouter,
  gifts: giftsRouter,
  stats: statsRouter,
  market: marketRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
