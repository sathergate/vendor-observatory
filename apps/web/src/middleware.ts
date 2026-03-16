import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];
const PUBLIC_PREFIXES = [
  "/api/auth/",
  "/api/health",
  "/api/onboard/",
  "/api/stripe/",
  "/_next/",
  "/favicon.ico",
  "/get-started",
  "/plans",
  "/payment",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Check for session cookie — legacy token OR Auth.js session
  const legacyToken = request.cookies.get("session_token")?.value;
  const authjsToken =
    request.cookies.get("authjs.session-token")?.value ??
    request.cookies.get("__Secure-authjs.session-token")?.value;

  if (!legacyToken && !authjsToken) {
    // API routes get 401; pages get redirected to login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
