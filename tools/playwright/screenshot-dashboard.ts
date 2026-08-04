/**
 * Chụp trang Dashboard (`/dashboard`).
 *
 * Dashboard yêu cầu đăng nhập (session giữ trong Zustand in-memory, khôi phục qua cookie
 * `/auth/refresh` — xem `frontend/src/stores/auth-store.ts`). Script này KHÔNG giả lập/bypass
 * session bằng bất kỳ cách nào:
 *   - Nếu KHÔNG có FRONTEND_LOGIN_USERNAME/FRONTEND_LOGIN_PASSWORD: chỉ điều hướng thẳng tới
 *     /dashboard và chụp lại đúng những gì trình duyệt thấy — nếu chưa có backend/session thật,
 *     kết quả hợp lệ sẽ là màn hình bị redirect về /login (không phải giao diện Dashboard thật).
 *   - Nếu CÓ hai biến trên: đăng nhập thật qua form /login (cần backend + Postgres + Redis đang
 *     chạy), rồi mới điều hướng tới /dashboard và chụp.
 *
 * Usage:
 *   npx tsx tools/playwright/screenshot-dashboard.ts [output-file]
 *   FRONTEND_LOGIN_USERNAME=admin FRONTEND_LOGIN_PASSWORD=*** npx tsx tools/playwright/screenshot-dashboard.ts
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { DEFAULT_BASE_URL, DEFAULT_VIEWPORT, SCREENSHOTS_DIR, FrontendUnreachableError } from './lib/screenshot';
import { join, isAbsolute } from 'node:path';

async function gotoOrThrow(page: import('playwright').Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 });
  } catch (error) {
    throw new FrontendUnreachableError(url, error);
  }
}

async function main(): Promise<void> {
  const outputArg = process.argv[2] ?? 'dashboard.png';
  const target = isAbsolute(outputArg) ? outputArg : join(SCREENSHOTS_DIR, outputArg);
  mkdirSync(dirname(target), { recursive: true });

  const { FRONTEND_LOGIN_USERNAME, FRONTEND_LOGIN_PASSWORD } = process.env;
  const canLogin = Boolean(FRONTEND_LOGIN_USERNAME && FRONTEND_LOGIN_PASSWORD);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();

    if (canLogin) {
      console.log('Đăng nhập thật qua /login trước khi chụp /dashboard...');
      await gotoOrThrow(page, new URL('/login', DEFAULT_BASE_URL).toString());
      await page.getByLabel(/tên đăng nhập|username/i).fill(FRONTEND_LOGIN_USERNAME!);
      await page.getByLabel(/mật khẩu|password/i).fill(FRONTEND_LOGIN_PASSWORD!);
      await page.getByRole('button', { name: /đăng nhập|log ?in/i }).click();
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 }).catch(() => {
        console.warn('Không thấy điều hướng tới /dashboard sau khi submit — kiểm tra lại thông tin đăng nhập/backend.');
      });
    } else {
      console.log(
        'Không có FRONTEND_LOGIN_USERNAME/PASSWORD — điều hướng thẳng /dashboard (có thể bị redirect về /login nếu chưa có session).',
      );
      await gotoOrThrow(page, new URL('/dashboard', DEFAULT_BASE_URL).toString());
    }

    await page.waitForSelector('body', { timeout: 15_000 });
    await page.screenshot({ path: target, fullPage: true });
    const finalUrl = page.url();
    console.log(`Saved: ${target} (final URL: ${finalUrl})`);
    if (/\/login/.test(finalUrl)) {
      console.warn('Kết quả là màn hình /login (auth redirect) — không phải giao diện Dashboard thật, do chưa có session hợp lệ.');
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  if (error instanceof FrontendUnreachableError) {
    console.error(`[${error.name}] ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
