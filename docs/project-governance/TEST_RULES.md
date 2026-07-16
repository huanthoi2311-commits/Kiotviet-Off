# TEST_RULES

Chiến lược kiểm thử 5 lớp, theo ADR-0012 (`docs/architecture/adr/ADR-0012-testing-strategy.md`).

## 1. Unit Test — bắt buộc, đã trưởng thành

- Công cụ: Jest.
- **Coverage ≥90%** (quy tắc chuẩn dự án từ Foundation) — đo bằng `npx jest --coverage`, đối chiếu cả 4 chỉ số (Statements/Branch/Functions/Lines).
- Mock mọi phụ thuộc ngoài: Service test mock Repository INTERFACE (không mock Prisma trực tiếp); Repository test mock Prisma Client.
- Trước khi báo "Coverage đạt yêu cầu" cho 1 thay đổi, so sánh với baseline TRƯỚC thay đổi bằng `git stash`/`git stash pop` nếu không chắc chắn — không suy đoán, không làm tròn số liệu để che giấu giảm sút (xem `REVIEW_RULES.md`).

## 2. Integration Test (e2e) — bắt buộc có bộ test, chấp nhận PENDING nếu thiếu hạ tầng

- File `*.e2e-spec.ts`, chạy với Postgres/Redis THẬT qua Docker (`npm run test:e2e`).
- Nếu môi trường làm việc không có Docker: viết/cập nhật bộ test đầy đủ, xác nhận biên dịch đúng qua TypeCheck, nhưng **báo cáo trạng thái PENDING**, không được báo PASS hay dùng ký hiệu mập mờ (`⚠️`) khiến người đọc hiểu nhầm là đã chạy — xem `REVIEW_RULES.md` §3.

## 3. Architecture Test — bắt buộc cho MỌI bất biến kiến trúc xuyên module

Thiết lập từ T004.5 (Sprint-00) — bài học: Unit Test không đủ để bảo vệ bất biến kiến trúc, vì mỗi module tự test đúng logic CỦA NÓ, không có test nào nhìn xuyên suốt hệ thống.

Bắt buộc viết Architecture Test tự động khi:
- Có bất biến "chỉ 1 module được ghi vào X" (Single Writer, xem `ARCHITECTURE_RULES.md` §2).
- Có bất biến "module A phải import module B" hoặc "module A không được import module B".
- Có bất biến "class X chỉ được export field Y" (kiểm tra qua `Reflect.getMetadata`, không phải match text đơn giản).

Kỹ thuật tham chiếu (`backend/src/modules/inventory/single-writer.architecture.spec.ts`):
- Quét toàn bộ file `.ts` trong phạm vi liên quan, kiểm tra pattern cấm bằng regex.
- Đọc metadata `@Module()` thật qua `import` TĨNH (không dùng `require()` — vi phạm lint `no-require-imports`; không dùng `import()` động — ts-jest CommonJS transform không hỗ trợ nếu thiếu `--experimental-vm-modules`).

**Architecture Test PHẢI nằm trong bộ Unit Test chạy mỗi lần `npm test`** — không phải script kiểm tra rời rạc cần nhớ chạy riêng.

## 4. Performance Test — chưa thiết lập, không giả vờ đã có

Trạng thái tại Sprint-00: NOT STARTED (khớp Gate C, `docs/release-gates.md`). Khi 1 Sprint chạm tới rủi ro hiệu năng cụ thể (vd Event Bus/Outbox Worker throughput ở Sprint-01), Sprint đó tự bổ sung nội dung — không mặc định coi Performance Test đã có sẵn khung/công cụ.

## 5. Security Test — chưa thiết lập, không giả vờ đã có

Trạng thái tại Sprint-00: NOT STARTED (khớp Gate D, `docs/release-gates.md`). OWASP Top 10, đặc biệt injection/broken auth/broken access control — chưa có quy trình rà soát tự động, chỉ có nguyên tắc chung (không hardcode secret, hash password bằng Argon2id, refresh token lưu HMAC hash).

## 6. Không được báo PASS khi chưa thực sự xác minh

Đây là kỷ luật quan trọng nhất, rút ra từ Sprint-00: honest disclosure của 1 thiếu sót KHÔNG tự động là giải pháp — nếu thiếu sót fix được trong phạm vi hợp lý, phải fix trước khi báo cáo, không dừng ở "đã ghi chú rõ ràng" (xem `REVIEW_RULES.md` §4 cho ví dụ cụ thể: coverage giảm nhẹ ban đầu bị từ chối, chỉ được chấp nhận sau khi thực sự khắc phục bằng test thật, không phải diễn giải lại số liệu).
