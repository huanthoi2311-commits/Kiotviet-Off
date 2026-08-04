/**
 * Chụp riêng một phần tử (theo CSS selector) trên một trang, thay vì toàn trang.
 *
 * Usage:
 *   npx tsx tools/playwright/screenshot-component.ts --route=<route-no-leading-slash-or-url> <css-selector> <output-file>
 *   npx tsx tools/playwright/screenshot-component.ts <path-or-url> <css-selector> <output-file>   (cách cũ)
 *
 * Ví dụ:
 *   npx tsx tools/playwright/screenshot-component.ts --route=login form login-form.png
 *
 * T030.8: dùng "--route=login" (KHÔNG có dấu "/" ở đầu — tool tự thêm lại) để né lỗi Git Bash
 * (MSYS2) tự chuyển route thành đường dẫn Windows — "--route=/login" (có "/" ở đầu) vẫn bị
 * chuyển đổi, đã kiểm chứng thực tế. Xem tools/playwright/README.md.
 *
 * Yêu cầu frontend dev server đang chạy (mặc định http://localhost:3001, đổi qua
 * biến môi trường FRONTEND_BASE_URL). Script này KHÔNG tự khởi động dev server.
 */
import { captureComponent, GitBashPathManglingError, InvalidRouteUrlError, FrontendUnreachableError, parseCliRoute } from './lib/screenshot';

async function main(): Promise<void> {
  const { route, rest } = parseCliRoute(process.argv.slice(2));
  const [selector, outputPath] = rest;
  if (!route || !selector || !outputPath) {
    console.error(
      'Usage: npx tsx tools/playwright/screenshot-component.ts --route=<path-or-url> <css-selector> <output-file>',
    );
    process.exit(1);
  }

  const result = await captureComponent({ url: route, selector, outputPath });
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
