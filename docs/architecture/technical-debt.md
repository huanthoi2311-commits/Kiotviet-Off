# Technical Debt / Operational Pending Register

**Mục đích** (Decision T006-R05): theo dõi tập trung các mục đang ở trạng thái PENDING do giới hạn môi trường phát triển (không có Docker/Postgres/Redis trong sandbox hiện tại) — **không phải Bug, không phải Technical Debt thật, không mở Hotfix**. Đây là nhật ký vận hành (Operational Pending), khác `Bug`/`Hotfix` ở chỗ nguyên nhân là hạ tầng, không phải lỗi thiết kế/code.

**Quy ước:** mỗi mục ghi rõ Nguyên nhân, Điều kiện để hoàn thành, Mức độ ưu tiên, Sprint dự kiến xử lý. Xóa mục khỏi bảng (không xóa lịch sử — chuyển xuống "Đã xử lý" bên dưới) khi đã chuyển PASS thật trên môi trường có Docker.

---

## Đang PENDING

### 1. Integration Test (e2e) — toàn dự án

- **Phát sinh từ:** Sprint-00 (T004), tiếp tục ở T005, T006, T007.
- **Nguyên nhân:** Sandbox phát triển hiện tại không có Docker/Postgres/Redis — không thể chạy `npm run test:e2e` thật.
- **Điều kiện để hoàn thành:** Có môi trường Docker (`docker-compose up`), chạy `npm run test:e2e`, xác nhận toàn bộ `test/*.e2e-spec.ts` PASS. `category`: cần tạo mới `test/category.e2e-spec.ts` (chưa tồn tại). `brand`: `test/brand.e2e-spec.ts` đã tồn tại và đã cập nhật đủ case CRUD/Restore/Optimistic Lock/isActive filter (T007) — chỉ chờ môi trường để chạy thật.
- **Mức độ ưu tiên:** Cao — chặn Operational Complete của mọi Task từ T004 trở đi.
- **Sprint dự kiến xử lý:** Khi có môi trường CI/CD thật với Docker (ngoài phạm vi 1 Sprint task cụ thể — thuộc hạ tầng dự án).

### 2. Rollback Test — migration của T005 (Product), T006 (Category) và T007 (Brand)

- **Nguyên nhân:** Cùng lý do #1 — không có Postgres để chạy `up → rollback.sql → up` thật.
- **Điều kiện để hoàn thành:** Chạy từng `rollback.sql` (8 file: 3 của T005 + 3 của T006 + 1 của T007, cộng 1 file gộp T005 Migration 1+2) trên Postgres thật, xác nhận schema về đúng trạng thái trước migration, chạy `up` lại lần 2 xác nhận idempotent.
- **Mức độ ưu tiên:** Cao — rollback chưa kiểm thử thật là rủi ro nếu cần rollback khẩn cấp trong tương lai.
- **Sprint dự kiến xử lý:** Cùng với #1, khi có môi trường Docker.

### 3. Manual API Smoke Test — Product (T005), Category (T006) và Brand (T007)

- **Nguyên nhân:** Cần app chạy thật (`npm run start:dev`, cần Postgres/Redis) để gọi HTTP endpoint qua Swagger UI/curl.
- **Điều kiện để hoàn thành:** Khởi động app thật, gọi đủ route của `product` (6 route), `category` (7 route) và `brand` (6 route, bao gồm `restore` mới), xác nhận response shape khớp DTO hiện tại.
- **Mức độ ưu tiên:** Trung bình — Unit Test đã bao phủ logic nghiệp vụ, Smoke Test xác nhận thêm wiring HTTP/Swagger/Validation Pipe thật.
- **Sprint dự kiến xử lý:** Cùng với #1.

### 4. Query Performance Benchmark — Category (>1000 category, Decision S06)

- **Nguyên nhân:** Cần Postgres thật với dữ liệu lớn (≥1000 category, đa cấp) để đo thời gian `GET /categories?search=...` và `GET /categories/tree`.
- **Điều kiện để hoàn thành:** Seed ≥1000 category trong 1 Organization, đo thời gian phản hồi 2 route trên. Không có ngưỡng SLA cụ thể trong SPEC-CATEGORY-001 — chỉ cần có số đo thật thay vì chỉ dựa vào thiết kế lý thuyết (Adjacency List, 1 query + in-memory traversal, không N+1 — đã xác nhận qua code review, chưa xác nhận qua đo đạc thật).
- **Mức độ ưu tiên:** Thấp — rủi ro thấp trong thực tế (catalog danh mục thường nhỏ hơn nhiều so với 1000), nhưng cần đóng lại để T006 đạt Operational Complete đầy đủ.
- **Sprint dự kiến xử lý:** Cùng với #1, hoặc khi có nhu cầu thực tế về quy mô dữ liệu lớn.

---

## Đã xử lý

*(chưa có mục nào — sẽ cập nhật khi 1 trong các mục trên chuyển PASS thật)*
