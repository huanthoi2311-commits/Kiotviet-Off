'use client';

import { useEffect, useRef, useState } from 'react';
import { refreshAccessToken } from '@/services/api-client';
import { CoordinationTimeoutError, requestCoordinatedRefresh } from '@/services/auth-coordination';
import { useAuthStore } from '@/stores/auth-store';

/**
 * `restore-error` (T031.08A) is distinct from `unauthenticated`: it means
 * cross-tab coordination never converged in time (another tab's refresh
 * completed, but its broadcast result never arrived) — the backend has not
 * told us the session is actually invalid. Callers must not treat this the
 * same as a confirmed logged-out state (no redirect to `/login`); a later
 * retry starts a fresh, fully-coordinated attempt (requirement 4).
 */
export type SessionRestoreStatus = 'restoring' | 'restored' | 'unauthenticated' | 'restore-error';

/**
 * Silent session restoration on app load (SPEC-T031 FR2, §9 step 2): if no
 * in-memory access token exists, attempt a coordinated refresh before any
 * protected content renders. Never calls `/auth/refresh` directly — always
 * through the cross-tab coordination layer (§12), matching FR10.
 */
export function useSessionRestore(): SessionRestoreStatus {
  const accessToken = useAuthStore((state) => state.accessToken);
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const [status, setStatus] = useState<SessionRestoreStatus>(
    accessToken ? 'restored' : 'restoring',
  );
  const attempted = useRef(false);

  useEffect(() => {
    if (accessToken || attempted.current) {
      return;
    }
    attempted.current = true;

    requestCoordinatedRefresh(refreshAccessToken, () => useAuthStore.getState().accessToken)
      .then((token) => {
        setAccessToken(token);
        setStatus('restored');
      })
      .catch((error: unknown) => {
        // A CoordinationTimeoutError is not a backend-reported failure — do not
        // restore a stale token, but do not claim "unauthenticated" either
        // (T031.08A requirement 3).
        setStatus(error instanceof CoordinationTimeoutError ? 'restore-error' : 'unauthenticated');
      });
  }, [accessToken, setAccessToken]);

  return accessToken ? 'restored' : status;
}
