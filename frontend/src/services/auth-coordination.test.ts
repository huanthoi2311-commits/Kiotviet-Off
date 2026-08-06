import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHANNEL_NAME, requestCoordinatedRefresh } from './auth-coordination';

const MUTEX_KEY = 'pos-erp-auth-refresh-mutex';
const GENERATION_KEY = 'pos-erp-auth-refresh-generation';

function seedCompletedGeneration(id: string) {
  window.localStorage.setItem(
    GENERATION_KEY,
    JSON.stringify({ id, status: 'completed', completedAt: Date.now() }),
  );
}

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

  it('a tab that observes the mutex released, but whose own store has not caught up, waits for the broadcast instead of refreshing again (T031.08 race, mutex path)', async () => {
    const refreshFnB = vi.fn(async () => 'should-never-be-called');
    const getCurrentTokenB = () => null;

    // Simulate an in-progress holder (a real other tab) by writing the mutex record
    // directly — requestCoordinatedRefresh below will queue behind it.
    window.localStorage.setItem(
      MUTEX_KEY,
      JSON.stringify({ holderId: 'tab-a-holder', startedAt: Date.now() }),
    );

    const resultPromise = requestCoordinatedRefresh(refreshFnB, getCurrentTokenB);

    // "Tab A" finishes: stamps the generation, releases the mutex.
    seedCompletedGeneration('tab-a-generation');
    window.localStorage.removeItem(MUTEX_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: MUTEX_KEY, newValue: null }));

    // Yield so Tab B's release handler runs and subscribes to the broadcast channel
    // before "Tab A" (an independent channel instance — a real tab's channel object
    // never self-delivers, so a second in-process call couldn't observe this
    // module's own broadcasts either) delivers its result.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const otherTabChannel = new BroadcastChannel(CHANNEL_NAME);
    otherTabChannel.postMessage({ type: 'token-updated', accessToken: 'token-from-tab-a' });
    otherTabChannel.close();

    const result = await resultPromise;

    expect(refreshFnB).not.toHaveBeenCalled();
    expect(result).toBe('token-from-tab-a');
  });

  it('never writes the access token value to localStorage during a refresh cycle (NFR2)', async () => {
    const secretToken = 'super-secret-access-token-value';
    const refreshFn = vi.fn(async () => secretToken);
    const getCurrentToken = () => null;

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const result = await requestCoordinatedRefresh(refreshFn, getCurrentToken);

    expect(result).toBe(secretToken);
    for (const [, value] of setItemSpy.mock.calls) {
      expect(value).not.toContain(secretToken);
    }

    setItemSpy.mockRestore();
  });
});

