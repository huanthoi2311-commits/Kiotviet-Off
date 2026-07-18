# OFFLINE SINGLE-COMPUTER READINESS AUDIT REPORT

**T010 — Offline Single-Computer Scope Freeze** (theo `ARCHITECT SCOPE CORRECTION` — Decision SC01-SC13). Audit thuần túy — **không sửa source code** ở task này (đúng SC13). Toàn bộ 18 điểm audit được liệt kê theo đúng thứ tự SC13 yêu cầu, mỗi điểm có bằng chứng `file:line` cụ thể lấy từ code hiện tại (branch `main`, sau tag `v0.6.0-barcode-foundation`).

---

## 1. Backend startup method

**Hiện tại:** `backend/src/main.ts:70` — `await app.listen(config.get<number>('port')!);` — gọi `listen(port)` **không truyền host**. Node/Nest mặc định bind mọi interface (tương đương `0.0.0.0`), không phải chỉ `localhost`. `backend/package.json:18` — `"start:prod": "node dist/main"` — chạy Node process thuần, không có wrapper service (không PM2, không NSSM, không Windows Service).

**Đánh giá:** Khởi động đơn giản (`node dist/main`), phù hợp single-computer. Nhưng **hiện đang lắng nghe trên mọi interface**, không chỉ `localhost` — cần sửa (SC02: "The application may bind to localhost only") ở Implementation Plan kế tiếp, không sửa ở đây.

## 2. Frontend startup method

**Hiện tại:** `frontend/package.json:6-8` — `"dev": "next dev --turbopack"`, `"build": "next build --turbopack"`, `"start": "next start"`. Next.js 15.5.20 chuẩn, không có cấu hình PWA (`next-pwa` không có trong `dependencies`), không có `output: 'export'`/`output: 'standalone'` trong `frontend/next.config.ts` (file chỉ có cấu hình mặc định — đã đọc, không override `output`).

**Đánh giá:** `next start` cần Node runtime sống liên tục (không phải static export) — phù hợp chạy cùng máy với backend. Chưa có script gộp khởi động backend+frontend cùng lúc (xem mục 12).

## 3. PostgreSQL local deployment

**Hiện tại:** `docker-compose.yml:1-18` — service `postgres` dùng image `postgres:16-alpine`, port map `"5432:5432"` (bind mọi interface theo mặc định Docker). `backend/.env.example:6` — `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pos_erp?schema=public"` đã trỏ `localhost` sẵn. `backend/prisma/schema.prisma` dùng `datasource db { provider = "postgresql" }`.

**Đánh giá:** Đã sẵn sàng chạy Postgres cục bộ qua Docker. Chưa có hướng dẫn/cấu hình cài Postgres **native trên Windows** (không qua Docker) — cần nếu chọn Option A ở Decision SC12.

## 4. Redis dependency

**Hiện tại:** `backend/src/redis/redis.module.ts:12` — `@Global()` module, kết nối `ioredis` bắt buộc lúc bootstrap (không optional). 2 nơi dùng trực tiếp (không qua BullMQ):
- `backend/src/modules/cart/infrastructure/persistence/redis-cart.repository.ts:7,26-33` — **Cart nghiệp vụ lõi** (giỏ hàng trước Checkout) lưu Redis, TTL 30 phút. Đây là luồng POS trung tâm, không phải phụ.
- `backend/src/modules/auth/infrastructure/persistence/redis-otp.repository.ts` — lưu OTP quên mật khẩu (luồng phụ, không bắt buộc cho vận hành hàng ngày).

**Đánh giá:** Redis là **dependency bắt buộc thật sự**, không thể bỏ mà không đổi thiết kế Cart (ngoài phạm vi audit). `redis.host` mặc định `localhost` (`backend/src/config/configuration.ts:16`) — chạy cục bộ được, nhưng Redis **không có bản Windows chính thức** (dự án Redis chính thức ngừng hỗ trợ Windows từ nhiều năm) — cần Docker, WSL2, hoặc bản thay thế (Memurai) để chạy trên Windows thuần. Đây là điểm quyết định trực tiếp ảnh hưởng Decision SC12 (Option A "không Docker" khó khả thi thuần túy nếu giữ Redis).

