# Sprint Dashboard

**Cập nhật lần cuối:** 2026-08-14 (T051.09 Final V1.0 Finalization). Các bảng roadmap cũ hơn (Foundation/Master Data Sprint-01/CRM/"Roadmap chốt lại" SC13) được GIỮ NGUYÊN làm hồ sơ lịch sử, đánh dấu rõ SUPERSEDED — không xoá, đúng nguyên tắc "không xoá lịch sử phát hiện/quyết định" đã áp dụng xuyên suốt dự án.

**Trạng thái module dùng đúng 8 giá trị cố định:** `NOT STARTED` → `AUDIT` → `RFC` → `SPEC` → `PLAN` → `IMPLEMENTING` → `REVIEW` → `DONE`.

---

## Trạng thái hiện tại (2026-08-14, sau T051.09)

| | |
|---|---|
| **Tag chính thức gần nhất** | `v0.10.0-sales-return-exchange` (2026-07-27) — CHƯA có tag `v1.0.0`. `main` hiện tại đã vượt xa tag này (T030 → T051.09 chưa gắn tag) |
| **Giai đoạn hiện tại** | **V1.0 READY FOR RELEASE — feature freeze đang hiệu lực.** Không phát triển tính năng nghiệp vụ mới. Xem `PROJECT_STATUS.md` mục "Giai đoạn hiện tại" |
| **Task nghiệp vụ cuối cùng đã đóng** | **T050 — Purchase Report** (PR #40) |
| **Chuỗi hardening đã đóng** | T051.00/.01/.02/.03/.04/.05/.06A/.06B/.08A-D/.08/.09 — toàn bộ chuỗi Release Hardening ĐÃ ĐÓNG, xem `PROJECT_STATUS.md` bảng đầy đủ |
| **V1.0 RC Readiness Audit** | HOÀN TẤT (2026-08-13) — 0 RC blocker xác nhận tại thời điểm đó. `docs/release/T051-V1-RELEASE-CANDIDATE-READINESS.md` |
| **T051.09 Final V1.0 Finalization** | ĐÃ HOÀN TẤT kỹ thuật — chờ Architect xác nhận ma trận chấp nhận phát hành trước khi tạo tag `v1.0.0`. Chi tiết: `docs/release/V1.0.0-RELEASE-NOTES.md` |

### Phân loại công việc còn lại

| Loại | Nội dung |
|---|---|
| **COMPLETED** | Toàn bộ domain nghiệp vụ V1 (xem bảng "Recent Release History" bên dưới) + toàn bộ chuỗi T051.00 → T051.09 |
| **CURRENT RELEASE-FINALIZATION WORK** | Chờ Architect uỷ quyền tạo tag `v1.0.0` + GitHub Release — KHÔNG còn hạng mục kỹ thuật nào mở |
| **DEFERRED POST-V1** | Supplier Import UI, Supplier Payment UI (kèm điều kiện: sửa race SupplierPayment trước khi mở khoá UI), Customer Point mutation UI, RBAC management UI, Discount admin UI, Organization Settings UI, multi-branch management UI, custom Windows service, backup encryption at rest, thêm báo cáo, TLS packaging — xác nhận vẫn deferred hợp lệ, tái xác nhận T051.09, KHÔNG phải thiếu sót. Chi tiết: `docs/release/V1.0.0-RELEASE-NOTES.md` |
| **HISTORICAL / SUPERSEDED TASK NUMBERING** | 3 lớp roadmap cũ bên dưới (Sprint-01 gốc → "Roadmap chốt lại" SC13 → numbering phụ thuộc T030+) — giữ nguyên tham khảo, không dùng để suy luận trạng thái hiện tại |

## Recent Release History (T030 → T051.04, xác minh trực tiếp từ PR đã merge)

Từ sau tag `v0.10.0-sales-return-exchange` (T014), dự án chuyển sang numbering theo **dependency graph** (không còn tuần tự tuyến tính như "Roadmap chốt lại SC13" bên dưới — xem ghi chú "Project replan" nếu cần bối cảnh quyết định đổi numbering; không tái hiện chi tiết quyết định đó ở đây vì ngoài phạm vi docs-sync). Danh sách dưới đây lấy trực tiếp từ tiêu đề PR đã merge trên `main`, KHÔNG suy diễn trạng thái RFC/SPEC/Audit cho từng mục (một số spec/discovery doc cho các task này tồn tại nhưng CHƯA được commit vào git — xem ghi chú cuối bảng):

| Task | Nội dung | PR |
|---|---|---|
| T030.x | Environment Recovery (config safety, CORS REST+WebSocket hợp nhất, Redis/BullMQ Phase A, environment safety, E2E/validation reconciliation, money serialization, Organization Platform Admin bypass) → Backend RC1 | #2, #3, #4 |
| T031 | Frontend Foundation — auth infrastructure, login/forgot-password UI, dashboard shell, cross-tab session coordination | #6, #7, #8, #9 |
| T032 | Platform Recovery (Metrics + Operational Tooling R1; OpenAPI export + Orval pipeline R2) | #10, #11, #12, #13 |
| T033-T034 | Shared CRUD Foundation | #15, #16 |
| T035-T040 | Category (List/Create/Edit/Archive/Restore/Tree) | #17-#24 |
| T041 | Brand | #25, #26 |
| T042 | Unit | #27 |
| T043 | Product (frontend + Product Price contract) | #28, #29, #30 |
| T044 | Inventory (frontend) | #31, #32 |
| T045 | Purchase (frontend) | #33 |
| T046 | Sales / Checkout (frontend) | #34 |
| T047 | Sales Return (domain) | #35 |
| T048 | Customer | #36, #37 |
| T049 | Supplier | #38, #39 |
| T050 | Purchase Report | #40 |
| T051.00 | RBAC Tenant Isolation | #41 |
| T051.02 | Concurrency Hardening | #42 |
| T051.03 | Backup / Restore | #43, #44 |
| T051.04 | Deployment Packaging | #45 |

**Ghi chú quan trọng**: một số file discovery/spec cho khoảng T032-T049 (vd `docs/discovery/T033-BUSINESS-MODULE-SEQUENCING.md`, `docs/specifications/T035-CATEGORY-SPEC.md`, v.v.) hiện tồn tại trên đĩa nhưng **CHƯA được `git add`/commit** — phát hiện trong lúc audit T051.05, ngoài phạm vi sửa của package này (docs-sync không bao gồm quyết định có nên commit các file nháp đó hay không). Architect có thể muốn xử lý riêng.

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
| Customer | `DONE` | `SPEC-T011-CUSTOMER-001`, tag `v0.7.0-customer-domain` |
| Supplier | `DONE` | `SPEC-T012-SUPPLIER-001`, tag `v0.8.0-supplier-domain` |

## Inventory / POS / ERP & Báo cáo — **SAI THỰC TẾ, ĐÃ SUPERSEDED (T051.05)**

**Cảnh báo (T051.05):** 3 bảng bên dưới ghi `NOT STARTED` cho Inventory/POS/ERP — thông tin này SAI so với thực tế hiện tại và có thể gây hiểu lầm nguy hiểm (Category D). Trên thực tế, các module này đã hoàn tất qua chuỗi task T044 (Inventory frontend), T045 (Purchase frontend), T046 (Sales/Checkout frontend), T047 (Sales Return), T050 (Purchase Report), cùng backend tương ứng — xem bảng "Recent Release History" ở đầu file. Giữ nguyên 3 bảng gốc bên dưới làm hồ sơ lịch sử tại thời điểm chúng được viết (trước T030), KHÔNG dùng để suy luận trạng thái hiện tại.

| Module | Trạng thái (LỊCH SỬ — xem cảnh báo trên) | Ghi chú |
|---|---|---|
| Inventory nâng cao | ~~`NOT STARTED`~~ → thực tế: DONE (T044, T045, T050) | Scaffold code (`modules/inventory`, `modules/inventory-adjustment`, `modules/transfer`, `modules/stock-count`, `modules/warehouse`, `modules/purchase-order`, `modules/purchase-return`, `modules/purchase-report`) từ Sprint-00 — đã qua Audit/RFC/triển khai đầy đủ ở chuỗi task T044/T045/T050 |
| POS hoàn chỉnh | ~~`NOT STARTED`~~ → thực tế: DONE (T046) | Scaffold code (`modules/cart`, `modules/checkout`, `modules/discount`, `modules/payment`, `modules/invoice`) từ Sprint-00 — đã qua Audit/RFC/triển khai đầy đủ ở T046 (Sales/Checkout frontend); `discount` admin UI vẫn deferred có chủ đích (xem "Trạng thái hiện tại" ở đầu file) |
| ERP & Báo cáo | ~~`NOT STARTED`~~ → thực tế: một phần DONE (T050 Purchase Report) | Báo cáo bổ sung ngoài Purchase Report vẫn nằm trong DEFERRED POST-V1 |

---

## Ghi chú quan trọng về "scaffold code từ Sprint-00"

Nhiều module ngoài Master Data (Customer/Supplier/Inventory/Cart/Checkout/...) đã có code tồn tại trong repo từ Sprint-00 (trước khi quy trình `Dependency Audit → RFC → Architecture Review → SPEC → Implementation Plan → Code → Release` chính thức hóa từ T006 trở đi). Bảng này đánh dấu các module đó là `NOT STARTED` **theo nghĩa "chưa qua quy trình Specification First hiện hành"** — không có nghĩa là chưa có dòng code nào. Khi tới lượt module nào trong roadmap, bước đầu tiên vẫn là Dependency Audit đầy đủ (khảo sát code hiện có, không phải viết mới từ đầu).

## Roadmap Sprint-01 cũ (Decision RC01) — ĐÃ SUPERSEDED bởi Decision SC13

~~Product → Category → Brand → Unit → Barcode → Attribute → Variant → Gate-01~~

Giữ lại để tham chiếu lịch sử (không xóa — đúng nguyên tắc "không xóa lịch sử phát hiện/quyết định" đã áp dụng xuyên suốt dự án). 5 module đầu (Product/Category/Brand/Unit/Barcode) đã thực hiện xong theo đúng roadmap này trước khi bị thay thế. **Attribute và Variant không xuất hiện trong roadmap mới (Decision SC13)** — trạng thái chưa rõ (hoãn, gộp vào task khác, hay vẫn cần làm sau T025) — đây là điểm cần Architect xác nhận, Claude Code không tự suy diễn.

## Roadmap chốt lại (ARCHITECT SCOPE CORRECTION — Decision SC13, thay thế roadmap Sprint-01 cũ) — **ĐÃ SUPERSEDED, xem ghi chú**

**SUPERSEDED (T051.05):** chuỗi T-number phẳng T015-T025 bên dưới KHÔNG được thực hiện tiếp như liệt kê — dự án chuyển sang numbering theo dependency graph (T030+, xem bảng "Recent Release History" ở đầu file). Dòng `T014` bên dưới ghi "SPEC đang soạn" — thông tin này ĐÃ CŨ, T014 trên thực tế đã hoàn tất và phát hành (tag `v0.10.0-sales-return-exchange`). Giữ bảng nguyên trạng làm hồ sơ lịch sử của quyết định SC13 tại thời điểm đó, không sửa từng ô — trạng thái hiện tại xem mục "Trạng thái hiện tại" ở đầu file.

Không còn chia theo Sprint (Master Data/CRM/Inventory/POS/ERP) như cấu trúc cũ — chuỗi T-number phẳng, tuần tự, không bỏ qua thứ tự:

| Task | Nội dung | Trạng thái |
|---|---|---|
| T009 | Barcode Release | `DONE` — tag `v0.6.0-barcode-foundation` |
| T010 | Offline Single-Computer Scope Freeze | `DONE` — PASS, AR01-AR07 APPROVED, Decision AD01-AD04 (`docs/architecture/offline-single-computer-readiness-audit.md`) |
| T011 | Customer | `DONE` — tag `v0.7.0-customer-domain`, FR01-FR10 APPROVED (`docs/release/t011-release-note.md`) |
| T012 | Supplier | `DONE` — tag `v0.8.0-supplier-domain`, Final Release Review APPROVED (`docs/release/t012-release-note.md`) |
| T013 | Sales Foundation | `DONE` — tag `v0.9.0-sales-foundation`, đã commit/push (Decision AD07-AD23) |
| T014 | Sales Return | `SPEC` — RFC v1.1 APPROVED (Decision AD27-AD45), SPEC-T014 đang soạn |
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
