# Sprint Dashboard

**Cập nhật lần cuối:** T011 (Customer Domain) — **DONE**, `FINAL RELEASE REVIEW` FR01-FR10 APPROVED, phát hành `v0.7.0-customer-domain`. Sau T011, dự án áp dụng Decision AD05 (phân loại module Type A/Type B — xem `docs/project-governance/AI_WORKFLOW.md`). Module kế tiếp: T012 — Supplier Domain (Type B), WAITING Short RFC. Cập nhật file này mỗi khi đóng 1 Sprint task hoặc phát hành version mới — cùng nhịp với `PROJECT_STATUS.md` (`PROJECT_STATUS.md` là nguồn chi tiết, file này là bảng tổng quan nhanh).

**Trạng thái module dùng đúng 8 giá trị cố định:** `NOT STARTED` → `AUDIT` → `RFC` → `SPEC` → `PLAN` → `IMPLEMENTING` → `REVIEW` → `DONE`.

---

## Tổng quan

| | |
|---|---|
| **Current Version** | `v0.7.0-customer-domain` |
| **Current Task** | T011 `DONE` (PASS) → **T012 — Supplier Domain (Type B), WAITING Short RFC** — xem "Roadmap chốt lại" bên dưới, thay thế khái niệm "Sprint-01/CRM/Inventory/POS/ERP" cũ |
| **Overall Progress** | ~45% *(ước tính của Architect tại T008, chưa có ước tính mới sau Decision SC01-SC13 — giữ nguyên, không tự suy diễn)* |
| **Master Data Progress** | **5/5 module đã lên kế hoạch DONE** (Product, Category, Brand, Unit, Barcode) — Attribute/Variant không còn trong roadmap mới, trạng thái chưa rõ |
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

## Roadmap Sprint-01 cũ (Decision RC01) — ĐÃ SUPERSEDED bởi Decision SC13

~~Product → Category → Brand → Unit → Barcode → Attribute → Variant → Gate-01~~

Giữ lại để tham chiếu lịch sử (không xóa — đúng nguyên tắc "không xóa lịch sử phát hiện/quyết định" đã áp dụng xuyên suốt dự án). 5 module đầu (Product/Category/Brand/Unit/Barcode) đã thực hiện xong theo đúng roadmap này trước khi bị thay thế. **Attribute và Variant không xuất hiện trong roadmap mới (Decision SC13)** — trạng thái chưa rõ (hoãn, gộp vào task khác, hay vẫn cần làm sau T025) — đây là điểm cần Architect xác nhận, Claude Code không tự suy diễn.

## Roadmap chốt lại (ARCHITECT SCOPE CORRECTION — Decision SC13, thay thế roadmap Sprint-01 cũ)

Không còn chia theo Sprint (Master Data/CRM/Inventory/POS/ERP) như cấu trúc cũ — chuỗi T-number phẳng, tuần tự, không bỏ qua thứ tự:

| Task | Nội dung | Trạng thái |
|---|---|---|
| T009 | Barcode Release | `DONE` — tag `v0.6.0-barcode-foundation` |
| T010 | Offline Single-Computer Scope Freeze | `DONE` — PASS, AR01-AR07 APPROVED, Decision AD01-AD04 (`docs/architecture/offline-single-computer-readiness-audit.md`) |
| T011 | Customer | `DONE` — tag `v0.7.0-customer-domain`, FR01-FR10 APPROVED (`docs/release/t011-release-note.md`) |
| T012 | Supplier | `NOT STARTED` — WAITING Short RFC từ Architect (Type B, Fast Track Workflow) |
| T013 | Sales Foundation | `NOT STARTED` |
| T014 | Sales Return | `NOT STARTED` |
| T015 | Purchase Foundation | `NOT STARTED` |
| T016 | Purchase Return | `NOT STARTED` |
| T017 | Debt Ledger | `NOT STARTED` |
| T018 | Cashbook | `NOT STARTED` |
| T019 | Inventory Completion | `NOT STARTED` |
| T020 | Essential Reports | `NOT STARTED` |
| T021 | Invoice Printing | `NOT STARTED` |
| T022 | Offline Single-Computer Deployment | `NOT STARTED` |
| T023 | Backup and Restore | `NOT STARTED` |
| T024 | Desktop Frontend Completion | `NOT STARTED` |
| T025 | Acceptance Test and Release Candidate | `NOT STARTED` |

Không bỏ qua thứ tự. T010 PASS. Đề xuất T010.5 (Offline Infrastructure Alignment — Docker Compose mặc định, cấu hình `127.0.0.1`, thiết kế `bootstrap-offline`) đã được Architect xác nhận **bỏ qua, không chèn vào giữa** — đi thẳng T011, xử lý hạ tầng khi cần thiết ở Task tương ứng (T022 Offline Single-Computer Deployment) hoặc khi có chỉ đạo riêng.
