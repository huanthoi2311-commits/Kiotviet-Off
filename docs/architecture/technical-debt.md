# Technical Debt / Operational Pending Register

**Mục đích** (Decision T006-R05): theo dõi tập trung các mục đang ở trạng thái PENDING do giới hạn môi trường phát triển (không có Docker/Postgres/Redis trong sandbox hiện tại) — **không phải Bug, không phải Technical Debt thật, không mở Hotfix**. Đây là nhật ký vận hành (Operational Pending), khác `Bug`/`Hotfix` ở chỗ nguyên nhân là hạ tầng, không phải lỗi thiết kế/code.

**Quy ước:** mỗi mục ghi rõ Nguyên nhân, Điều kiện để hoàn thành, Mức độ ưu tiên, Sprint dự kiến xử lý. Xóa mục khỏi bảng (không xóa lịch sử — chuyển xuống "Đã xử lý" bên dưới) khi đã chuyển PASS thật trên môi trường có Docker.

---

## Đang PENDING

### 1. Integration Test (e2e) — toàn dự án

- **Phát sinh từ:** Sprint-00 (T004), tiếp tục ở T005, T006, T007, T008, T009, T011.
- **Nguyên nhân:** Sandbox phát triển hiện tại không có Docker/Postgres/Redis — không thể chạy `npm run test:e2e` thật.
- **Điều kiện để hoàn thành:** Có môi trường Docker (`docker-compose up`), chạy `npm run test:e2e`, xác nhận toàn bộ `test/*.e2e-spec.ts` PASS. `category`: cần tạo mới `test/category.e2e-spec.ts` (chưa tồn tại). `customer`: cần tạo mới `test/customer.e2e-spec.ts` (chưa tồn tại — T011 chỉ có Unit Test, chưa có Integration Test riêng). `brand`/`unit`/`barcode`: `test/brand.e2e-spec.ts`, `test/unit.e2e-spec.ts` và `test/barcode.e2e-spec.ts` đã tồn tại và đã cập nhật đủ case CRUD/Restore/Optimistic Lock (T009: cả 4 thao tác ghi)/Delete Guard/Unit Reference Guard/isActive filter — chỉ chờ môi trường để chạy thật.
- **Mức độ ưu tiên:** Cao — chặn Operational Complete của mọi Task từ T004 trở đi.
- **Sprint dự kiến xử lý:** Khi có môi trường CI/CD thật với Docker (ngoài phạm vi 1 Sprint task cụ thể — thuộc hạ tầng dự án).

### 2. Rollback Test — migration của T005 (Product), T006 (Category), T007 (Brand), T008 (Unit), T009 (Barcode) và T011 (Customer)

- **Nguyên nhân:** Cùng lý do #1 — không có Postgres để chạy `up → rollback.sql → up` thật.
- **Điều kiện để hoàn thành:** Chạy từng `rollback.sql` (15 file: 3 của T005 + 3 của T006 + 1 của T007 + 2 của T008 + 2 của T009 + 3 của T011, cộng 1 file gộp T005 Migration 1+2) trên Postgres thật, xác nhận schema về đúng trạng thái trước migration, chạy `up` lại lần 2 xác nhận idempotent.
- **Mức độ ưu tiên:** Cao — rollback chưa kiểm thử thật là rủi ro nếu cần rollback khẩn cấp trong tương lai.
- **Sprint dự kiến xử lý:** Cùng với #1, khi có môi trường Docker.

### 3. Manual API Smoke Test — Product (T005), Category (T006), Brand (T007), Unit (T008), Barcode (T009) và Customer (T011)

- **Nguyên nhân:** Cần app chạy thật (`npm run start:dev`, cần Postgres/Redis) để gọi HTTP endpoint qua Swagger UI/curl.
- **Điều kiện để hoàn thành:** Khởi động app thật, gọi đủ route của `product` (6 route), `category` (7 route), `brand` (6 route), `unit` (6 route, bao gồm `restore`), `barcode` (7 route: `GET /barcodes` mới, `GET`/`POST /products/:productId/barcodes`, `PATCH`/`DELETE`/`POST .../restore`/`POST .../default`) và `customer` (8 route: `POST`/`GET`/`GET :id`/`PATCH`/`POST :id/activate`/`POST :id/deactivate`/`DELETE`/`POST :id/restore`), xác nhận response shape khớp DTO hiện tại và body `{ version }` bắt buộc đúng ở các route ghi.
- **Mức độ ưu tiên:** Trung bình — Unit Test đã bao phủ logic nghiệp vụ, Smoke Test xác nhận thêm wiring HTTP/Swagger/Validation Pipe thật.
- **Sprint dự kiến xử lý:** Cùng với #1.

### 4. Query Performance Benchmark — Category (>1000 category, Decision S06)

