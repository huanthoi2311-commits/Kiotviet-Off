/**
 * Chụp toàn bộ trang khai báo trong `pages.ts`, lưu PNG theo tên file cố định (deterministic)
 * dưới `artifacts/screenshots/`, rồi sinh `artifacts/screenshots/index.html` (gallery xem toàn
 * bộ ảnh vừa chụp).
 *
 * Usage:
 *   npx tsx tools/playwright/capture-all.ts
 *
 * Yêu cầu frontend dev server đang chạy (mặc định http://localhost:3001, đổi qua biến môi
 * trường FRONTEND_BASE_URL). Script này KHÔNG tự khởi động dev server, KHÔNG tự khởi động
 * backend.
 *
 * Nếu backend không khả dụng: mọi trang trong route group `(dashboard)` (tất cả trừ Login)
 * sẽ hiện đúng trạng thái thật của app khi chưa có session — thường là redirect về `/login`
 * (session giữ in-memory qua Zustand, xem `frontend/src/stores/auth-store.ts`). Script chụp
 * lại CHÍNH XÁC những gì trình duyệt render — không giả lập dữ liệu, không bypass đăng nhập,
 * không inject cookie, không mock API. URL cuối cùng sau điều hướng được ghi lại trong
 * gallery để biết trang nào bị redirect.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { platform, release, type as osType } from 'node:os';
import { chromium, type Browser, type Page } from 'playwright';
import { DEFAULT_BASE_URL, DEFAULT_VIEWPORT, SCREENSHOTS_DIR } from './lib/screenshot';
import { PAGES, type PageConfig } from './pages';

const NAV_TIMEOUT_MS = 20_000;
/** Khoảng lặng bổ sung sau sự kiện `load` để chờ hydrate/paint/font cuối ổn định trước khi chụp. */
const SETTLE_MS = 500;

interface CaptureResult {
  name: string;
  slug: string;
  requestedPath: string;
  finalUrl: string;
  fileName: string;
  status: 'captured' | 'error';
  redirected: boolean;
  error?: string;
  capturedAt: string;
}

interface GalleryMetadata {
  generatedAt: string;
  baseUrl: string;
  viewport: string;
  browser: string;
  os: string;
  gitRef: string;
}

function tryGitCommand(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: __dirname, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

/** Không có tuyên bố nào ở đây là thông tin nhạy cảm — chỉ mô tả môi trường chụp để tra cứu sau. */
async function collectMetadata(browser: Browser): Promise<GalleryMetadata> {
  const sha = tryGitCommand(['rev-parse', '--short', 'HEAD']);
  const branch = tryGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']);
  const gitRef = sha ? `${branch ?? 'unknown'}@${sha}` : 'không xác định (không có git hoặc không phải một repo)';

  return {
    generatedAt: new Date().toISOString(),
    baseUrl: DEFAULT_BASE_URL,
    viewport: `${DEFAULT_VIEWPORT.width}x${DEFAULT_VIEWPORT.height}`,
    browser: `Chromium ${browser.version()}`,
    os: `${osType()} ${release()} (${platform()})`,
    gitRef,
  };
}

function isAbortedNavigationError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('ERR_ABORTED');
}

/**
 * Chờ URL không đổi trong `requiredStableChecks` lần đọc liên tiếp (cách nhau `intervalMs`),
 * tối đa `maxAttempts` lần đọc. Cần thiết vì mọi trang trong route group `(dashboard)` được
 * `SessionBootstrapGate` (frontend/src/features/auth/components/session-bootstrap-gate.tsx)
 * bảo vệ: gọi `/auth/refresh` khi mount, và nếu lỗi (không có backend/session thật) thì
 * `redirectToLogin()` — một hard navigation (`window.location`) — điều hướng SANG /login NGAY
 * SAU khi trang gốc đã tải xong. Đây là một redirect thật, có độ trễ (chờ network round-trip
 * tới backend fail), không phải tức thời, nên không đủ để chỉ chờ 1 sự kiện điều hướng.
 */
