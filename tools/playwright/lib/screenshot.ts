import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';

/**
 * T030.8 — Kênh CANONICAL của Hybrid environment (RFC-T030 §5 Option D, AD-1 APPROVED):
 * Backend http://localhost:3000, Frontend http://localhost:3001. Trước T030.8, giá trị mặc định
 * ở đây là :3000 — một lỗi tooling đã xác nhận (DISCOVERY-T030 Decision 4, T030.4 §14): khi cả
 * backend lẫn frontend đều chạy đúng quy ước (backend:3000, frontend:3001), bất kỳ script nào ở
 * thư mục này chạy KHÔNG set FRONTEND_BASE_URL tường minh sẽ ngầm nhắm vào backend (JSON API),
 * không phải frontend (giao diện thật). Đây là biến DUY NHẤT toàn bộ tools/playwright/ đọc —
 * mọi script khác import DEFAULT_BASE_URL từ đây, không tự đọc process.env.FRONTEND_BASE_URL
 * hay tự hardcode giá trị thứ 2 ở đâu khác.
 */
export const DEFAULT_BASE_URL = process.env.FRONTEND_BASE_URL ?? 'http://localhost:3001';
export const SCREENSHOTS_DIR = resolve(__dirname, '..', '..', '..', 'artifacts', 'screenshots');
export const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

export interface CapturePageOptions {
  /** Absolute URL, or a path (e.g. "/login") resolved against DEFAULT_BASE_URL. */
  url: string;
  /** Output file name or path; relative paths resolve under artifacts/screenshots/. */
  outputPath: string;
  fullPage?: boolean;
  viewport?: { width: number; height: number };
  /** CSS selector to wait for before capturing (defaults to `body`). */
  waitForSelector?: string;
  timeoutMs?: number;
}

export interface CaptureComponentOptions extends CapturePageOptions {
  /** CSS selector of the single element to screenshot instead of the full page. */
  selector: string;
}

export interface CaptureResult {
  /** Absolute file path the screenshot was written to. */
  savedTo: string;
  /** The exact URL requested (after resolving a relative path against DEFAULT_BASE_URL). */
  requestedUrl: string;
  /** The URL the browser actually ended up at — differs from requestedUrl on a redirect. */
  finalUrl: string;
  redirected: boolean;
}

/**
 * T030.8 — pattern của một argv bị Git Bash (MSYS2) tự chuyển thành đường dẫn Windows (vd
 * "/login" → "C:/Program Files/Git/login"). Dùng để CHẨN ĐOÁN rõ ràng thay vì để lỗi
 * "net::ERR_FILE_NOT_FOUND" khó hiểu lan tới người dùng — xem `classifyNavigationError`.
 */
const WINDOWS_PATH_MANGLING_PATTERN = /^[A-Za-z]:[\\/]|^\\\\|Program Files/;

export class InvalidRouteUrlError extends Error {
  constructor(rawValue: string) {
    super(
      `Giá trị route/URL không hợp lệ: "${rawValue}". Phải là URL http(s) đầy đủ (vd. http://localhost:3001/login) hoặc một route bắt đầu bằng "/" (vd. /login).`,
    );
    this.name = 'InvalidRouteUrlError';
  }
}

export class GitBashPathManglingError extends Error {
  constructor(rawValue: string) {
    super(
      `Giá trị "${rawValue}" trông giống một đường dẫn Windows do Git Bash (MSYS2) tự chuyển đổi ` +
        `tham số bắt đầu bằng "/" — KHÔNG phải do route không hợp lệ. Cách né: dùng "--route=login" ` +
        `(KHÔNG có dấu "/" ở đầu — "--route=/login" vẫn bị MSYS2 chuyển đổi), hoặc set ` +
        `MSYS_NO_PATHCONV=1 trước lệnh, hoặc truyền URL đầy đủ (http://localhost:3001/login). ` +
        `Xem tools/playwright/README.md.`,
    );
    this.name = 'GitBashPathManglingError';
  }
}