## 5. BullMQ dependency

**Hiện tại:** `backend/src/queue/queue.module.ts:7-22` — `BullModule.forRootAsync` dùng cùng connection Redis. Duy nhất 1 queue tồn tại trong toàn bộ codebase: `MAIL_QUEUE` (`backend/src/modules/auth/auth.module.ts:27`, dùng bởi `mail.processor.ts`/`mail.service.ts`) — phục vụ gửi OTP quên mật khẩu qua email (luồng phụ).

**Đánh giá:** BullMQ hiện chỉ phục vụ 1 luồng không bắt buộc (forgot-password email). Về mặt kỹ thuật, nếu Redis được giữ lại vì Cart (mục 4), BullMQ tiếp tục dùng chung connection đó — không phát sinh dependency mới. Nếu tương lai loại bỏ Redis hoàn toàn, BullMQ cũng phải loại bỏ cùng — nhưng đó là quyết định thiết kế lớn (đổi cả Cart), ngoài phạm vi audit.

## 6. SMTP dependency

**Hiện tại:** `backend/src/modules/auth/infrastructure/mail/mail.processor.ts:19,47-52` — `transporter` chỉ tạo khi `mail.host` có giá trị; nếu không, `if (!this.transporter) { log OTP ra console; return; }` — **đã tự động graceful-degrade khi thiếu SMTP**, không throw lỗi, không chặn luồng. `backend/.env.example:20-25` xác nhận đây là hành vi có chủ đích ("Để trống ở dev → MailService log ra console thay vì gửi thật").

**Đánh giá:** Luồng duy nhất phụ thuộc SMTP là `forgot-password` (`backend/src/modules/auth/presentation/auth.controller.ts:164,179,192` — 3 route `forgot-password`/`verify-otp`/`reset-password`) — không phải luồng bắt buộc cho vận hành bán hàng hàng ngày. **Gap thật sự** (Decision SC06 yêu cầu rõ): hiện **không có route/cơ chế admin reset password nào khác** — không có module `user` quản trị tài khoản riêng, không có endpoint cho phép Owner/Admin đặt lại mật khẩu người khác trực tiếp (đã grep toàn bộ `rbac`/`auth`, không tìm thấy). Khi SMTP trống, cách duy nhất lấy được OTP là đọc log server — không phải quy trình admin chính thức. **Cần quyết định thiết kế riêng ở Implementation Plan T010 tiếp theo** (không tự thêm route ở audit này).

## 7. External API dependency

**Hiện tại:** Grep `https?://` toàn bộ `backend/src` (loại trừ `*.spec.ts`) chỉ khớp: `CORS_ORIGIN` default (`localhost:3001`), và 3 chuỗi ví dụ Swagger `@ApiProperty({ example: 'https://cdn.example.com/...' })` trong `create-product.dto.ts:57`, `create-brand.dto.ts:19,30`, `create-category.dto.ts:46` — đây là **documentation example only**, không phải lời gọi API thật.

**Đánh giá:** Không có tích hợp API bên ngoài nào (cổng thanh toán online, dịch vụ bên thứ 3) trong code hiện tại. Module `payment` (`backend/src/modules/payment/application/payment.service.ts:13-16`) xác nhận rõ trong comment: chỉ ghi nhận thanh toán nội bộ, không endpoint public tạo Payment độc lập, không gọi gateway ngoài. Product/Brand/Category có field URL ảnh tùy chọn — nếu người dùng nhập URL ảnh trỏ ra ngoài, hiển thị ảnh đó sẽ cần Internet, nhưng đây là dữ liệu người dùng nhập, không phải dependency hệ thống bắt buộc.

