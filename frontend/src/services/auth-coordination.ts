import { hasWebLocks } from '@/utils/browser-capability';

const LOCK_NAME = 'pos-erp-auth-refresh-lock';
/** Exported so tests can observe it via an independent BroadcastChannel instance, simulating another tab. */
export const CHANNEL_NAME = 'pos-erp-auth-coordination';
const FALLBACK_BROADCAST_KEY = 'pos-erp-auth-coordination-message';
const MUTEX_KEY = 'pos-erp-auth-refresh-mutex';
const MUTEX_STALE_MS = 10_000;

/**
 * Opaque cross-tab coordination marker (T031.08) — never the access token,
 * refresh token, or any user/permission/organization data (SPEC-T031 NFR2/
 * NFR3, this package's binding security invariants). Exists solely to let a
 * tab that has just acquired the lock/mutex answer one question
 * *synchronously and race-free*: "did a refresh cycle complete since I
 * started waiting?" `localStorage` reads/writes are synchronous and
 * immediately consistent within the same browser profile, unlike
 * `BroadcastChannel` delivery, which is asynchronous and has no ordering
 * guarantee relative to Web Lock release — that gap was the root cause of
 * T031.07's finding (two real `/auth/refresh` calls observed in CI).
 */
const GENERATION_KEY = 'pos-erp-auth-refresh-generation';
/** Bounds how long a real `refreshFn()` attempt may run before the lock/mutex is force-released. */
const REFRESH_ATTEMPT_TIMEOUT_MS = 8_000;
/** Bounds how long a tab waits for another tab's already-completed result to arrive via broadcast. */
const BROADCAST_WAIT_TIMEOUT_MS = 5_000;

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

interface RefreshGeneration {
  /** A random cycle id — opaque, carries no meaning beyond "same cycle or not." */
  id: string;
  status: 'completed' | 'failed';
  completedAt: number;
}

function readGeneration(): RefreshGeneration | null {
  const raw = window.localStorage.getItem(GENERATION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as RefreshGeneration;
  } catch {
    return null;
  }
}

function writeGeneration(status: RefreshGeneration['status']): void {
  const record: RefreshGeneration = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status,
    completedAt: Date.now(),
  };
  window.localStorage.setItem(GENERATION_KEY, JSON.stringify(record));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeoutId);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Performs the real refresh attempt and stamps the outcome as a new
 * generation *before* broadcasting it — so any tab that acquires the
 * lock/mutex afterward is guaranteed (by `localStorage`'s synchronous,
 * immediately-consistent semantics) to see this generation, never a stale
 * one, regardless of how quickly it acquires next.
 */
async function performAndStampRefresh(refreshFn: () => Promise<string>): Promise<string> {
  try {
    const newToken = await withTimeout(
      refreshFn(),
      REFRESH_ATTEMPT_TIMEOUT_MS,
      'Refresh attempt timed out',
    );
    writeGeneration('completed');
    broadcastTokenUpdated(newToken);
    return newToken;
  } catch (error) {
    writeGeneration('failed');
    broadcastRefreshFailed();
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Distinguishes "no message arrived in time" (recoverable — the caller may
 * reasonably become the refresher itself) from "a message arrived and it was
 * a definitive negative outcome" (must propagate, never silently retried —
 * a logout or a peer's failure is not a signal to try again).
 */
class BroadcastWaitTimeoutError extends Error {}

/** Waits for the specific broadcast outcome of a refresh cycle already known to be in flight/done. */
function waitForBroadcastResult(timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(new BroadcastWaitTimeoutError('Timed out waiting for cross-tab refresh result'));
    }, timeoutMs);

    const unsubscribe = subscribeToAuthEvents((message) => {
      if (settled) return;
      if (message.type === 'token-updated') {
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        resolve(message.accessToken);
      } else if (message.type === 'refresh-failed' || message.type === 'logout') {
        settled = true;
        clearTimeout(timeoutId);
        unsubscribe();
        reject(new Error(`Cross-tab refresh did not succeed (${message.type})`));
      }
    });
  });
}

/**
 * The single decision point shared by both the Web-Locks and localStorage-mutex
 * paths, run once a tab holds exclusive access (lock acquired, or mutex just
 * acquired/observed released): become the refresher, or converge on another
 * tab's already-in-flight-or-just-completed result — race-free, because the
 * generation check is a synchronous `localStorage` read (T031.08).
 */
