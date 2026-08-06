import { create } from 'zustand';
import { decodeJwt, type AccessTokenClaims } from '@/utils/decode-jwt';

interface AuthState {
  accessToken: string | null;
  claims: AccessTokenClaims | null;
  isAuthenticated: boolean;
  setAccessToken: (token: string) => void;
  clear: () => void;
}

/**
 * Access token lives here only — memory, never localStorage/sessionStorage
 * (SPEC-T031 NFR2, SR1). The refresh token is never held by frontend JS at
 * all (SPEC-T031 NFR3, SR2); this store has no field for it.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  claims: null,
  isAuthenticated: false,
  setAccessToken: (token) =>
    set({
      accessToken: token,
      claims: decodeJwt(token),
      isAuthenticated: true,
    }),
  clear: () =>
    set({
      accessToken: null,
      claims: null,
      isAuthenticated: false,
    }),
}));