## 8. CDN or remote asset dependency

**Hiện tại:** `frontend/src/app/layout.tsx:2,6-13` dùng `next/font/google` (`Geist`, `Geist_Mono`) — cơ chế này **tải font lúc build và tự host**, không gọi Google Fonts CDN lúc runtime (hành vi chuẩn của Next.js từ bản 13+). Grep `https?://` toàn bộ `frontend/src` chỉ khớp duy nhất `frontend/src/lib/api.ts:4` (`localhost:3000`).

**Đánh giá:** Không có CDN/remote asset runtime nào. Lưu ý: bước `build` cần Internet 1 lần để tải font (không phải runtime — nằm ngoài phạm vi "vận hành bình thường" của SC05).

## 9. Frontend desktop usability

**Hiện tại:** `frontend/src/app/` chỉ có `layout.tsx` + `page.tsx` (trang mặc định từ `create-next-app`, chưa có route nghiệp vụ nào). `frontend/src/components/` chỉ có `theme-toggle.tsx` + 2 component shadcn (`button.tsx`, `dropdown-menu.tsx`). Không có Tailwind breakpoint/responsive logic dành riêng cho mobile trong các file hiện có.

**Đánh giá:** **Chưa có gì để đánh giá usability** — frontend hiện là scaffold thuần (tooling: Next.js/Tailwind/shadcn/react-query/zustand/react-hook-form/zod đã cài, chưa có màn hình nghiệp vụ nào). Không phải regression — đúng tiến độ dự án (Sprint-01 tập trung Master Data backend trước). Yêu cầu SC08 (độ phân giải tối thiểu 1366×768, ưu tiên bàn phím/tìm kiếm nhanh) cần đưa vào Implementation Plan khi bắt đầu code frontend thật (T024 theo roadmap mới).

## 10. Browser printing readiness

**Hiện tại:** Grep `pdfkit`/`PDFDocument` toàn backend chỉ khớp `purchase-report` (xuất báo cáo PDF, không phải hóa đơn bán hàng). Module `invoice` (`backend/src/modules/invoice/`) chỉ có Entity/Repository/Service/Controller ghi nhận dữ liệu hóa đơn — không có template HTML, không có layout 80mm/A4, không có route in ấn nào.

**Đánh giá:** 0% sẵn sàng — đúng dự kiến, đây là phạm vi T021 (Invoice Printing) trong roadmap mới, chưa tới lượt.

## 11. USB barcode scanner compatibility

**Hiện tại:** Module `barcode` (vừa DONE ở T009) chỉ có API tra cứu/quản lý mã vạch (`GET /barcodes`, CRUD) — không có logic phía frontend nào (frontend chưa có UI). Máy quét USB hoạt động như bàn phím (HID) về bản chất không cần driver/tích hợp phần cứng đặc biệt ở backend — chỉ cần ô input nhận ký tự nhanh + Enter ở frontend, hiện **chưa tồn tại** vì frontend chưa có màn hình bán hàng.

**Đánh giá:** Backend đã có đủ API để tra cứu theo `code` (`BarcodeService.search()`, `GET /barcodes?search=`). Phần còn thiếu hoàn toàn nằm ở frontend (chưa bắt đầu) — không có rủi ro kỹ thuật đặc biệt (SC09 xác nhận: máy quét USB dạng bàn phím không cần tích hợp phần cứng riêng).

## 12. Windows startup options

**Hiện tại:** Grep toàn repo (loại `node_modules`) cho `*.bat`/`*.ps1`/`*.nsi`/`*.iss`: **0 kết quả**. `package.json` gốc (`e:\kiotviet off\package.json:6-9`) chỉ có `prepare`/`release` (Husky, changelog) — không có script khởi động gộp backend+frontend+Postgres+Redis.

