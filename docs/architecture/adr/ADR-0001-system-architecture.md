# Status

Accepted

---

# Context

Dự án là 1 hệ thống ERP/POS multi-tenant thương mại (Organization → Branch → Warehouse), cần chọn kiến trúc tổng thể ngay từ Foundation trước khi có bất kỳ module nghiệp vụ nào. Nhiều thao tác nghiệp vụ lõi (vd Checkout: Point → Voucher → Invoice → Payment → Inventory) cần tính ACID xuyên nhiều bounded context trong cùng 1 transaction.

---

# Decision

**Monolithic Modular** — 1 backend NestJS duy nhất, chia theo Module theo bounded context (25+ module: `auth`, `rbac`, `organization`, `branch`, `inventory`, `purchase-order`, `checkout`, ...). **Không Microservice.**

---

# Consequences

**Ưu điểm**
- Deploy đơn giản — 1 process/container duy nhất, không cần điều phối nhiều service.
- Transaction ACID xuyên nhiều domain trong 1 `$transaction` Postgres — vd Checkout ghi Invoice + Payment + Inventory Movement atomic, bất khả thi (hoặc cần Saga rất phức tạp) nếu tách microservice ngay từ đầu.
- Team nhỏ/vừa dễ bảo trì — không cần hạ tầng vận hành riêng cho từng service (network, service discovery, distributed tracing).

**Nhược điểm**
- Scale từng domain độc lập khó hơn microservice thật (phải scale cả app nếu 1 domain quá tải).
- Blast radius lớn hơn — lỗi nghiêm trọng ở 1 module có thể ảnh hưởng toàn bộ process.
- Team lớn dần có nguy cơ đụng độ code nhiều hơn nếu module boundary không được giữ kỷ luật.

**Ảnh hưởng**
- Mọi module dùng chung 1 Prisma Client, 1 database, 1 Node.js process.
- Module boundary chỉ được thực thi ở tầng code (NestJS DI + convention + test kiến trúc tự động — xem ADR-0010), KHÔNG phải network boundary vật lý.

---

# Alternatives

- **Microservice ngay từ đầu** — mỗi bounded context (Inventory, Customer, Purchase...) là 1 service riêng, giao tiếp qua network/message queue.
- **Modular Monolith với ranh giới rõ để tách sau** — đã chọn (Decision ở trên), giữ module boundary chặt (Clean Architecture, xem ADR-0002; Single Writer, xem ADR-0005) để CÓ THỂ tách thành service riêng sau này nếu cần, mà không viết lại từ đầu.

---

# Rejected

**Microservice ngay từ đầu** — bị loại. Độ phức tạp vận hành (network, service discovery, distributed transaction/Saga, observability xuyên service) không tương xứng với quy mô team và giai đoạn hiện tại của dự án; ưu tiên tốc độ phát triển tính năng và tính đúng đắn transaction (ACID) hơn khả năng scale độc lập từng domain — điều chưa có nhu cầu thực tế nào chứng minh cần thiết.

---

# References

- Module: toàn bộ `backend/src/modules/` (25+ module, `backend/src/app.module.ts`).
- Report: `docs/architecture/dependency-graph.md` (T001, xác nhận 0 circular dependency giữa các module).
- Sprint: Foundation (trước khi có SPEC bằng văn bản).
