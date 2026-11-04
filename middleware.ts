import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic edge guard: redirects to /login when no Better Auth session cookie exists.
 * The real check (session validated against the DB) happens in app/workspace/layout.tsx
 * and in every server action / route via requireUserId().
 */
export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/workspace", "/workspace/:path*"] };