**Đánh giá:** Chưa có bất kỳ cơ chế khởi động Windows nào (không script, không dịch vụ, không tự khởi động cùng Windows). Cần xây từ đầu ở T022 (Offline Single-Computer Deployment).

## 13. Backup and restore readiness

**Hiện tại:** Grep `pg_dump`/`pg_restore`/`backup` (không phân biệt hoa thường) toàn `backend/src`: **0 kết quả**.

**Đánh giá:** Chưa có bất kỳ code backup/restore nào — hoàn toàn greenfield, đúng phạm vi T023.

## 14. Existing frontend scope

**Hiện tại:** Toàn bộ file `.ts`/`.tsx` trong `frontend/src` (9 file): `app/layout.tsx`, `app/page.tsx`, `components/theme-toggle.tsx`, `components/ui/button.tsx`, `components/ui/dropdown-menu.tsx`, `lib/api.ts`, `lib/utils.ts`, `providers/index.tsx`, `providers/query-provider.tsx`, `providers/theme-provider.tsx`.

**Đánh giá:** Xác nhận lại mục 9 — frontend hiện = tooling/scaffold, 0 màn hình nghiệp vụ. Axios client (`lib/api.ts`) đã trỏ đúng `localhost:3000/api/v1` mặc định.

## 15. Existing business modules

**Hiện tại:** `backend/src/modules/` có 27 module: `auth, barcode, branch, brand, cart, category, checkout, customer, customer-point, discount, inventory, inventory-adjustment, invoice, organization, payment, platform, product, purchase-order, purchase-report, purchase-return, rbac, stock-count, supplier, supplier-debt, transfer, unit, warehouse`. Theo `docs/SPRINT_DASHBOARD.md` (cập nhật sau T009): chỉ **5 module đã qua đúng quy trình Audit→RFC→SPEC→Implementation→Release** (`DONE`): Product, Category, Brand, Unit, Barcode. Toàn bộ module còn lại (Customer/Supplier/Cart/Checkout/Discount/Inventory*/Invoice/Payment/Purchase*/Stock-count/Transfer/Warehouse) là **scaffold code từ Sprint-00** — có code, có test, nhưng chưa qua Specification First chính thức.

**Đánh giá:** Khớp chính xác roadmap mới (T011-T019 lần lượt Audit lại Customer/Supplier/Sales/Purchase/Debt/Cashbook/Inventory). Không phát hiện module nào ngoài roadmap.

## 16. Current installer or packaging status

**Hiện tại:** `.github/workflows/` chỉ có `backend-ci.yml`/`frontend-ci.yml` (test/lint, không có bước build-installer/package/release artifact). Không có `electron-builder`, không `pkg`, không NSIS/Inno Setup config ở bất kỳ đâu trong repo.

**Đánh giá:** 0% — chưa có packaging/installer nào, đúng phạm vi T022.

## 17. Whether Docker is necessary

**Bằng chứng tổng hợp từ mục 3, 4, 12:**
- PostgreSQL: có thể cài native trên Windows (MSI installer chính thức tồn tại) — Docker không bắt buộc.
- Redis: **không có bản Windows chính thức** — cần 1 trong 3: Docker container, WSL2 + Redis Linux, hoặc Memurai (bản thương mại tương thích Redis cho Windows). Đây là yếu tố quyết định chính.
- Hiện tại `docker-compose.yml` gốc đã có sẵn 3 service (`postgres`, `redis`, `backend`) — hạ tầng Docker Compose đã tồn tại, chỉ thiếu service `frontend`.

**Đánh giá (không tự quyết định, chỉ trình bày):** Nếu giữ nguyên Redis (do Cart phụ thuộc thật — mục 4), **Docker (hoặc WSL2/Memurai) gần như bắt buộc** trên Windows thuần — Option A "không Docker" của Decision SC12 khó khả thi 100% trừ khi thêm 1 trong 2 phương án thay thế Redis. Đây là **quyết định kiến trúc cần Architect chọn**, không phải điều Claude Code tự quyết ở bước audit.

