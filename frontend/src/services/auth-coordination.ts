import { hasWebLocks } from '@/utils/browser-capability';

const LOCK_NAME = 'pos-erp-auth-refresh-lock';
const CHANNEL_NAME = 'pos-erp-auth-coordination';
const FALLBACK_BROADCAST_KEY = 'pos-erp-auth-coordination-message';
const MUTEX_KEY = 'pos-erp-auth-refresh-mutex';
const MUTEX_STALE_MS = 10_000;

export type CoordinationMessage =
  { type: 'token-updated'; accessToken: string } | { type: 'logout' } | { type: 'refresh-failed' };

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
    return null;
  }
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

function publish(message: CoordinationMessage): void {
  const ch = getChannel();
  if (ch) {
    ch.postMessage(message);
    return;
  }
  // localStorage fallback: write-then-remove so a repeated message still fires a `storage` event.
  window.localStorage.setItem(FALLBACK_BROADCAST_KEY, JSON.stringify(message));
  window.localStorage.removeItem(FALLBACK_BROADCAST_KEY);
}

/** Never publishes the refresh token — it is never in a tab's possession (SPEC-T031 SR5). */
export function broadcastTokenUpdated(accessToken: string): void {
  publish({ type: 'token-updated', accessToken });
}

export function broadcastLogout(): void {
  publish({ type: 'logout' });
}

export function broadcastRefreshFailed(): void {
  publish({ type: 'refresh-failed' });
}

export function subscribeToAuthEvents(handler: (message: CoordinationMessage) => void): () => void {
  const ch = getChannel();
  if (ch) {
    const listener = (event: MessageEvent<CoordinationMessage>) => handler(event.data);
    ch.addEventListener('message', listener);
    return () => ch.removeEventListener('message', listener);
  }

  const listener = (event: StorageEvent) => {
    if (event.key !== FALLBACK_BROADCAST_KEY || !event.newValue) {
      return;
    }
    try {
      handler(JSON.parse(event.newValue) as CoordinationMessage);
    } catch {
      // Malformed payload from a foreign write to this key — ignore.
    }
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}

interface MutexRecord {
  holderId: string;
  startedAt: number;
}

function requestRefreshViaLocalStorageMutex(
  refreshFn: () => Promise<string>,
  getCurrentToken: () => string | null,
  tokenBeforeWait: string | null,
): Promise<string> {
  const holderId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const tryAcquire = () => {
      const raw = window.localStorage.getItem(MUTEX_KEY);
      const existing = raw ? (JSON.parse(raw) as MutexRecord) : null;
      const isStale = existing !== null && Date.now() - existing.startedAt > MUTEX_STALE_MS;

      if (existing && !isStale) {
        const onRelease = (event: StorageEvent) => {
          if (event.key !== MUTEX_KEY || event.newValue !== null) {
            return;
          }
          window.removeEventListener('storage', onRelease);
          const latest = getCurrentToken();
          if (latest && latest !== tokenBeforeWait) {
            resolve(latest);
          } else {
            tryAcquire();
          }
        };
        window.addEventListener('storage', onRelease);
        return;
      }

      window.localStorage.setItem(MUTEX_KEY, JSON.stringify({ holderId, startedAt: Date.now() }));

      // Re-read to confirm this tab actually won the race (last write wins across tabs).
      const confirmRaw = window.localStorage.getItem(MUTEX_KEY);
      const confirmed = confirmRaw ? (JSON.parse(confirmRaw) as MutexRecord) : null;
      if (confirmed?.holderId !== holderId) {
        tryAcquire();
        return;
      }

      refreshFn()
        .then((newToken) => {
          window.localStorage.removeItem(MUTEX_KEY);
          broadcastTokenUpdated(newToken);
          resolve(newToken);
        })
        .catch((error: unknown) => {
          window.localStorage.removeItem(MUTEX_KEY);
          broadcastRefreshFailed();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    };

    tryAcquire();
  });
}

/**
 * Coordinates `/auth/refresh` across tabs so that N tabs racing near-simultaneously
 * produce exactly one real HTTP call (SPEC-T031 §12, FR10). `refreshFn` performs the
 * actual network call; `getCurrentToken` reads the caller's live access token so a
 * tab that only just started waiting can detect a concurrent refresh from another tab
 * and skip its own call.
 */
export async function requestCoordinatedRefresh(
  refreshFn: () => Promise<string>,
  getCurrentToken: () => string | null,
): Promise<string> {
  const tokenBeforeWait = getCurrentToken();

  if (!hasWebLocks()) {
    return requestRefreshViaLocalStorageMutex(refreshFn, getCurrentToken, tokenBeforeWait);
  }

  return navigator.locks.request(LOCK_NAME, async () => {
    const tokenAfterLockAcquired = getCurrentToken();
    if (tokenAfterLockAcquired && tokenAfterLockAcquired !== tokenBeforeWait) {
      return tokenAfterLockAcquired;
    }

    try {
      const newToken = await refreshFn();
      broadcastTokenUpdated(newToken);
      return newToken;
    } catch (error) {
      broadcastRefreshFailed();
      throw error;
    }
  });
}
