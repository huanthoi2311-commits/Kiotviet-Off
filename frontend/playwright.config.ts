import { defineConfig, devices } from '@playwright/test';

/**
 * Scoped to authentication/session tests only (T031.05) — `testDir` points
 * exclusively at `e2e/auth`, a directory kept permanently separate from
 * `tools/playwright/`'s screenshot scripts (RFC-T031 §30 D15).
 *
 * Reuses the `FRONTEND_BASE_URL` convention from
 * tools/playwright/lib/screenshot.ts (RFC-T031 §30 D13) — the project's
 * single canonical frontend-base-URL env var, defaulting to :3001 per the
 * Hybrid environment (RFC-T030 §5).
 */
const DEFAULT_BASE_URL = process.env.FRONTEND_BASE_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e/auth',
  fullyParallel: false,
  retries: 0,
  // Local runs keep plain list output; CI also writes an HTML report so a
  // failure has an artifact to upload (T031.06) — never opened automatically.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: DEFAULT_BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  /**
   * These tests intercept every backend call at the network layer (Playwright
   * `route()`), so no real backend runs. `NEXT_PUBLIC_API_URL` is pointed at the
   * frontend's own origin instead of the default cross-origin `:3000` so the
   * mocked `/auth/refresh` calls stay same-origin (no CORS preflight to fake).
   */
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: DEFAULT_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_API_URL: `${DEFAULT_BASE_URL}/api/v1`,
    },
  },
});
