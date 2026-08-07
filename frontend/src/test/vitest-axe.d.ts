import 'vitest';
import type { AxeMatchers } from 'vitest-axe';

/**
 * `vitest-axe`'s own shipped types (0.1.0) still augment the pre-v3 `Vi`
 * namespace, which this project's vitest (4.1.10) no longer reads —
 * re-declared here against the current `declare module 'vitest'` contract
 * (same pattern `@testing-library/jest-dom/vitest.d.ts` uses).
 */
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging, matches jest-dom's own vitest.d.ts pattern
  interface Assertion extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- declaration merging, matches jest-dom's own vitest.d.ts pattern
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
