import { defineConfig, devices } from '@playwright/test';

/**
 * T051.08 — Minimal Real-Browser Release E2E. Chạy song song, TÁCH BIỆT hoàn toàn khỏi
 * `playwright.config.ts` (auth-only, `e2e/auth`, mock network qua `page.route()`, tự khởi
 * `next dev`). File này:
 *
 * - `testDir: './e2e/release'` — không đụng suite auth hiện có, không cần cấu hình lại.
 * - KHÔNG có `webServer` — stack thật (frontend/backend/Postgres/Redis) do CI/vận hành viên khởi
 *   động TRƯỚC qua `docker compose -f docker-compose.yml -f docker-compose.override.yml up
 *   --wait` (đúng stack đã chứng minh ở T051.04), không phải Playwright tự chạy `next dev`.
 * - KHÔNG mock network — mọi request đi thẳng tới backend thật (`NEXT_PUBLIC_API_URL` đã được
 *   nhúng vào bundle Next.js lúc `docker compose build`, không cấu hình lại được ở đây).
 * - `globalSetup` chỉ bootstrap fixture qua API (`e2e/release/global-setup.ts`) — KHÔNG còn đăng
 *   nhập/lưu `storageState` ở đây (bản snapshot cookie tĩnh 1-lần-dùng dưới cơ chế refresh-token
 *   rotation-on-every-use, gây race khi `test.describe.serial` retry — T051.08 resume round 2).
 *   `critical-path.spec.ts`'s test 1 đăng nhập qua UI với session riêng; `beforeAll` của nó tự
 *   đăng nhập qua API cho phiên dùng chung mỗi lần chạy — không test nào trong file này còn dùng
 *   `use.storageState` mặc định của config nữa, nên field đó không còn xuất hiện dưới đây nữa.
 */
const DEFAULT_BASE_URL = process.env.RELEASE_E2E_BASE_URL ?? 'http://localhost:3001';

export default defineConfig({
  testDir: './e2e/release',
  fullyParallel: false,
  globalSetup: require.resolve('./e2e/release/global-setup.ts'),
  timeout: 60_000,
  // Một luồng nghiệp vụ dài (login → PO → checkout → return) chịu tải mạng/DB thật — bounded retry
  // CI-only, cùng chính sách với playwright.config.ts (không nới timeout để che giấu race thật).
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { outputFolder: 'playwright-release-report', open: 'never' }],
        ['json', { outputFile: 'playwright-release-report/results.json' }],
      ]
    : 'list',
  use: {
    baseURL: DEFAULT_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