- **Nguyên nhân:** Cần Postgres thật với dữ liệu lớn (≥1000 category, đa cấp) để đo thời gian `GET /categories?search=...` và `GET /categories/tree`.
- **Điều kiện để hoàn thành:** Seed ≥1000 category trong 1 Organization, đo thời gian phản hồi 2 route trên. Không có ngưỡng SLA cụ thể trong SPEC-CATEGORY-001 — chỉ cần có số đo thật thay vì chỉ dựa vào thiết kế lý thuyết (Adjacency List, 1 query + in-memory traversal, không N+1 — đã xác nhận qua code review, chưa xác nhận qua đo đạc thật).
- **Mức độ ưu tiên:** Thấp — rủi ro thấp trong thực tế (catalog danh mục thường nhỏ hơn nhiều so với 1000), nhưng cần đóng lại để T006 đạt Operational Complete đầy đủ.
- **Sprint dự kiến xử lý:** Cùng với #1, hoặc khi có nhu cầu thực tế về quy mô dữ liệu lớn.

### 5. Tăng Branch Coverage của Barcode lên ≥90% (Decision FR01, T009 Final Release Review)

- **Nguyên nhân:** Coverage module `barcode` đạt 98.1% statements/100% functions/98.25% lines nhưng chỉ 83.14% branch — một số nhánh điều kiện (chủ yếu no-op event hook, vài nhánh phụ trong `barcode.service.ts`/`prisma-barcode.repository.ts`) chưa có test riêng.
- **Điều kiện để hoàn thành:** Bổ sung test case cho các nhánh chưa phủ (xem chi tiết `Uncovered Line #s` trong báo cáo coverage — `barcode.service.ts:129,155,214,264,314`, `prisma-barcode.repository.ts:24,303`), đưa branch coverage lên ≥90%.
- **Mức độ ưu tiên:** Thấp — Decision FR01 xác nhận không chặn Release; statements/functions/lines đã vượt ngưỡng.
- **Sprint dự kiến xử lý:** Khi có thời gian rảnh trong Sprint-01, không gấp — có thể gộp cùng lúc dọn nợ kỹ thuật khác.

### 6. Tối ưu CI để giảm Flaky Test khi chạy song song (Decision FR02, T009 Final Release Review)

- **Nguyên nhân:** `argon2-password-hasher.spec.ts` và `purchase-report-export.adapter.spec.ts` timeout (mặc định 5000ms) khi chạy `npx jest` toàn backend song song (nhiều worker tranh chấp CPU cho tác vụ nặng CPU — hash Argon2, sinh file `.xlsx` qua `exceljs`). Chạy lại độc lập cả 2 suite: PASS 8/8 — xác nhận là flake môi trường CI cục bộ, không phải Regression.
- **Điều kiện để hoàn thành:** Khi có môi trường CI thật, cân nhắc: tăng `testTimeout` cho 2 spec này, hoặc giới hạn `--maxWorkers` phù hợp với số CPU thật của runner, hoặc tách 2 suite CPU-nặng này chạy riêng khỏi batch song song.
- **Mức độ ưu tiên:** Thấp — Decision FR02 xác nhận không coi là Regression, chỉ cần theo dõi để tối ưu CI về sau.
- **Sprint dự kiến xử lý:** Khi thiết lập môi trường CI/CD thật (cùng nhóm hạ tầng với #1).

### 7. End-to-End Migration Scenario — Customer (T011, Decision SR14)

- **Nguyên nhân:** Cần Postgres thật với dữ liệu Customer trước-migration để xác nhận toàn bộ chuỗi: migration A/B/C → build → test → đăng nhập → đọc/tạo/sửa/archive Customer → `checkout`/`customer-point` vẫn hoạt động (chi tiết `SPEC-T011-CUSTOMER-001.md` §13.1). Đây là Acceptance Criteria #13, được Architect đánh giá là "bài test quan trọng nhất của T011".
- **Điều kiện để hoàn thành:** Chạy đúng chuỗi trên với môi trường Docker + dữ liệu Customer mẫu trước-migration.
- **Mức độ ưu tiên:** Cao — xác nhận migration brownfield không phá vỡ dữ liệu/consumer thật.
- **Sprint dự kiến xử lý:** Cùng với #1, khi có môi trường Docker.

### 8. Tăng Branch Coverage của Customer lên ≥90%

- **Nguyên nhân:** Coverage module `customer` đạt 99.14% statements/100% functions/99.69% lines nhưng chỉ 86.32% branch — cùng tình huống Barcode (T009, mục #5) — một số nhánh điều kiện (decorator route, no-op path) chưa có test riêng.
- **Điều kiện để hoàn thành:** Bổ sung test case cho các nhánh chưa phủ (`customer.service.ts:432`, `customer.controller.ts:48-167`, `sequence-customer-code.generator.ts:12`, `prisma-customer.repository.ts:23,33,86,270`, `customer-point.subscriber.ts:27-44`), đưa branch coverage lên ≥90%.
- **Mức độ ưu tiên:** Thấp — thống kê statements/functions/lines đã vượt ngưỡng, đúng tiền lệ Decision FR01 (T009) không chặn Release. Chờ Final Release Review xác nhận chính thức.
- **Sprint dự kiến xử lý:** Khi có thời gian rảnh trong Sprint-01, có thể gộp cùng #5 (Barcode).

---

## Đã xử lý

*(chưa có mục nào — sẽ cập nhật khi 1 trong các mục trên chuyển PASS thật)*
