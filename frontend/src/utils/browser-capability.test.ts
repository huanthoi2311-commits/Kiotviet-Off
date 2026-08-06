import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasBroadcastChannel, hasCoordinationPrimitives, hasWebLocks } from './browser-capability';

describe('browser-capability', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects navigator.locks when present', () => {
    vi.stubGlobal('navigator', { locks: {} });
    expect(hasWebLocks()).toBe(true);
  });

  it('detects absence of navigator.locks', () => {
    vi.stubGlobal('navigator', {});
    expect(hasWebLocks()).toBe(false);
  });

  it('detects BroadcastChannel when present on window', () => {
    vi.stubGlobal('BroadcastChannel', class {});
    expect(hasBroadcastChannel()).toBe(true);
  });

  it('requires both primitives for hasCoordinationPrimitives', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('BroadcastChannel', class {});
    expect(hasCoordinationPrimitives()).toBe(false);
  });
});
