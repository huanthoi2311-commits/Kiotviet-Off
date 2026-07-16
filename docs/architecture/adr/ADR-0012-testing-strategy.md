# Status

Accepted

---

# Context

Dự án cần 1 chiến lược kiểm thử rõ ràng, nhiều lớp — không chỉ Unit Test. Kinh nghiệm T004 cho thấy: (a) Unit Test đơn thuần không đủ để xác minh bất biến kiến trúc (vd "không module nào ghi trực tiếp Inventory") — chỉ grep thủ công một lần không đáng tin cậy bằng 1 test tự động chạy mỗi lần CI; (b) Integration Test thật (Docker/Postgres/Redis) hiện không chạy được trong sandbox làm việc, tạo ra khoảng trống cần được disclose rõ, không che giấu; (c) Performance và Security chưa từng được kiểm thử có hệ thống trong dự án.

---

# Decision

5 lớp kiểm thử, mức độ trưởng thành khác nhau tại thời điểm ADR này được ghi lại:

1. **Unit** — Jest, mock mọi phụ thuộc ngoài (Repository interface, Prisma), yêu cầu coverage ≥90% (quy tắc chuẩn dự án từ Foundation). **Đã thiết lập đầy đủ** — 135 suite / 1223 test tại thời điểm T004 hoàn thành.
2. **Integration** — `*.e2e-spec.ts`, chạy với Postgres/Redis thật qua Docker (`npm run test:e2e`). **Đã có bộ test, hiện PENDING** — không chạy được trong sandbox hiện tại (thiếu Docker), xem `docs/release/gate-status.md`.
3. **Architecture** — test tự động đọc metadata `@Module()` (`Reflect.getMetadata`) và quét source theo pattern để xác minh bất biến kiến trúc (vd Single Writer, Repository Boundary) không bị vi phạm — KHÔNG chỉ dựa vào grep thủ công một lần. **Mới thiết lập ở T004.5**, ví dụ tham chiếu: `single-writer.architecture.spec.ts`.
4. **Performance** — load test/stress test cho các luồng POS tải cao (nhiều chi nhánh đồng thời). **Chưa thiết lập** — tương ứng Gate C (`docs/release-gates.md`), trạng thái "NOT STARTED" tại thời điểm ADR này.
5. **Security** — rà soát OWASP Top 10, đặc biệt injection/broken auth/broken access control. **Chưa thiết lập** — tương ứng Gate D (`docs/release-gates.md`), trạng thái "NOT STARTED" tại thời điểm ADR này.

---

# Consequences

**Ưu điểm**
- Architecture Test (lớp 3) là cải tiến thật, đã chứng minh giá trị ở T004.5 — biến 1 lần grep thủ công thành bảo vệ vĩnh viễn trong CI.
- Phân tách rõ 5 lớp giúp báo cáo Gate chính xác — không lẫn lộn "Unit Test PASS" với "hệ thống đã sẵn sàng production" (vốn cần cả Performance/Security).

**Nhược điểm**
- Lớp 4 (Performance) và 5 (Security) hiện chỉ là khung, chưa có nội dung/công cụ cụ thể — ghi nhận trung thực thay vì giả vờ đã có.
- Integration Test PENDING kéo dài là rủi ro thật (không phải lỗi code, nhưng vẫn là khoảng trống xác minh) — cần môi trường Docker thật trước khi bất kỳ Gate Release nào được coi là hoàn tất.

**Ảnh hưởng**
- Mọi Sprint/T00x mới nên tự hỏi cả 5 lớp này áp dụng ở mức nào cho phạm vi của mình, không mặc định chỉ cần Unit Test.
- Gate-01 (Sprint-01 sắp tới) là cơ hội đầu tiên bổ sung nội dung thật cho lớp Performance/Security nếu phạm vi Sprint đó chạm tới rủi ro tương ứng (vd Event Bus/Outbox Worker cần Performance test cho throughput).

---

# Alternatives

- Chỉ dùng Unit + Integration (2 lớp truyền thống), không tách riêng Architecture/Performance/Security thành lớp độc lập.

---

# Rejected

**Chỉ 2 lớp truyền thống** — bị loại. T004 tự chứng minh Unit Test không đủ để bảo vệ bất biến kiến trúc (Single Writer từng bị vi phạm âm thầm bởi 5 module trong nhiều Prompt liên tiếp mà không Unit Test nào phát hiện, vì mỗi module tự test đúng logic CỦA NÓ, không có test nào nhìn xuyên suốt toàn hệ thống) — cần 1 lớp riêng biệt, có phạm vi xuyên-module, để bắt đúng loại lỗi này.

---

# References

- Report: `docs/implementation/sprint-00-t004-report.md` (§10, Architecture Verification).
- Module: `backend/src/modules/inventory/single-writer.architecture.spec.ts`.
- Gate: `docs/release-gates.md` (Gate A-D), `docs/release/gate-status.md` (Sprint-00 T00x).
