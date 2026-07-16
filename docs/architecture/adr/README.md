# Architecture Decision Records (ADR)

T004.95 (`SPEC-T004.95`, Sprint-00). Ghi lại các quyết định kiến trúc quan trọng đã được đưa ra trong dự án, theo chuẩn ADR — thực hành phổ biến ở Microsoft, Amazon, Shopify, Uber. Mục đích: khi đội phát triển mở rộng thêm người, không ai phải đoán "vì sao lại quyết định như vậy" — mọi quyết định lớn đều có Context/Decision/Consequences/Alternatives/Rejected được ghi lại tại thời điểm quyết định.

## Quy tắc

- Mỗi ADR là 1 file `ADR-NNNN-ten-quyet-dinh.md`, đánh số tăng dần, **không đánh số lại** khi 1 ADR bị thay thế trong tương lai (dùng `Status: Superseded by ADR-XXXX`, không xóa/sửa nội dung gốc).
- Cấu trúc thống nhất bắt buộc: **Status / Context / Decision / Consequences (Ưu điểm/Nhược điểm/Ảnh hưởng) / Alternatives / Rejected / References**.
- ADR ghi lại quyết định ĐÃ được đưa ra (kể cả khi implementation chưa xong, vd ADR-0011) — không phải đề xuất đang chờ duyệt.
- References trỏ tới SPEC/Sprint/Report/Module liên quan — không để trống.

## Danh sách ADR

| # | Tiêu đề | Status | Sprint liên quan |
|---|---|---|---|
| [ADR-0001](./ADR-0001-system-architecture.md) | System Architecture — Monolithic Modular | Accepted | Foundation |
| [ADR-0002](./ADR-0002-clean-architecture.md) | Clean Architecture (Domain→Application→Infrastructure→Presentation) | Accepted | Foundation |
| [ADR-0003](./ADR-0003-multi-tenant.md) | Multi-Tenant — Organization→Branch→Warehouse | Accepted | T002/T003 |
| [ADR-0004](./ADR-0004-rbac.md) | RBAC — Role→Permission→JWT, không query DB mỗi request | Accepted | Foundation |
| [ADR-0005](./ADR-0005-single-writer.md) | Inventory Single Writer | Accepted | T004 |
| [ADR-0006](./ADR-0006-inventory-domain-service.md) | InventoryDomainService — Repository không export, chỉ export Service | Accepted | T004 |
| [ADR-0007](./ADR-0007-optimistic-lock.md) | Optimistic Lock cho toàn bộ Inventory | Accepted | T004 |
| [ADR-0008](./ADR-0008-transaction-boundary.md) | Transaction Boundary — Caller quản lý, DomainService không commit | Accepted | T004 |
| [ADR-0009](./ADR-0009-domain-events.md) | Domain Events — Publish sau commit, không publish trong transaction | Accepted | T004.9 |
| [ADR-0010](./ADR-0010-repository-boundary.md) | Repository Boundary — không module nào inject Repository của module khác | Accepted | T004, áp dụng toàn dự án |
| [ADR-0011](./ADR-0011-outbox-pattern.md) | Outbox Pattern cho Domain Event Dispatch | Accepted (implementation pending) | T004.9 → Sprint-01/T006 |
| [ADR-0012](./ADR-0012-testing-strategy.md) | Testing Strategy — Unit/Integration/Architecture/Performance/Security | Accepted | T004.5, toàn dự án |
