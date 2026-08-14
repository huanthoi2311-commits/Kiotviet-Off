# T051.08 — Real-Browser Release E2E (Minimal Critical-Path)

**Ngày**: 2026-08-13 | **Base**: `main` @ `7f75198df9fbd9304b2a2fa59f70e05106afa91f` | **Loại**: LEVEL 3 IMPLEMENTATION — release finalization, không phải coverage toàn diện.

---

## 1. Mục tiêu & phạm vi

Bộ suite Playwright nhỏ nhất chứng minh **hành trình nghiệp vụ trọng yếu V1.0** hoạt động đúng trên **stack thật đóng gói** (không phải trên môi trường dev/mock): trình duyệt Chromium thật → frontend Next.js thật (container) → backend NestJS thật (container) → PostgreSQL thật → Redis thật.

**KHÔNG dùng MSW, KHÔNG backend giả** — khác biệt căn bản với `frontend/e2e/auth/` (suite Playwright hiện có, mock toàn bộ network qua `page.route()`, chạy mọi PR frontend, mục đích khác: chứng minh luồng UI đăng nhập/redirect, không chứng minh tích hợp thật).

Mục tiêu là **niềm tin phát hành** (release confidence) cho đúng 1 hành trình: Đăng nhập → Sản phẩm sẵn sàng → Purchase Order → Duyệt → Nhận hàng → tồn kho tăng → POS Cart → Checkout → Hoá đơn → Trả hàng → tồn kho phản ánh đúng — KHÔNG phải coverage đầy đủ mọi module/mọi nhánh nghiệp vụ.

---

## 2. Kiến trúc

```
frontend/
├── playwright.config.ts          # SUITE CŨ — auth, mock network, mọi PR frontend
├── playwright.release.config.ts  # SUITE MỚI (T051.08) — release, stack thật, tách biệt hoàn toàn
└── e2e/
    ├── auth/                     # không đụng — không có gì trong T051.08 sửa suite này
    └── release/
        ├── global-setup.ts       # bootstrap fixture qua API (không còn đăng nhập/lưu storageState — xem §3)
        ├── support.ts            # helper dùng chung (combobox, lifecycle confirm, đọc tồn kho qua API)
        ├── critical-path.spec.ts # 7 test, test.describe.serial
        └── .auth/                # SINH RA LÚC CHẠY (chỉ fixtures.json) — gitignore, không bao giờ commit
```