async function waitForUrlStable(
  page: Page,
  { requiredStableChecks = 3, intervalMs = 200, maxAttempts = 20 } = {},
): Promise<void> {
  let lastUrl = page.url();
  let stableCount = 0;
  for (let attempt = 0; attempt < maxAttempts && stableCount < requiredStableChecks; attempt++) {
    await page.waitForTimeout(intervalMs);
    const current = page.url();
    if (current === lastUrl) {
      stableCount++;
    } else {
      stableCount = 0;
      lastUrl = current;
    }
  }
}

/**
 * KHÔNG dùng `waitUntil: 'networkidle'` — Next.js dev server (Turbopack HMR) giữ một
 * WebSocket kết nối liên tục để hot-reload, nên "0 network connections trong 500ms" gần như
 * không bao giờ đạt được, khiến `networkidle` timeout không ổn định (đã xác nhận thật khi
 * verify lần 1: 7/13 trang timeout 20s dù trang render bình thường).
 *
 * Đổi qua `waitUntil: 'load'` cũng KHÔNG đủ — verify lần 2 cho thấy `net::ERR_ABORTED` xen kẽ
 * (7/13 trang khác lỗi): trang được bảo vệ bởi `SessionBootstrapGate` tự điều hướng
 * (`window.location`, hard nav) sang `/login` ngay sau khi tải xong (không có backend → gọi
 * `/auth/refresh` thất bại → `redirectToLogin()`), khiến chính điều hướng gốc bị trình duyệt
 * hủy giữa chừng — đây là hành vi THẬT của app (không bypass/inject để tránh), nên phải chờ
 * qua được, không phải coi là lỗi.
 *
 * Chiến lược cuối: `waitUntil: 'commit'` (không đợi 'load', né phần lớn khả năng bị chính
 * redirect hủy giữa chừng) → tha thứ `ERR_ABORTED` ở cả bước goto lẫn waitForLoadState('load')
 * → chờ URL thật sự ổn định (`waitForUrlStable`) → chờ thêm SETTLE_MS để paint/font cuối ổn
 * định trước khi chụp.
 */
async function waitUntilStable(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'commit', timeout: NAV_TIMEOUT_MS });
  } catch (error) {
    if (!isAbortedNavigationError(error)) throw error;
  }
  try {
    await page.waitForLoadState('load', { timeout: NAV_TIMEOUT_MS });
  } catch {
    // Bất kỳ lỗi nào ở bước này (ERR_ABORTED, "execution context destroyed", frame detached…)
    // đều là hệ quả lành tính của cùng 1 hard-redirect nói trên — `waitForUrlStable` bên dưới
    // mới là nguồn sự thật cuối cùng cho biết trang đã dừng ở URL nào.
  }
  await waitForUrlStable(page);
  await page.waitForTimeout(SETTLE_MS);
}