## 18. Whether localhost-only configuration is sufficient

**Hiện tại:**
- Backend: `backend/src/main.ts:70` không truyền host → mặc định bind mọi interface. `backend/src/config/configuration.ts` không có field `host` nào để cấu hình qua biến môi trường. `backend/src/config/env.validation.ts` cũng không có `HOST`/`BIND_ADDRESS`.
- Docker Compose: `docker-compose.yml:9-10,22-23,43-44` — cả 3 port map (`5432:5432`, `6379:6379`, `3000:3000`) đều dùng dạng `"HOST_PORT:CONTAINER_PORT"` không kèm địa chỉ — Docker mặc định publish ra **mọi interface host**, không chỉ `127.0.0.1`.
- WebSocket Gateway: `backend/src/websocket/app.gateway.ts:15` — CORS mặc định `process.env.CORS_ORIGIN ?? '*'` — cho phép mọi origin nếu biến môi trường trống (khác với HTTP CORS ở `main.ts` vốn đã có whitelist chặt).
- Grep `0.0.0.0` toàn repo: **0 kết quả** — xác nhận không có dòng code nào chủ động bind `0.0.0.0`; hành vi hiện tại là **mặc định ngầm của Node/Docker**, không phải yêu cầu thiết kế đã viết ra.

**Đánh giá:** `localhost`-only **chưa** được cấu hình — cần thay đổi cụ thể (ngoài phạm vi audit, để lại cho Implementation Plan T010 kế tiếp):
1. `main.ts`: `app.listen(port, '127.0.0.1')`.
2. `docker-compose.yml`: đổi port map thành `"127.0.0.1:PORT:PORT"` cho cả 3 service (nếu vẫn dùng Docker).
3. `app.gateway.ts`: xác nhận lại giá trị mặc định CORS khi không dùng LAN nữa.

---

## Tổng hợp — sẵn sàng theo từng nhóm

| Nhóm | Trạng thái | Ghi chú |
|---|---|---|
| Backend khởi động | 🟡 Cần sửa nhỏ | Bind mọi interface → cần ép `127.0.0.1` |
| Frontend khởi động | 🟢 Sẵn sàng | `next start`, không PWA, không static export |
| PostgreSQL local | 🟢 Sẵn sàng qua Docker · 🟡 Chưa có hướng dẫn native Windows | |
| Redis | 🔴 Vướng nhất | Bắt buộc thật (Cart), không có bản Windows chính thức — quyết định Docker/WSL2/Memurai cần Architect chọn |
| BullMQ | 🟢 Không vấn đề | Ăn theo Redis, chỉ 1 queue (mail OTP) |
| SMTP | 🟢 Đã graceful-degrade | Nhưng thiếu cơ chế admin reset password thay thế — cần quyết định thiết kế |
| External API | 🟢 Sạch | Không tích hợp ngoài nào |
| CDN/remote asset | 🟢 Sạch | Font tự host qua `next/font` |
| Frontend usability | ⚪ N/A | Chưa có UI để đánh giá — đúng tiến độ |
| Printing | ⚪ 0%, đúng phạm vi T021 | |
| Barcode scanner | 🟢 Backend sẵn sàng · ⚪ Frontend chưa có | |
| Windows startup | ⚪ 0%, đúng phạm vi T022 | |
| Backup/restore | ⚪ 0%, đúng phạm vi T023 | |
| Frontend scope | ⚪ Scaffold thuần | |
| Business modules | 🟢 Khớp roadmap | 5/27 DONE, còn lại chờ Audit riêng từng module |
| Installer/packaging | ⚪ 0%, đúng phạm vi T022 | |
| Docker cần thiết? | 🟡 Có khả năng bắt buộc | Vì Redis, không phải vì Postgres |
| Localhost-only? | 🔴 Chưa cấu hình | Đang bind mọi interface theo mặc định ngầm |