`playwright.release.config.ts` **không có `webServer`** — khác với suite auth (tự chạy `next dev`). Suite release trỏ vào một stack Docker Compose ĐÃ CHẠY SẴN từ bên ngoài (CI: `docker compose up`; local: T051.04's runbook), qua `RELEASE_E2E_BASE_URL`/`RELEASE_E2E_API_URL`.

---

## 3. Fixture strategy (§4)

| Bước | Cách tạo | Lý do |
|---|---|---|
| Category/Unit/Supplier/Warehouse/Product | API thật (`global-setup.ts`, dùng token First Admin có sẵn từ bring-up T051.04) | Dữ liệu chủ không phải trọng tâm của suite — dùng UI để tạo sẽ chỉ làm chậm/thêm điểm hỏng không liên quan |
| Branch | ĐỌC branch có sẵn từ bring-up (không tạo mới) | Bring-up First Admin đã tạo sẵn đúng 1 branch mặc định |
| Đăng nhập | **UI thật** — form đăng nhập thật, ĐỘC LẬP (session riêng) trong test đầu tiên của `critical-path.spec.ts`, tự nó chứng minh hành vi đăng nhập. **API thật** (không qua form) trong `critical-path.spec.ts`'s `beforeAll` để thiết lập phiên dùng chung cho test 2-7 — MỖI lần `beforeAll` chạy (kể cả khi `test.describe.serial` retry) đều tự đăng nhập lại lấy `refresh_token` MỚI, KHÔNG còn phục hồi từ 1 file `storageState` tĩnh (bản snapshot 1-lần-dùng dưới cơ chế refresh-token rotation-on-every-use — đã gây race giữa các LẦN CHẠY khi retry, xác nhận qua CI thật, T051.08 resume round 2) | §5 — "no mocked auth"; test đầu tiên chứng minh chính hành vi đăng nhập qua UI; §4 "API for setup" áp dụng cho phiên dùng chung (không phải hành trình đang kiểm chứng) |
| Purchase Order (create/Duyệt/Nhận hàng) | **UI thật** — đây là hành trình đang được kiểm chứng | §4 — "UI for the user journey under test" |
| POS Cart/Checkout | **UI thật** | nt |
| Invoice (xem) | **UI thật** | nt |
| Sales Return (create + toàn bộ vòng đời) | **UI thật** | nt |
| Xác nhận tồn kho (trước/sau mỗi bước) | **API thật** (`GET /inventory`, chỉ đọc) — UI `/inventory` cũng được dùng ở đúng 1 điểm để chứng minh UI hiển thị đúng | §4 — "direct DB/API assertions only for final invariants where UI doesn't expose reliable verification"; số lần so sánh delta lặp lại nhiều lần trong suite, dùng API cho ổn định/chính xác hơn là re-parse UI mỗi lần |

---

## 4. Hành trình được kiểm chứng (7 test, `test.describe.serial`)

1. **Đăng nhập qua UI thật** → Dashboard.
2. **Purchase Order**: tạo → Duyệt → Xác nhận nhận hàng qua UI → tồn kho tăng đúng `RECEIVE_QUANTITY` (xác nhận cả qua UI `/inventory` và qua API).
3. **POS Checkout**: thêm giỏ hàng → chọn chi nhánh/kho xuất/phương thức thanh toán → Thanh toán qua UI → đúng 1 Invoice được tạo (bắt response mạng thật để lấy `invoice.id`, panel thành công chỉ hiển thị mã người-đọc-được) → tồn kho giảm đúng `SELL_QUANTITY`.
4. **Invoice**: xem qua UI, xác nhận mã/tên sản phẩm/nút "Trả hàng" hiển thị đúng.
5. **Sales Return**: tạo qua UI → toàn bộ vòng đời `Gửi duyệt → Duyệt → Xác nhận nhận hàng → Hoàn tất` → tồn kho tăng đúng 1 lần tại đúng bước `Xác nhận nhận hàng` (bước DUY NHẤT gọi `InventoryDomainService.increase()` — xác nhận từ nguồn `SalesReturnService.receive()`), không đổi ở `Hoàn tất`.
6. **Duplicate-submit**: double-click "Thanh toán" — thu thập MỌI response checkout thành công qua `page.on('response')`, chứng minh tối đa 1 `invoice.id` DUY NHẤT từng được tạo (không chỉ "không lỗi"), cộng xác nhận độc lập qua API: đúng 1 Payment cho invoice đó.
7. **Tenant smoke**: dropdown Chi nhánh/Kho trên form Purchase Order chỉ chứa đúng thực thể của tổ chức mình.

---

## 5. Những gì KHÔNG được suite này bao phủ (và lý do — §11/§12)

| Bỏ qua | Lý do |
|---|---|
| Fixture 2 tổ chức thật trong trình duyệt (cross-tenant browser test) | Không có cơ chế HTTP nào để bootstrap tổ chức thứ 2 trong 1 stack đang chạy ở V1: `POST /organizations` bị khoá sau `PlatformAdminGuard`, First Admin bootstrap chỉ là Owner cấp tổ chức, không phải Platform Admin. Backend real-E2E (`checkout-tenant-isolation.e2e-spec.ts`, `tenant-owned-foreign-id-hardening.e2e-spec.ts`, T051.06A/.06B) đã chứng minh việc từ chối cross-tenant ở tầng API — §11 cho phép suite trình duyệt chỉ cần 1 smoke tối thiểu (mục 7 ở trên), KHÔNG bắt buộc dựng lại toàn bộ fixture 2-tổ-chức. |
| Permission/RBAC smoke (vai trò khác Owner) | Không có `POST /users` và không có `/auth/register` ở bất kỳ đâu trong API hiện tại (xác nhận qua grep toàn bộ `rbac`/`auth` controller) — V1 KHÔNG có cách tạo user thứ 2 để gán vai trò giới hạn. Dựng workaround (ví dụ ghi thẳng DB) sẽ tốn công không tương xứng và không đại diện cho hành vi thật của người dùng. §12 cho phép bỏ qua với lý do ghi rõ — RBAC/permission đã có E2E backend riêng (`rbac-tenant-isolation.e2e-spec.ts`) chứng minh tầng phân quyền độc lập với suite này. |
| Coverage các nhánh nghiệp vụ khác (huỷ Purchase Order, từ chối Sales Return, voucher/điểm thưởng, nhiều dòng hàng, nhiều kho...) | Ngoài phạm vi "critical path tối thiểu" theo §1/§20 — quality over quantity, không chasing test count. |

---

## 6. CI Invocation

Workflow: [`.github/workflows/release-e2e.yml`](../../.github/workflows/release-e2e.yml).

- **Trigger**: `workflow_dispatch`, `push`/`pull_request` vào `main` khi thay đổi chạm `frontend/e2e/release/**`, `frontend/playwright.release.config.ts`, `frontend/package.json`/`package-lock.json`, `docker-compose*.yml`, `backend/Dockerfile`, `frontend/Dockerfile`, hoặc chính workflow này.
- **Tách khỏi** `backend-ci.yml`/`frontend-ci.yml`/`playwright` (auth) job hiện có — không bắt mọi PR frontend phải dựng cả stack Docker (§15).
- **Các bước** (tái dùng nguyên xi bước build/up/health của `deployment-smoke.yml`, T051.04 — xem §16): sinh `.env`/`backend/.env` bằng secret ngẫu nhiên thật (mask ngay) → `docker compose build` → `docker compose up -d --wait` → xác nhận `/health` + frontend reachability → cài dependencies frontend + Chromium (`npx playwright install --with-deps chromium`) → `npm run test:e2e:release` (biến `RELEASE_E2E_*` trỏ vào đúng stack vừa dựng, khớp `FIRST_ADMIN_*` trong `backend/.env`) → dọn dẹp (`docker compose down -v`, chỉ CI mới dùng `-v`).
- **Local**: KHÔNG chạy được trong sandbox phát triển của phiên này (không có Docker) — CI là nguồn xác nhận DUY NHẤT cho bằng chứng trình duyệt thật trên stack thật (§16, cùng lý do đã áp dụng cho `deployment-smoke.yml`). Người vận hành có Docker cục bộ có thể chạy `docker compose up` (theo `WINDOWS-DEPLOYMENT-RUNBOOK.md`) rồi `npm run test:e2e:release` trong `frontend/` với các biến `RELEASE_E2E_*` trỏ đúng stack.

---

## 7. Artifacts khi thất bại (§17)

- `playwright-release-report/` (HTML + JSON reporter) và `test-results/` (trace `retain-on-failure`, screenshot `only-on-failure`) — upload qua `actions/upload-artifact` **chỉ khi `failure()`**, không tạo artifact nặng khi thành công.
- Log toàn bộ container (`docker compose logs --no-color`) khi thất bại — không chứa secret (đã mask ở bước sinh `.env`).
- Không secret nào (mật khẩu First Admin, JWT secret, Postgres password) xuất hiện trong bất kỳ artifact/log nào — toàn bộ đã qua `::add-mask::`.

---

## 8. Kỷ luật chống flaky (§18)

- Không `sleep` tuỳ ý — mọi chờ đợi dùng Playwright locator expectation (`waitForURL`, `expect(...).toBeVisible()`, `waitForResponse`, `waitForLoadState('networkidle')`) hoặc `docker compose up --wait` (health-check thật của container).
- `retries: 1` trên CI (không phải 0, không phải cao hơn) — nếu 1 lần retry mới pass, đó là tín hiệu cần điều tra race condition, không phải cấu hình để im lặng bỏ qua.

---

## 9. Vai trò trong release gate

Suite này là **1 trong nhiều gate** cho V1.0, KHÔNG thay thế:
- Backend/Frontend CI (unit + integration + existing E2E) — vẫn bắt buộc SUCCESS song song.
- `deployment-smoke.yml` (T051.04) — vẫn là bằng chứng cho gói triển khai/backup/restore, không trùng lặp với suite này (suite này KHÔNG kiểm tra backup/restore).
- Backend real cross-tenant E2E (T051.00/.06A/.06B) — vẫn là nguồn xác nhận chính cho tenant isolation; smoke trình duyệt ở đây chỉ bổ sung 1 điểm nhìn từ góc UI.

Khi `release-e2e` job SUCCESS trên `main`, đó là bằng chứng: **hành trình nghiệp vụ trọng yếu nhất của V1.0 hoạt động đúng, đầu-cuối, trên đúng gói triển khai người vận hành thật sẽ chạy** — không hơn, không kém phạm vi mô tả ở §1/§5 phía trên.