async function captureOne(page: Page, config: PageConfig): Promise<CaptureResult> {
  const requestedUrl = new URL(config.path, DEFAULT_BASE_URL).toString();
  const fileName = `${config.slug}.png`;
  const capturedAt = new Date().toISOString();

  try {
    await waitUntilStable(page, requestedUrl);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, fileName), fullPage: true });
    const finalUrl = page.url();
    return {
      name: config.name,
      slug: config.slug,
      requestedPath: config.path,
      finalUrl,
      fileName,
      status: 'captured',
      redirected: finalUrl !== requestedUrl,
      capturedAt,
    };
  } catch (error) {
    return {
      name: config.name,
      slug: config.slug,
      requestedPath: config.path,
      finalUrl: page.url(),
      fileName,
      status: 'error',
      redirected: false,
      error: error instanceof Error ? error.message : String(error),
      capturedAt,
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateGalleryHtml(results: CaptureResult[], metadata: GalleryMetadata): string {
  const cards = results
    .map((r) => {
      const badge = r.status === 'error' ? 'LỖI' : r.redirected ? 'REDIRECT' : 'OK';
      const body =
        r.status === 'error'
          ? `<div class="error">Không chụp được: ${escapeHtml(r.error ?? 'unknown error')}</div>`
          : `<img src="${escapeHtml(r.fileName)}" alt="${escapeHtml(r.name)}" loading="lazy" />`;
      return `
      <figure class="card">
        <div class="card-head">
          <span class="name">${escapeHtml(r.name)}</span>
          <span class="badge badge-${r.status === 'error' ? 'error' : r.redirected ? 'redirect' : 'ok'}">${badge}</span>
        </div>
        ${body}
        <figcaption>
          <div>Route yêu cầu: <code>${escapeHtml(r.requestedPath)}</code></div>
          <div>URL cuối cùng: <code>${escapeHtml(r.finalUrl)}</code></div>
          <div>File: <code>${escapeHtml(r.fileName)}</code></div>
        </figcaption>
      </figure>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<title>POS ERP — Screenshot Gallery</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #f5f5f5; color: #1a1a1a; }
  h1 { margin: 0 0 4px; }
  .meta { color: #666; margin-bottom: 24px; font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 12px; margin: 0; }
  .card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .name { font-weight: 600; }
  .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; font-weight: 600; }
  .badge-ok { background: #d1fae5; color: #065f46; }
  .badge-redirect { background: #fef3c7; color: #92400e; }
  .badge-error { background: #fee2e2; color: #991b1b; }
  .card img { width: 100%; border: 1px solid #eee; border-radius: 4px; display: block; }
  .card figcaption { margin-top: 8px; font-size: 12px; color: #555; line-height: 1.6; }
  .card code { background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }
  .error { padding: 40px 8px; text-align: center; color: #991b1b; background: #fef2f2; border-radius: 4px; font-size: 13px; }
</style>
</head>
<body>
  <h1>POS ERP Enterprise — Screenshot Gallery</h1>
  <div class="meta">
    Sinh tự động bởi tools/playwright/capture-all.ts<br />
    Thời điểm: <code>${escapeHtml(metadata.generatedAt)}</code> ·
    Nguồn: <code>${escapeHtml(metadata.baseUrl)}</code> ·
    Viewport: <code>${escapeHtml(metadata.viewport)}</code><br />
    Trình duyệt: <code>${escapeHtml(metadata.browser)}</code> ·
    OS: <code>${escapeHtml(metadata.os)}</code> ·
    Git: <code>${escapeHtml(metadata.gitRef)}</code>
  </div>
  <div class="grid">
    ${cards}
  </div>
</body>
</html>
`;
}

async function main(): Promise<void> {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: CaptureResult[] = [];
  const metadata = await collectMetadata(browser);
  try {
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();

    for (const config of PAGES) {
      process.stdout.write(`Đang chụp "${config.name}" (${config.path}) ... `);
      const result = await captureOne(page, config);
      results.push(result);
      if (result.status === 'error') {
        console.log(`LỖI: ${result.error}`);
      } else if (result.redirected) {
        console.log(`OK (redirect → ${result.finalUrl})`);
      } else {
        console.log('OK');
      }
    }
  } finally {
    await browser.close();
  }

  const galleryPath = join(SCREENSHOTS_DIR, 'index.html');
  writeFileSync(galleryPath, generateGalleryHtml(results, metadata), 'utf-8');

  const captured = results.filter((r) => r.status === 'captured').length;
  const redirected = results.filter((r) => r.redirected).length;
  const failed = results.filter((r) => r.status === 'error').length;
  console.log(
    `\nHoàn tất: ${captured}/${results.length} chụp thành công (${redirected} bị redirect), ${failed} lỗi.`,
  );
  console.log(`Gallery: ${galleryPath}`);

  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
