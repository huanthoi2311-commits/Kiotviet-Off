import { NextResponse, type NextRequest } from 'next/server';

const REFRESH_COOKIE_NAME = 'refresh_token';
const AUTH_ROUTE_PREFIXES = ['/login', '/forgot-password'];
const DEFAULT_AUTHENTICATED_ROUTE = '/dashboard';
const DEFAULT_UNAUTHENTICATED_ROUTE = '/login';

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * UX-level routing only (SPEC-T031 §23) — checks the mere presence of the
 * `refresh_token` cookie, never its content. This is NOT a security
 * boundary: no token is validated here, and no permission is checked. Real
 * enforcement happens per-request on the backend (`jwt-access.strategy.ts`).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = request.cookies.has(REFRESH_COOKIE_NAME);
  const onAuthRoute = isAuthRoute(pathname);

  if (!hasSessionCookie && !onAuthRoute && pathname !== '/') {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_UNAUTHENTICATED_ROUTE;
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && onAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_AUTHENTICATED_ROUTE;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
