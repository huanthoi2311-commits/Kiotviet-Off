/**
 * Chụp toàn trang cho bất kỳ route nào của frontend.
 *
 * Usage:
 *   npx tsx tools/playwright/screenshot-page.ts --route=<route-no-leading-slash-or-url> <output-file> [--viewport-only]
 *   npx tsx tools/playwright/screenshot-page.ts <path-or-url> <output-file> [--viewport-only]   (cách cũ)
 *
 * Ví dụ:
 *   npx tsx tools/playwright/screenshot-page.ts --route=login login.png
 *   npx tsx tools/playwright/screenshot-page.ts http://localhost:3001/dashboard dashboard.png --viewport-only
 *
 * T030.8: trên Git Bash (MSYS2), MỘT tham số bắt đầu bằng "/" bị tự động chuyển thành đường dẫn
 * Windows — kể cả khi nằm trong "--route=/login" (đã kiểm chứng thực tế, "--route=" một mình
 * KHÔNG đủ để né). Cách né thật sự: bỏ dấu "/" ở đầu — "--route=login" (tool tự thêm lại "/"),
 * hoặc dùng URL đầy đủ, hoặc set MSYS_NO_PATHCONV=1. Xem tools/playwright/README.md.
 *
 * Yêu cầu frontend dev server đang chạy (mặc định http://localhost:3001, đổi qua
 * biến môi trường FRONTEND_BASE_URL). Script này KHÔNG tự khởi động dev server.
 */
import { capturePage, GitBashPathManglingError, InvalidRouteUrlError, FrontendUnreachableError, parseCliRoute } from './lib/screenshot';

async function main(): Promise<void> {
  const { route, rest } = parseCliRoute(process.argv.slice(2));
  const [outputPath, ...flags] = rest;
  if (!route || !outputPath) {
    console.error(
      'Usage: npx tsx tools/playwright/screenshot-page.ts --route=<path-or-url> <output-file> [--viewport-only]',
    );
    process.exit(1);
  }
  const fullPage = !flags.includes('--viewport-only');

  const result = await capturePage({ url: route, outputPath, fullPage });
  console.log(`Saved: ${result.savedTo}`);
  if (result.redirected) {
    console.warn(`Lưu ý: đã bị điều hướng — yêu cầu "${result.requestedUrl}", kết quả cuối "${result.finalUrl}".`);
  }
}

main().catch((error) => {
  if (error instanceof GitBashPathManglingError || error instanceof InvalidRouteUrlError || error instanceof FrontendUnreachableError) {
    console.error(`[${error.name}] ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
