import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic cookie-based auth check.
 *
 * Only verifies cookie existence — fast, no DB hit.
 * Actual authorization is enforced per-route via tRPC protectedProcedure.
 */
export async function middleware(request: NextRequest): Promise<NextResponse> {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  // Root → redirect based on auth state
  if (pathname === "/") {
    if (sessionCookie) return NextResponse.redirect(new URL("/trades", request.url));
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated user hitting login → redirect to trades
  if (sessionCookie && pathname === "/login") {
    return NextResponse.redirect(new URL("/trades", request.url));
  }

  // Allow login page for unauthenticated users (avoid redirect loop)
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Unauthenticated user hitting protected routes → redirect to login
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/trades/:path*", "/analytics/:path*", "/settings/:path*", "/login"],
};
