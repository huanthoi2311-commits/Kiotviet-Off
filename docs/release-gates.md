# POS ERP Enterprise v1.0 — Release Gates

**Prompt:** 015A — Hardening Gate
**Mục đích:** Chặn tiến độ đúng chỗ (trước khi viết nghiệp vụ mới) và đúng lúc (trước khi release), tránh vừa "chặn bừa" làm chậm dự án vừa "bỏ qua hết" tích lũy rủi ro đến cuối.

> Trạng thái ở đây phản ánh **thời điểm gần nhất được xác minh** — không phải cam kết vĩnh viễn. Mỗi lần một module lớn merge, chạy lại checklist Gate tương ứng.

---

## Gate A — Trước khi phát triển nghiệp vụ (Product, Order, Inventory...)

**Bắt buộc trước khi bắt đầu bất kỳ Prompt module nghiệp vụ nào (016+).**

| # | Kiểm tra | Lệnh | Trạng thái | Ghi chú |
|---|---|---|---|---|
| 1 | TypeScript Build | `npm run build` | ✅ PASS | `nest build` không lỗi |
| 2 | ESLint | `npx eslint "{src,test}/**/*.ts"` | ✅ PASS | 0 lỗi, 0 warning |
| 3 | TypeCheck | `npx tsc --noEmit` | ✅ PASS | Bao gồm cả `prisma/seed.ts` |
| 4 | Unit Test | `npx jest` | ✅ PASS | 47/47 test, 7 test suite |
| 5 | Prisma Validate | `npx prisma validate` | ✅ PASS | Schema hợp lệ |
| 6 | Dependency Injection | `Test.createTestingModule({imports:[AppModule]}).compile()` | ✅ PASS | Toàn bộ graph resolve được, không cần DB/Redis thật (chỉ `.compile()`, không gọi `app.init()`) |
| 7 | Swagger Generation | `SwaggerModule.createDocument(app, ...)` | ✅ PASS | 15 route phát hiện đúng (Auth: 9, RBAC: 5, Health: 1) |
| 8 | Migration Integrity | `prisma migrate diff` theo từng bước | ✅ PASS | 3 migration nối tiếp nhau không xung đột: `init` → `add_refresh_token_last_used_at` → `session_and_permission_version` |

**Kết luận: Gate A = PASS** (xác minh lần cuối: 2026-07-14). Được phép sang Prompt 016.

**Giới hạn đã biết của Gate A:** các kiểm tra trên chạy **offline** (không có Postgres/Redis thật đứng sau) — chứng minh code đúng cú pháp, kiểu, logic đơn vị và cấu trúc DI, **không chứng minh** hệ thống chạy đúng khi có I/O thật (query SQL thật, network Redis thật, gửi mail thật). Đó là lý do Gate B tồn tại.

---

## Gate B — Trước Alpha (Docker Integration Test)

**Trạng thái: 🟡 PENDING** — chưa chạy được vì môi trường sandbox hiện tại không có Docker (`docker: command not found`). Đây **không phải lỗi code**, mà là giới hạn môi trường thực thi của phiên làm việc này.

**Không được gắn nhãn "Production Ready" hay merge vào nhánh `main`/release cho đến khi Gate B chuyển PASS.**

| # | Hạng mục | Cách xác minh |
|---|---|---|
| 1 | PostgreSQL thật | `docker compose up -d postgres`, `prisma migrate deploy` chạy sạch |
| 2 | Redis thật | `docker compose up -d redis`, `RedisModule` connect không lỗi |
| 3 | BullMQ | Queue `mail` xử lý job thật (không chỉ mock) |
| 4 | Mail | `MailService` gửi qua SMTP thật hoặc Mailhog/Mailtrap ở dev |
| 5 | Login | `POST /auth/login` trả access+refresh hợp lệ với user thật trong DB |
| 6 | Refresh | `POST /auth/refresh` xoay vòng token, session cũ bị revoke trong DB |
| 7 | Logout / Logout All | Session bị revoke đúng phạm vi (1 thiết bị / toàn bộ) |
| 8 | Forgot Password / OTP | OTP thật gửi qua mail, verify, reset, cooldown 60s hoạt động qua Redis thật |
| 9 | Session Management | `GET /auth/sessions` trả đúng danh sách, `DELETE /auth/sessions/:id` revoke đúng |
| 10 | RBAC | Đổi permission của role → user cũ bị bắt login lại (permissionVersion) |
| 11 | Swagger | UI `/api/docs` render và gọi thử được qua trình duyệt |
| 12 | Kiểm thử API | Chạy bộ Postman/Newman hoặc tương đương |

Checklist chi tiết từng bước: [integration-test-checklist.md](./integration-test-checklist.md).

**Điều kiện chuyển Gate B → PASS:** người vận hành (bạn) chạy được toàn bộ 12 mục trên với môi trường có Docker, báo kết quả lại — pass hết mới đóng gate.

---

## Gate C — Trước Beta (Performance)

**Trạng thái: ⬜ NOT STARTED** — chưa đến giai đoạn phù hợp (chưa có module nghiệp vụ nào để đo tải thực tế).

| Hạng mục | Mô tả |
|---|---|
| Load test | k6/Artillery mô phỏng tải POS giờ cao điểm (nhiều chi nhánh đồng thời) |
| Stress test | Xác định điểm gãy (DB connection pool, Redis, BullMQ concurrency) |
| Memory leak | Chạy dài hạn (soak test), theo dõi heap Node.js |
| Benchmark | So sánh thời gian phản hồi API trước/sau mỗi module lớn |

## Gate D — Trước Production

**Trạng thái: ⬜ NOT STARTED**

| Hạng mục | Mô tả |
|---|---|
| Security audit | Rà soát OWASP Top 10, đặc biệt injection/broken auth/broken access control |
| Backup/Restore | Kịch bản backup Postgres định kỳ + restore thử nghiệm |
| Disaster recovery | Runbook khôi phục khi mất dịch vụ (DB, Redis, Queue) |
| Monitoring | Alerting cho lỗi 5xx tăng đột biến, queue backlog, DB connection exhaustion |

---

## Quy tắc áp dụng

1. Gate A phải PASS trước khi mở bất kỳ Prompt module nghiệp vụ nào (016 trở đi).
2. Gate B phải PASS trước khi gắn nhãn "Alpha" hoặc merge vào nhánh phát hành.
3. Không bao giờ tự ý bỏ qua Gate B chỉ vì Gate A đã PASS — hai gate xác minh hai lớp rủi ro khác nhau (đúng logic vs. đúng khi chạy thật).
4. Mỗi khi có thay đổi lớn ở tầng nền tảng (schema, auth, RBAC), chạy lại toàn bộ Gate A trước khi tiếp tục.
