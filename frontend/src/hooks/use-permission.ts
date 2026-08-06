import { useAuthStore } from '@/stores/auth-store';

/**
 * Reads `permissions[]` from the currently-decoded access token — no network
 * round-trip (SPEC-T031 §10). This is a UX hint only: every underlying API
 * call remains independently enforced server-side regardless of this result.
 */
export function usePermission(code: string): boolean {
  return useAuthStore((state) => state.claims?.permissions.includes(code) ?? false);
}

/** Reads `isPlatformAdmin` from the decoded token (SPEC-T031 FR6) — not a permission code. */
export function useIsPlatformAdmin(): boolean {
  return useAuthStore((state) => state.claims?.isPlatformAdmin ?? false);
}
