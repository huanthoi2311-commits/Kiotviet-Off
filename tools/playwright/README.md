# tools/playwright — Screenshot tooling

Hạ tầng chụp màn hình frontend bằng Playwright, dùng cho mục đích trực quan hóa/demo
(vd. "hiển thị phần mềm dưới dạng hình ảnh"), tách biệt hoàn toàn khỏi `backend/` và
`frontend/` — không đụng vào business logic hay source của hai app đó.

## Cài đặt (một lần)

Playwright + Chromium được khai báo là devDependency ở **root** `package.json` (không
phải trong `backend/` hay `frontend/`), vì đây là tooling dùng chung của monorepo:

```bash
npm install            # cài playwright + tsx từ root package.json
npx playwright install chromium   # tải browser binary (chỉ Chromium, không tải Firefox/WebKit)
```

## Yêu cầu khi chạy

Các script **không tự khởi động** frontend dev server — phải chạy sẵn ở một terminal khác:

```bash
cd frontend
npm run dev        # mặc định http://localhost:3001 (canonical Hybrid setup — xem
                    # docs/setup/ENVIRONMENT-CONTRACT.md §14; backend chạy riêng ở :3000)
```

Toàn bộ script trong thư mục này mặc định nhắm tới `http://localhost:3001` (biến
`DEFAULT_BASE_URL` — nguồn duy nhất tại `tools/playwright/lib/screenshot.ts`). Nếu frontend
chạy ở URL khác, set biến môi trường `FRONTEND_BASE_URL` trước khi gọi script.

Các trang cần gọi API thật (đăng nhập, dashboard có dữ liệu, danh sách sản phẩm...) cần
backend + Postgres + Redis đang chạy thật (`docker compose up`). Nếu backend không chạy,
script vẫn chụp được — kết quả sẽ phản ánh đúng trạng thái thật (lỗi tải dữ liệu/redirect
về `/login`), không giả lập/che giấu.

## Scripts

### `screenshot-page.ts` — chụp toàn trang bất kỳ route nào

```bash
npx tsx tools/playwright/screenshot-page.ts --route=login login.png
npx tsx tools/playwright/screenshot-page.ts --route=product product-list.png
npx tsx tools/playwright/screenshot-page.ts http://localhost:3001/checkout checkout.png --viewport-only
```

- Tham số route: cú pháp `--route=<route-KHÔNG-có-dấu-/-ở-đầu, hoặc-URL-đầy-đủ>` (khuyến
  nghị — xem mục "Lưu ý khi chạy trong Git Bash" bên dưới để biết vì sao KHÔNG được có dấu
  `/` ở đầu giá trị), hoặc tham số vị trí đầu tiên (cách cũ, vẫn hoạt động nhưng không an
  toàn trên Git Bash) — tool tự thêm lại `/` và resolve theo `FRONTEND_BASE_URL` nếu là
  route, hoặc dùng nguyên nếu là URL đầy đủ (`http://...`).
- Tham số kế tiếp: tên/đường dẫn file output, tương đối resolve dưới `artifacts/screenshots/`.
- `--viewport-only` (tùy chọn): chụp đúng viewport thay vì cuộn hết trang (`fullPage`).
- Lỗi được phân biệt rõ: URL/route không hợp lệ (`InvalidRouteUrlError`), route bị Git Bash
  tự chuyển thành đường dẫn Windows (`GitBashPathManglingError`), hoặc frontend không phản
  hồi được (`FrontendUnreachableError`) — mỗi loại có thông điệp riêng, không lẫn lộn.

### `screenshot-component.ts` — chụp riêng một phần tử theo CSS selector

```bash
npx tsx tools/playwright/screenshot-component.ts --route=login form login-form.png
npx tsx tools/playwright/screenshot-component.ts --route=dashboard "[data-testid=sidebar]" sidebar.png
```

### `screenshot-dashboard.ts` — preset chụp `/dashboard`

```bash
# Không có session thật — chụp đúng trạng thái thấy được (thường là redirect /login)
npx tsx tools/playwright/screenshot-dashboard.ts

# Có backend thật đang chạy — đăng nhập thật rồi mới chụp
FRONTEND_LOGIN_USERNAME=admin FRONTEND_LOGIN_PASSWORD=*** npx tsx tools/playwright/screenshot-dashboard.ts
```

Script này đăng nhập bằng form `/login` thật (không bypass/không inject token giả) —
xem comment đầu file để biết lý do (session của app giữ in-memory qua Zustand, không có
localStorage/cookie nào có thể inject trực tiếp để giả lập đăng nhập).

### `capture-all.ts` + `pages.ts` — chụp hàng loạt tất cả trang cấu hình + gallery

