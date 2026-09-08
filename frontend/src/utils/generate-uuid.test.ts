import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateUuid } from './generate-uuid';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('generateUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.randomUUID when available', () => {
    const fixed = '11111111-1111-4111-8111-111111111111';
    vi.stubGlobal('crypto', {
      randomUUID: () => fixed,
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    expect(generateUuid()).toBe(fixed);
  });

  it('falls back to crypto.getRandomValues when crypto.randomUUID is unavailable (Customer #1 LAN HTTP condition)', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    expect(generateUuid()).toMatch(UUID_V4_REGEX);
  });

  it('produces distinct values across repeated fallback calls', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    const ids = new Set(Array.from({ length: 50 }, () => generateUuid()));
    expect(ids.size).toBe(50);
  });

  it('sets RFC 4122 version 4 and variant bits correctly in fallback mode', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: crypto.getRandomValues.bind(crypto),
    });
    for (let i = 0; i < 20; i++) {
      const id = generateUuid();
      expect(id[14]).toBe('4');
      expect(['8', '9', 'a', 'b']).toContain(id[19].toLowerCase());
    }
  });
});
