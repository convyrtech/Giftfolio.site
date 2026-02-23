import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";

export const runtime = "nodejs";

const MAX_BATCH_SIZE = 10;

const handler = (req: Request): Promise<Response> | Response => {
  // Limit batch size: tRPC batches arrive as comma-separated paths
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/trpc/", "");
  const procedureCount = path.split(",").length;
  if (procedureCount > MAX_BATCH_SIZE) {
    return Response.json(
      { error: { message: `Batch size ${procedureCount} exceeds limit of ${MAX_BATCH_SIZE}` } },
      { status: 413 },
    );
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
  });
};

export { handler as GET, handler as POST };