export class FrontendUnreachableError extends Error {
  constructor(url: string, cause: unknown) {
    super(
      `Không kết nối được tới frontend tại "${url}" — dev server có đang chạy không? (npm run dev ở frontend/). Lỗi gốc: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'FrontendUnreachableError';
  }
}

/**
 * Resolve `rawValue` thành 1 URL http(s) hợp lệ, hoặc throw 1 trong 2 lỗi PHÂN BIỆT RÕ RÀNG:
 * - `GitBashPathManglingError` nếu giá trị trông như đường dẫn Windows do MSYS2 tự chuyển đổi.
 * - `InvalidRouteUrlError` nếu giá trị không phải URL hợp lệ và cũng không phải route bắt đầu "/".
 */
export function resolveUrl(rawValue: string, baseUrl: string = DEFAULT_BASE_URL): string {
  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }
  if (WINDOWS_PATH_MANGLING_PATTERN.test(rawValue)) {
    throw new GitBashPathManglingError(rawValue);
  }
  if (!rawValue.startsWith('/')) {
    throw new InvalidRouteUrlError(rawValue);
  }
  try {
    return new URL(rawValue, baseUrl).toString();
  } catch {
    throw new InvalidRouteUrlError(rawValue);
  }
}

/**
 * Tách 1 route/URL ra khỏi mảng argv theo 2 cách, ưu tiên cách đầu:
 * 1. Cờ tường minh `--route=<giá trị>`.
 * 2. Tham số vị trí (positional) đầu tiên không bắt đầu bằng "--" — cách dùng cũ.
 *
 * QUAN TRỌNG (đã kiểm chứng thực tế bằng cách in `process.argv`, KHÔNG phải suy đoán): MSYS2
 * (Git Bash) tự chuyển đổi bất kỳ token argv nào có dạng "/đoạn-đơn" thành đường dẫn Windows —
 * kể cả khi "/" nằm NGAY SAU dấu "=" trong 1 flag (`--route=/login` VẪN bị chuyển thành
 * `--route=C:/Program Files/Git/login`). Cú pháp `--route=` một mình KHÔNG đủ để né lỗi này.
 * Cách né thật sự an toàn, theo thứ tự ưu tiên: (a) giá trị route KHÔNG có dấu "/" ở đầu (vd.
 * `--route=login` thay vì `--route=/login`) — hàm này tự thêm "/" lại phía dưới, nên token argv
 * không còn giống 1 đường dẫn POSIX để MSYS2 nhận nhầm; (b) 1 URL đầy đủ (`http://...`), MSYS2
 * bỏ qua vì có schema; (c) set `MSYS_NO_PATHCONV=1` trước lệnh, hoạt động với mọi cú pháp.
 * Trả về route tìm được (undefined nếu không có) và phần argv còn lại sau khi loại bỏ nó.
 */
export function parseCliRoute(args: string[], flagName = 'route'): { route: string | undefined; rest: string[] } {
  const prefix = `--${flagName}=`;
  const flagIndex = args.findIndex((arg) => arg.startsWith(prefix));
  if (flagIndex !== -1) {
    const rawValue = args[flagIndex].slice(prefix.length);
    const route = /^https?:\/\//i.test(rawValue) || rawValue.startsWith('/') ? rawValue : `/${rawValue}`;
    const rest = [...args.slice(0, flagIndex), ...args.slice(flagIndex + 1)];
    return { route, rest };
  }
  const positionalIndex = args.findIndex((arg) => !arg.startsWith('--'));
  if (positionalIndex === -1) {
    return { route: undefined, rest: args };
  }
  const route = args[positionalIndex];
  const rest = [...args.slice(0, positionalIndex), ...args.slice(positionalIndex + 1)];
  return { route, rest };
}

function resolveOutputPath(outputPath: string): string {
  const target = isAbsolute(outputPath) ? outputPath : join(SCREENSHOTS_DIR, outputPath);
  mkdirSync(dirname(target), { recursive: true });
  return target;
}

async function withBrowser<T>(fn: (page: Page, browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();
    return await fn(page, browser);
  } finally {
    await browser.close();
  }
}

async function gotoOrThrowClearError(page: Page, url: string, timeoutMs: number): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
  } catch (error) {
    throw new FrontendUnreachableError(url, error);
  }
}

/**
 * Điều hướng tới `url` và chụp toàn trang (hoặc viewport nếu `fullPage: false`).
 * Không giả lập đăng nhập/session — nếu trang yêu cầu auth, kết quả sẽ là trạng thái
 * thật sự trình duyệt thấy (vd. redirect về /login), không phải dữ liệu giả.
 */
export async function capturePage(options: CapturePageOptions): Promise<CaptureResult> {
  const {
    url,
    outputPath,
    fullPage = true,
    viewport = DEFAULT_VIEWPORT,
    waitForSelector = 'body',
    timeoutMs = 15_000,
  } = options;
  const target = resolveOutputPath(outputPath);
  const requestedUrl = resolveUrl(url);

  return withBrowser(async (page) => {
    await page.setViewportSize(viewport);
    await gotoOrThrowClearError(page, requestedUrl, timeoutMs);
    await page.waitForSelector(waitForSelector, { timeout: timeoutMs });
    await page.screenshot({ path: target, fullPage });
    const finalUrl = page.url();
    return { savedTo: target, requestedUrl, finalUrl, redirected: finalUrl !== requestedUrl };
  });
}

/** Chụp riêng một phần tử (theo CSS selector) thay vì toàn trang. */
export async function captureComponent(options: CaptureComponentOptions): Promise<CaptureResult> {
  const { url, outputPath, selector, viewport = DEFAULT_VIEWPORT, timeoutMs = 15_000 } = options;
  const target = resolveOutputPath(outputPath);
  const requestedUrl = resolveUrl(url);

  return withBrowser(async (page) => {
    await page.setViewportSize(viewport);
    await gotoOrThrowClearError(page, requestedUrl, timeoutMs);
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    await locator.screenshot({ path: target });
    const finalUrl = page.url();
    return { savedTo: target, requestedUrl, finalUrl, redirected: finalUrl !== requestedUrl };
  });
}