```bash
npx tsx tools/playwright/capture-all.ts
```

- Danh sách trang cần chụp khai báo tập trung trong `pages.ts` (`PAGES` array: `name`,
  `path`, `slug`). Thêm/bớt trang chỉ cần sửa file này, không cần sửa `capture-all.ts`.
- Mỗi trang lưu thành `artifacts/screenshots/<slug>.png` — tên file **cố định
  (deterministic)**, không kèm timestamp, để chạy lại nhiều lần luôn ghi đè đúng cùng file.
- Sau khi chụp xong, tự sinh `artifacts/screenshots/index.html` — gallery xem toàn bộ ảnh,
  kèm route yêu cầu, URL cuối cùng sau điều hướng (để biết trang nào bị redirect), và badge
  OK / REDIRECT / LỖI cho từng trang.
- Gallery còn ghi lại metadata của lần chụp (không có gì nhạy cảm): thời điểm, base URL,
  viewport, tên/phiên bản trình duyệt (`Browser.version()` của Playwright), OS/platform
  (`node:os`), và git SHA ngắn + branch hiện tại (`node:child_process` gọi `git`, bỏ qua
  im lặng nếu không phải một repo git) — dùng để tra cứu lần chụp này ứng với commit/máy
  nào, không dùng thư viện ngoài nào mới.
- Một trang lỗi (vd. timeout điều hướng) không làm dừng cả batch — script chụp tiếp các
  trang còn lại, ghi lỗi vào gallery, và thoát với exit code khác 0 ở cuối nếu có ít nhất
  một lỗi thật sự (phân biệt với redirect — redirect là hành vi hợp lệ, không phải lỗi).
- Toàn bộ trang trong `pages.ts` trừ Login đều thuộc route group `(dashboard)` (yêu cầu
  đăng nhập). Không có backend/session thật → mọi trang đó chụp lại đúng trạng thái redirect
  về `/login` mà trình duyệt thật sự thấy — script không giả lập dữ liệu, không bypass đăng
  nhập, không inject cookie, không mock API.

## Lưu ý khi chạy trong Git Bash (Windows)

Git Bash (MSYS2) tự động chuyển đổi bất kỳ token argv nào chứa một đoạn dạng `/segment`
thành đường dẫn Windows (vd. `/login` → `C:/Program Files/Git/login`), khiến
`screenshot-page.ts /login ...` thất bại với lỗi `net::ERR_FILE_NOT_FOUND` (hoặc, từ T030.8,
một `GitBashPathManglingError` rõ ràng thay vì lỗi mạng khó hiểu).

**Đã kiểm chứng thực tế bằng cách in `process.argv`** (không phải suy đoán): MSYS2 chuyển
đổi kể cả khi `/` nằm ngay sau một prefix `--flag=` trong cùng 1 token — `--route=/login`
**vẫn** bị chuyển thành `--route=C:/Program Files/Git/login`. Cú pháp `--route=` MỘT MÌNH
không đủ để né lỗi này. Cách né thật sự, theo thứ tự khuyến nghị:

1. **Dùng cú pháp `--route=login` — KHÔNG có dấu `/` ở đầu giá trị** (khuyến nghị — tool tự
   thêm lại `/` nội bộ, nên token argv không còn giống 1 đường dẫn POSIX để MSYS2 nhận nhầm):
   `npx tsx tools/playwright/screenshot-page.ts --route=login login.png`.
2. Truyền URL đầy đủ thay vì path (MSYS2 bỏ qua token có schema `http://`):
   `npx tsx tools/playwright/screenshot-page.ts http://localhost:3001/login login.png`.
3. Set `MSYS_NO_PATHCONV=1` trước lệnh (hoạt động với mọi cú pháp, kể cả `/login` có dấu `/`
   ở đầu): `MSYS_NO_PATHCONV=1 npx tsx tools/playwright/screenshot-page.ts /login login.png`.

Trong PowerShell/cmd.exe, không có hành vi tự chuyển đổi này — cả 3 cú pháp trên (kể cả
`--route=/login` có dấu `/` ở đầu) đều hoạt động bình thường nếu muốn dùng thống nhất.

## Output

Toàn bộ ảnh lưu dưới `artifacts/screenshots/` (tạo tự động nếu chưa tồn tại). Thư mục này
là output tạm thời của tooling — không phải artifact được duyệt/release chính thức.

## Phạm vi

Đây thuần túy là hạ tầng dev-tooling (screenshot). Không sửa business logic, không sửa
`backend/`, không sửa `frontend/` source — chỉ đọc/điều khiển trình duyệt từ bên ngoài qua
Playwright.
