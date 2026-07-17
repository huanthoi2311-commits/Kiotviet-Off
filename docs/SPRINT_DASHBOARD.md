# Sprint Dashboard

**Cập nhật lần cuối:** đóng T009 (Barcode), phát hành `v0.6.0-barcode-foundation`. Cập nhật file này mỗi khi đóng 1 Sprint task hoặc phát hành version mới — cùng nhịp với `PROJECT_STATUS.md` (`PROJECT_STATUS.md` là nguồn chi tiết, file này là bảng tổng quan nhanh).

**Trạng thái module dùng đúng 8 giá trị cố định:** `NOT STARTED` → `AUDIT` → `RFC` → `SPEC` → `PLAN` → `IMPLEMENTING` → `REVIEW` → `DONE`.

---

## Tổng quan

| | |
|---|---|
| **Current Version** | `v0.6.0-barcode-foundation` |
| **Current Sprint** | Sprint-01 (Master Data) |
| **Overall Progress** | ~45% *(ước tính của Architect tại T008, chưa có ước tính mới từ Architect cho T009 — giữ nguyên, không tự suy diễn)* |
| **Master Data Progress** | **5/7 module DONE** (Product, Category, Brand, Unit, Barcode) |
| **CRM Progress** | 0/2+ module — chưa bắt đầu theo quy trình hiện hành |
| **Inventory Progress** | 0 module đã qua Audit/RFC chính thức — có scaffold code từ Sprint-00, xem ghi chú cuối bảng |
| **POS Progress** | 0 module đã qua Audit/RFC chính thức — có scaffold code từ Sprint-00, xem ghi chú cuối bảng |
| **ERP Progress** | 0 module đã qua Audit/RFC chính thức |

---

## Foundation (Sprint-00)

| Module | Trạng thái | Ghi chú |
|---|---|---|
| Kiến trúc nền tảng | `DONE` | Tag `v0.1.0-foundation` — Auth, RBAC, Audit Log, response envelope, Prisma/Redis/JWT/Swagger/BullMQ/Socket.IO setup |

## Master Data (Sprint-01)

| Module | Trạng thái | SPEC | Tag |
|---|---|---|---|
| Product | `DONE` | `SPEC-PRODUCT-001` | `v0.2.0-product-foundation` |
| Category | `DONE` | `SPEC-CATEGORY-001` | `v0.3.0-category-foundation` |
| Brand | `DONE` | `SPEC-BRAND-001` | `v0.4.0-brand-foundation` |
| Unit | `DONE` | `SPEC-UNIT-001` | `v0.5.0-unit-foundation` |
| Barcode | `DONE` | `SPEC-BARCODE-001` | `v0.6.0-barcode-foundation` |
| Attribute | `NOT STARTED` | — | WAITING RFC từ Architect |
| Variant | `NOT STARTED` | — | — |
| Gate-01 (Master Data hoàn tất) | `NOT STARTED` | — | — |

## CRM

| Module | Trạng thái | Ghi chú |
|---|---|---|
| Customer | `NOT STARTED` | Có scaffold code (`modules/customer`, `modules/customer-point`) từ Sprint-00 — chưa qua Audit/RFC theo quy trình hiện hành |
| Supplier | `NOT STARTED` | Có scaffold code (`modules/supplier`, `modules/supplier-debt`) từ Sprint-00 — chưa qua Audit/RFC theo quy trình hiện hành |

## Inventory

| Module | Trạng thái | Ghi chú |
|---|---|---|
| Inventory nâng cao | `NOT STARTED` | Scaffold code (`modules/inventory`, `modules/inventory-adjustment`, `modules/transfer`, `modules/stock-count`, `modules/warehouse`, `modules/purchase-order`, `modules/purchase-return`, `modules/purchase-report`) từ Sprint-00 — chưa qua Audit/RFC theo quy trình hiện hành |

## POS

| Module | Trạng thái | Ghi chú |
|---|---|---|
| POS hoàn chỉnh | `NOT STARTED` | Scaffold code (`modules/cart`, `modules/checkout`, `modules/discount`, `modules/payment`, `modules/invoice`) từ Sprint-00 — chưa qua Audit/RFC theo quy trình hiện hành |

## ERP & Báo cáo

| Module | Trạng thái | Ghi chú |
|---|---|---|
| ERP & Báo cáo | `NOT STARTED` | Chưa có scaffold code |

---

## Ghi chú quan trọng về "scaffold code từ Sprint-00"

Nhiều module ngoài Master Data (Customer/Supplier/Inventory/Cart/Checkout/...) đã có code tồn tại trong repo từ Sprint-00 (trước khi quy trình `Dependency Audit → RFC → Architecture Review → SPEC → Implementation Plan → Code → Release` chính thức hóa từ T006 trở đi). Bảng này đánh dấu các module đó là `NOT STARTED` **theo nghĩa "chưa qua quy trình Specification First hiện hành"** — không có nghĩa là chưa có dòng code nào. Khi tới lượt module nào trong roadmap, bước đầu tiên vẫn là Dependency Audit đầy đủ (khảo sát code hiện có, không phải viết mới từ đầu).

## Roadmap cố định Sprint-01 (không đổi — Decision RC01)

```
Product → Category → Brand → Unit → Barcode → Attribute → Variant → Gate-01
```

Không bỏ qua thứ tự. Customer/Supplier thuộc Sprint CRM, triển khai sau khi Gate-01 (Master Data hoàn tất) — không xen giữa Sprint-01.