describe('requestCoordinatedRefresh — Web Locks primary path', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
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

  it('4 concurrent tabs produce exactly one real refresh call, and every tab receives the same token', async () => {
    stubSerializingLockManager();

    let currentToken: string | null = null;
    const getCurrentToken = () => currentToken;
    const newToken = 'new-token';
    const refreshFn = vi.fn(async () => {
      currentToken = newToken;
      return newToken;
    });

    const results = await Promise.all([
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
    ]);

    expect(refreshFn).toHaveBeenCalledOnce();
    for (const token of results) {
      expect(token).toBe(newToken);
    }
  });

  it('does not call refresh again when it acquires the lock before its own broadcast listener has caught up (T031.08 race)', async () => {
    stubSerializingLockManager();

    let releaseBlocker!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    // Occupy the lock queue first, so requestCoordinatedRefresh's own lock request
    // below is queued behind it — simulating this tab still waiting for the lock
    // while "Tab A" (below) completes its own refresh cycle.
    void navigator.locks.request('blocker', () => blocker);

    const refreshFnB = vi.fn(async () => 'should-never-be-called');
    const getCurrentTokenB = () => null; // Tab B's own store never reflects the update in this test.

    const resultPromise = requestCoordinatedRefresh(refreshFnB, getCurrentTokenB);

    // "Tab A" stamps the generation exactly as performAndStampRefresh does — but
    // Tab B hasn't acquired the lock yet, so it can't have observed this.
    seedCompletedGeneration('tab-a-generation');

    releaseBlocker();
    // Yield so Tab B's lock callback runs and registers its broadcast listener
    // before "Tab A" delivers its result from an independent channel instance.
    await new Promise((resolve) => setTimeout(resolve, 0));

    const otherTabChannel = new BroadcastChannel(CHANNEL_NAME);
    otherTabChannel.postMessage({ type: 'token-updated', accessToken: 'token-from-tab-a' });
    otherTabChannel.close();

    const result = await resultPromise;

    expect(refreshFnB).not.toHaveBeenCalled();
    expect(result).toBe('token-from-tab-a');
  });

  it('propagates a refresh failure to every waiting caller with exactly one real attempt', async () => {
    stubSerializingLockManager();

    const getCurrentToken = () => null;
    const refreshFn = vi.fn(async () => {
      throw new Error('refresh failed');
    });

    const results = await Promise.allSettled([
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
      requestCoordinatedRefresh(refreshFn, getCurrentToken),
    ]);

    // Unlike the pre-T031.08 behavior, a waiter that observes a *failed* generation
    // rejects immediately rather than attempting its own refresh — so this is now
    // guaranteed exactly once, not merely "called".
    expect(refreshFn).toHaveBeenCalledOnce();
    expect(results[0].status).toBe('rejected');
    expect(results[1].status).toBe('rejected');
  });

  it('a logout broadcast while waiting for another tab does not resolve with a stale token (T031.08)', async () => {
    stubSerializingLockManager();

    let releaseBlocker!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    void navigator.locks.request('blocker', () => blocker);

    const refreshFnB = vi.fn(async () => 'should-never-be-called');
    const getCurrentTokenB = () => null;

    const resultPromise = requestCoordinatedRefresh(refreshFnB, getCurrentTokenB);

    seedCompletedGeneration('tab-a-generation');
    releaseBlocker();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const otherTabChannel = new BroadcastChannel(CHANNEL_NAME);
    otherTabChannel.postMessage({ type: 'logout' });
    otherTabChannel.close();

    await expect(resultPromise).rejects.toThrow();
    expect(refreshFnB).not.toHaveBeenCalled();
  });

  it('a hung refresh attempt times out, releasing the lock so a subsequent attempt can recover', async () => {
    vi.useFakeTimers();
    stubSerializingLockManager();

    const hangingRefreshFn = vi.fn(() => new Promise<string>(() => {}));
    const getCurrentToken = () => null;

    const firstAttempt = requestCoordinatedRefresh(hangingRefreshFn, getCurrentToken);
    const firstAttemptOutcome = firstAttempt.then(
      () => 'resolved',
      () => 'rejected',
    );

    await vi.advanceTimersByTimeAsync(9_000); // past the 8s refresh-attempt timeout

    expect(await firstAttemptOutcome).toBe('rejected');

    // Recovery: the timed-out holder released the lock — a subsequent attempt is
    // not permanently blocked (requirement: crashed/hung tab must not block refresh).
    const recoveryToken = 'recovered-token';
    const recoveryRefreshFn = vi.fn(async () => recoveryToken);
    const recovered = await requestCoordinatedRefresh(recoveryRefreshFn, getCurrentToken);

    expect(recoveryRefreshFn).toHaveBeenCalledOnce();
    expect(recovered).toBe(recoveryToken);
  });

  it('never writes the access token value to localStorage during a refresh cycle (NFR2)', async () => {
    stubSerializingLockManager();

    const secretToken = 'super-secret-access-token-value';
    const refreshFn = vi.fn(async () => secretToken);
    const getCurrentToken = () => null;

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    const result = await requestCoordinatedRefresh(refreshFn, getCurrentToken);

    expect(result).toBe(secretToken);
    for (const [, value] of setItemSpy.mock.calls) {
      expect(value).not.toContain(secretToken);
    }

    setItemSpy.mockRestore();
  });
});