🟢 Sẵn sàng/không vấn đề · 🟡 Cần quyết định hoặc sửa nhỏ · 🔴 Vướng thật, cần quyết định kiến trúc · ⚪ Chưa tới phạm vi (đúng tiến độ, không phải gap ngoài kế hoạch)

## Câu hỏi mở cần Architect quyết định (không tự chọn)

1. **Redis trên Windows** (mục 4, 17): giữ Docker cho riêng Redis, chuyển sang WSL2, hay dùng Memurai? Ảnh hưởng trực tiếp Decision SC12 Option A vs B.
2. **Admin password reset** (mục 6): có cần route/CLI riêng cho Owner reset mật khẩu nhân viên khác không phụ thuộc SMTP, hay chấp nhận đọc OTP qua log server là đủ cho single-computer?
3. **Deployment Option cuối cùng** (SC12): Option A (Postgres native + Redis qua WSL2/Memurai, không Docker) hay Option B (Docker Compose, kể cả khi chỉ 1 máy)? Bằng chứng ở mục 17 cho thấy Option A "hoàn toàn không Docker" khó đạt 100% nếu giữ Redis nguyên trạng.

---

## ARCHITECTURE REVIEW — T010 Offline Single-Computer Readiness Audit

**Kết quả: APPROVED.** AR01-AR07 đều APPROVED — audit process đúng quy trình (không sửa source code, không migration, không commit, có bằng chứng file:line, dừng đúng lúc); §"Roadmap Sprint-01 cũ... SUPERSEDED" (AR06) và việc không refactor ngoài phạm vi (AR07) được xác nhận đúng.

Cả 3 câu hỏi mở đã được quyết định:

- **AD01 — Redis Dependency:** KHÔNG loại Redis. Chuỗi phụ thuộc thật `POS → Cart → Redis` (mục 4) xác nhận Redis không còn là dependency phụ mà là dependency của nghiệp vụ bán hàng — Cart cần tốc độ, là dữ liệu tạm, chuyển về PostgreSQL chỉ để bỏ Redis không mang lại lợi ích tương xứng với chi phí refactor. **Redis chính thức là thành phần bắt buộc của Offline Single-Computer Edition**, không còn coi là tùy chọn.
- **AD02 — Docker:** Do AD01 đã chốt giữ Redis (không có bản Windows chính thức, mục 17), **Docker Compose (SC12 Option B) được nâng thành Preferred Deployment** — không dùng Option A (Postgres native, không Docker) trừ khi có lý do đặc biệt. Không cần Memurai/WSL2 riêng/cấu hình Redis service thủ công.
- **AD03 — localhost:** Xác nhận đúng phát hiện ở mục 18 (`app.listen(port)` không truyền host → bind mọi interface theo mặc định ngầm, không phải lỗi, chỉ chưa tối ưu cho mục tiêu 1 máy). Quyết định: **Backend Offline Edition mặc định bind `127.0.0.1`**, không bind mọi interface. Nếu sau này có bản LAN sẽ cấu hình riêng (không xóa khả năng mở rộng, chỉ đổi default).
- **AD04 — Seed Production:** Việc Claude Code dừng lại ở phát hiện `NODE_ENV=production` chặn seed (mục 6, câu hỏi mở #2 mở rộng) được xác nhận là đúng — **không bỏ check production** (nguy hiểm, mất lý do tồn tại ban đầu của guard). Thay vào đó: **tạo installer bootstrap riêng, độc lập với `NODE_ENV`** (ví dụ `npm run bootstrap-offline`/`npm run installer:init`) — chạy đúng 1 lần, tạo Admin/Organization/Branch/Warehouse, seed Permission/Setting. Đây là hướng sạch hơn giữ nguyên seed script hiện tại (không sửa `prisma/seed.ts`), thêm script mới riêng biệt.

**Kết luận T010: PASS.**


