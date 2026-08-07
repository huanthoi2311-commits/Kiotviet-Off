import '@testing-library/jest-dom/vitest';
import 'vitest-axe/extend-expect';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import { server } from './src/mocks/server';

expect.extend(axeMatchers);

// jsdom has no matchMedia implementation (used by the shadcn sidebar's
// mobile-breakpoint detection, T034.02) — a minimal stub is standard jsdom
// test infra, not specific to any one component.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
