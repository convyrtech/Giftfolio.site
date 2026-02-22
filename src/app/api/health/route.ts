export const runtime = "nodejs";

export function GET(): Response {
  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  });
}
