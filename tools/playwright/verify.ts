/**
 * Executable verification script cho tools/playwright/ (T030.8) — không có test framework
 * (Jest/Vitest...) nào được cấu hình cho thư mục này, nên đây là "tests or executable
 * verification" theo yêu cầu, chạy trực tiếp bằng tsx, không mock browser thật (Playwright
 * chromium không được khởi động ở đây — chỉ kiểm tra logic thuần: parse argv, resolve URL,
 * phân loại lỗi). Không thay thế cho verification battery chụp ảnh thật bằng browser thật.
 *
 * Usage:
 *   npx tsx tools/playwright/verify.ts
 *
 * Exit code 0 nếu toàn bộ case PASS, khác 0 nếu có bất kỳ case nào FAIL.
 */

let passed = 0;
let failed = 0;

function check(description: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  PASS: ${description}`);
  } else {
    failed++;
    console.error(`  FAIL: ${description}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

function checkThrows(description: string, fn: () => unknown, expectedErrorName: string): void {
  try {
    fn();
    failed++;
    console.error(`  FAIL: ${description}\n    expected throw "${expectedErrorName}", but no error was thrown`);
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown';
    if (name === expectedErrorName) {
      passed++;
      console.log(`  PASS: ${description}`);
    } else {
      failed++;
      console.error(`  FAIL: ${description}\n    expected throw "${expectedErrorName}", got "${name}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function main(): Promise<void> {
  // 1) DEFAULT_BASE_URL phải là :3001 khi FRONTEND_BASE_URL không được set — import động
  //    SAU KHI xóa biến môi trường, để chắc chắn giá trị này không bị process env hiện tại
  //    (nếu có) che khuất kết quả kiểm tra thật.
  delete process.env.FRONTEND_BASE_URL;
  console.log('DEFAULT_BASE_URL (T030.8 defect fix):');
  const lib = await import('./lib/screenshot');
  check('DEFAULT_BASE_URL mặc định là :3001 khi FRONTEND_BASE_URL không set', lib.DEFAULT_BASE_URL, 'http://localhost:3001');

  console.log('\nresolveUrl():');
  check('URL đầy đủ giữ nguyên', lib.resolveUrl('http://localhost:3001/login'), 'http://localhost:3001/login');
  check('Path hợp lệ resolve theo baseUrl', lib.resolveUrl('/login', 'http://localhost:3001'), 'http://localhost:3001/login');
  checkThrows('Path bị Git Bash mangle (vd. "C:/Program Files/Git/login") ném GitBashPathManglingError', () => lib.resolveUrl('C:/Program Files/Git/login'), 'GitBashPathManglingError');
  checkThrows('Chuỗi rác không phải URL/route ném InvalidRouteUrlError', () => lib.resolveUrl('not-a-route-or-url'), 'InvalidRouteUrlError');

  console.log('\nparseCliRoute() — normalization (empirically verified fix, see IMPLEMENTATION REPORT — T030.8 §Deviations):');
  check('--route=login (KHÔNG có "/" đầu) tự thêm "/" — dạng thật sự an toàn trên Git Bash', lib.parseCliRoute(['--route=login', 'out.png']), { route: '/login', rest: ['out.png'] });
  check('--route=http://... (URL đầy đủ) giữ nguyên, không thêm "/"', lib.parseCliRoute(['--route=http://localhost:3001/login', 'out.png']), { route: 'http://localhost:3001/login', rest: ['out.png'] });

  console.log('\nparseCliRoute():');
  check('Cú pháp --route= được ưu tiên và tách khỏi rest', lib.parseCliRoute(['--route=/login', 'out.png']), { route: '/login', rest: ['out.png'] });
  check('Tham số vị trí (cách cũ) vẫn hoạt động khi không có --route=', lib.parseCliRoute(['/login', 'out.png']), { route: '/login', rest: ['out.png'] });
  check('--route= đứng sau các cờ khác vẫn được tìm thấy đúng', lib.parseCliRoute(['out.png', '--viewport-only', '--route=/dashboard']), { route: '/dashboard', rest: ['out.png', '--viewport-only'] });
  check('Không có route nào trả về route=undefined', lib.parseCliRoute(['--viewport-only']), { route: undefined, rest: ['--viewport-only'] });

  console.log('\nPAGES config (pages.ts):');
  const { PAGES } = await import('./pages');
  check('PAGES không rỗng', PAGES.length > 0, true);
  check('Mọi entry có name/path/slug khác rỗng', PAGES.every((p) => p.name && p.path.startsWith('/') && p.slug), true);
  check('Mọi slug là duy nhất (dùng làm tên file PNG)', new Set(PAGES.map((p) => p.slug)).size === PAGES.length, true);

  console.log(`\n${passed} PASS, ${failed} FAIL`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
