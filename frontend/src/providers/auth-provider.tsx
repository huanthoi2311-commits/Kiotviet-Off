'use client';

import { useEffect } from 'react';
import { subscribeToAuthEvents } from '@/services/auth-coordination';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Keeps the Auth Store in sync with cross-tab coordination events
 * (SPEC-T031 §12/§30): a token refreshed in one tab, or a logout triggered
 * in one tab, is reflected here in every other open tab.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const clear = useAuthStore((state) => state.clear);

  useEffect(() => {
    return subscribeToAuthEvents((message) => {
      switch (message.type) {
        case 'token-updated':
          setAccessToken(message.accessToken);
          break;
        case 'logout':
        case 'refresh-failed':
          clear();
          break;
      }
    });
  }, [setAccessToken, clear]);

  return <>{children}</>;
}
