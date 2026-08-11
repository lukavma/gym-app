import { NextResponse, type NextRequest } from "next/server";
import { touchSessionInMiddleware } from "@/server/auth/edgeSession";

const PUBLIC_PATHS = new Set(["/login", "/setup"]);
const PUBLIC_PATH_PREFIXES = ["/api/auth/login", "/api/auth/setup", "/api/health", "/icons"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  const authenticated = await touchSessionInMiddleware(request, response);
  if (!authenticated) {
    // API routes are consumed by the app's own fetch client, never a
    // browser navigation — an HTML redirect would just hand back a login
    // page body where JSON was expected. UI routes redirect to /login;
    // everything else (all protected API routes) gets a plain 401.
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return response;
}

export const config = {
  // Everything except Next.js internals, the manifest, and the service
  // worker — those must load unauthenticated for the app shell to install.
  matcher: ["/((?!_next/static|_next/image|manifest.webmanifest|sw.js|favicon.ico).*)"],
};