async function resolveOrRefresh(
  refreshFn: () => Promise<string>,
  getCurrentToken: () => string | null,
  tokenBeforeWait: string | null,
  generationBeforeWaitId: string | null,
): Promise<string> {
  const currentGeneration = readGeneration();
  const newerGenerationExists =
    currentGeneration !== null && currentGeneration.id !== generationBeforeWaitId;

  if (!newerGenerationExists) {
    return performAndStampRefresh(refreshFn);
  }

  // Fast path: our own store may already reflect it if the broadcast beat us here.
  const maybeAlready = getCurrentToken();
  if (maybeAlready && maybeAlready !== tokenBeforeWait) {
    return maybeAlready;
  }

  if (currentGeneration.status === 'failed') {
    throw new Error('Refresh failed in another tab');
  }

  try {
    return await waitForBroadcastResult(BROADCAST_WAIT_TIMEOUT_MS);
  } catch (error) {
    if (!(error instanceof BroadcastWaitTimeoutError)) {
      // A definitive negative outcome arrived (another tab's refresh failed, or an
      // explicit logout happened while we were waiting) — must propagate, never
      // silently retried (a logout must not be masked by a stale successful token).
      throw error;
    }
    // Recovery bound (never permanently block refresh): the other tab's success
    // message never arrived within the window — vanishingly rare under real
    // BroadcastChannel delivery (near-instant), but if it happens, become the
    // refresher ourselves rather than hang. Disclosed trade-off, not silently
    // masked: this is the one path where two real calls remain theoretically
    // possible, bounded to this timeout window only.
    return performAndStampRefresh(refreshFn);
  }
}

function requestRefreshViaLocalStorageMutex(
  refreshFn: () => Promise<string>,
  getCurrentToken: () => string | null,
  tokenBeforeWait: string | null,
  generationBeforeWaitId: string | null,
): Promise<string> {
  const holderId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const tryAcquire = () => {
      const raw = window.localStorage.getItem(MUTEX_KEY);
      const existing = raw ? (JSON.parse(raw) as { holderId: string; startedAt: number }) : null;
      const isStale = existing !== null && Date.now() - existing.startedAt > MUTEX_STALE_MS;

      if (existing && !isStale) {
        const onRelease = (event: StorageEvent) => {
          if (event.key !== MUTEX_KEY || event.newValue !== null) {
            return;
          }
          window.removeEventListener('storage', onRelease);
          resolveOrRefresh(
            refreshFn,
            getCurrentToken,
            tokenBeforeWait,
            generationBeforeWaitId,
          ).then(resolve, reject);
        };
        window.addEventListener('storage', onRelease);
        return;
      }

      window.localStorage.setItem(MUTEX_KEY, JSON.stringify({ holderId, startedAt: Date.now() }));

      // Re-read to confirm this tab actually won the race (last write wins across tabs).
      const confirmRaw = window.localStorage.getItem(MUTEX_KEY);
      const confirmed = confirmRaw
        ? (JSON.parse(confirmRaw) as { holderId: string; startedAt: number })
        : null;
      if (confirmed?.holderId !== holderId) {
        tryAcquire();
        return;
      }

      resolveOrRefresh(refreshFn, getCurrentToken, tokenBeforeWait, generationBeforeWaitId)
        .then((token) => {
          window.localStorage.removeItem(MUTEX_KEY);
          resolve(token);
        })
        .catch((error: unknown) => {
          window.localStorage.removeItem(MUTEX_KEY);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    };

    tryAcquire();
  });
}

/**
 * Coordinates `/auth/refresh` across tabs so that N tabs racing near-simultaneously
 * produce exactly one real HTTP call (SPEC-T031 §12, FR10). `refreshFn` performs the
 * actual network call; `getCurrentToken` reads the caller's live access token, used
 * only as a fast-path optimization — correctness comes from the generation marker
 * (T031.08), not from this value's timing.
 */
export async function requestCoordinatedRefresh(
  refreshFn: () => Promise<string>,
  getCurrentToken: () => string | null,
): Promise<string> {
  const tokenBeforeWait = getCurrentToken();
  const generationBeforeWaitId = readGeneration()?.id ?? null;

  if (!hasWebLocks()) {
    return requestRefreshViaLocalStorageMutex(
      refreshFn,
      getCurrentToken,
      tokenBeforeWait,
      generationBeforeWaitId,
    );
  }

  return navigator.locks.request(LOCK_NAME, () =>
    resolveOrRefresh(refreshFn, getCurrentToken, tokenBeforeWait, generationBeforeWaitId),
  );
}
