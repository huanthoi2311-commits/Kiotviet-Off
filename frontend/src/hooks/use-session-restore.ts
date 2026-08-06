'use client';

import { useEffect, useRef, useState } from 'react';
import { refreshAccessToken } from '@/services/api-client';
import { requestCoordinatedRefresh } from '@/services/auth-coordination';
import { useAuthStore } from '@/stores/auth-store';

export type SessionRestoreStatus = 'restoring' | 'restored' | 'unauthenticated';

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
      .catch(() => {
        setStatus('unauthenticated');
      });
  }, [accessToken, setAccessToken]);

  return accessToken ? 'restored' : status;
}
