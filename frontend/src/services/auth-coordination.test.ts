import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestCoordinatedRefresh } from './auth-coordination';

const MUTEX_KEY = 'pos-erp-auth-refresh-mutex';

describe('requestCoordinatedRefresh — localStorage-mutex fallback (no navigator.locks)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('N concurrent refresh requests produce exactly one real refresh call', async () => {
    let currentToken: string | null = null;
    const getCurrentToken = () => currentToken;
    const newToken = 'new-token';
    // A genuine `await` before the store update matters here: it mirrors the real
    // `refreshAccessToken()`'s network round-trip, giving both callers a chance to
    // capture `tokenBeforeWait` before either sees the update — a synchronous mock
    // would let call 2 start after call 1 already (synchronously) wrote the new
    // token, which is not representative of real concurrent-tab timing.
    const refreshFn = vi.fn(async () => {
      await Promise.resolve();
      currentToken = newToken;
      return newToken;
    });

    const call1 = requestCoordinatedRefresh(refreshFn, getCurrentToken);
    const call2 = requestCoordinatedRefresh(refreshFn, getCurrentToken);

    // Same-window `localStorage` writes never self-fire a `storage` event (DOM spec) —
    // a real second tab would receive one when call 1 releases the mutex, so simulate it.
    await vi.waitFor(() => expect(window.localStorage.getItem(MUTEX_KEY)).toBeNull());
    window.dispatchEvent(new StorageEvent('storage', { key: MUTEX_KEY, newValue: null }));

    const [token1, token2] = await Promise.all([call1, call2]);

    expect(refreshFn).toHaveBeenCalledOnce();
    expect(token1).toBe(newToken);
    expect(token2).toBe(newToken);
  });
});

describe('requestCoordinatedRefresh — Web Locks primary path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubSerializingLockManager() {
    let queue: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, callback: () => Promise<unknown>) => {
          const runAfterPrevious = queue.then(callback, callback);
          queue = runAfterPrevious.catch(() => undefined);
          return runAfterPrevious;
        },
      },
    });
  }

  it('N concurrent refresh requests produce exactly one real refresh call (FR10)', async () => {
    stubSerializingLockManager();

    let currentToken: string | null = null;
    const getCurrentToken = () => currentToken;
    const newToken = 'new-token';
    const refreshFn = vi.fn(async () => {
      currentToken = newToken;
      return newToken;
    });

    const [token1, token2, token3] = await Promise.all([
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
    ]);

    expect(refreshFn).toHaveBeenCalledOnce();
    expect(token1).toBe(newToken);
    expect(token2).toBe(newToken);
    expect(token3).toBe(newToken);
  });

  it('propagates a refresh failure to every waiting caller (no caller hangs or silently succeeds)', async () => {
    stubSerializingLockManager();

    // Token-comparison de-duplication (the mechanism the success test above relies on)
    // only applies once a *new* token exists to detect — a failed refresh leaves nothing
    // to detect, so each waiter's own attempt independently fails. What matters here is
    // that every caller resolves to a rejection; not that refreshFn is called exactly once.
    const getCurrentToken = () => null;
    const refreshFn = vi.fn(async () => {
      throw new Error('refresh failed');
    });

    const results = await Promise.allSettled([
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
    ]);

    expect(refreshFn).toHaveBeenCalled();
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });
});
