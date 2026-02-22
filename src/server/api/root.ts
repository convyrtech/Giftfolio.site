import { router, createCallerFactory, publicProcedure } from "./trpc";

export const appRouter = router({
  // Health check procedure (also validates tRPC is working)
  health: publicProcedure.query(() => ({ status: "ok" as const })),
  // Domain routers will be added in Phase 2-4:
  // trades: tradesRouter,
  // auth: authRouter,
  // gifts: giftsRouter,
  // stats: statsRouter,
  // market: marketRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
