/**
 * UX-only JWT payload decode — no signature verification (SPEC-T031 §10).
 * The decoded claims are a hint for client-side rendering only; every real
 * authorization decision is re-validated server-side on each request.
 * Mirrors backend `JwtAccessPayload` (backend/src/common/types/jwt-payload.type.ts).
 */
export interface AccessTokenClaims {
  sub: string;
  organizationId: string;
  branchId: string | null;
  email: string;
  permissions: string[];
  /** Compared against User.permissionVersion server-side — a stale value here just means a UX hint is out of date. */
  permissionVersion: number;
  isPlatformAdmin: boolean;
  exp: number;
  iat: number;
  [claim: string]: unknown;
}

function base64UrlDecode(segment: string): string {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return atob(padded);
}

export function decodeJwt(token: string): AccessTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = base64UrlDecode(parts[1]);
    return JSON.parse(payload) as AccessTokenClaims;
  } catch {
    return null;
  }
}
