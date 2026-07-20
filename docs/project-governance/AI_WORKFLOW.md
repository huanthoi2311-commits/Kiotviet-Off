# AI_WORKFLOW

Quy trình bắt buộc Claude Code (hoặc bất kỳ AI coding agent nào làm việc trên dự án này) phải theo **trước khi viết bất kỳ dòng code nào**. Mục tiêu: giảm tối đa số lần cần hỏi User các quyết định lặp lại, bằng cách tự tra cứu đủ ngữ cảnh trước — không phải bằng cách tự đoán khi thiếu ngữ cảnh.

## Quy trình 6 bước

```
1. Đọc RFC
   ↓
2. Đọc SPEC
   ↓
3. Kiểm tra ADR liên quan
   ↓
4. Kiểm tra quy tắc trong PROJECT_RULES (+ ARCHITECTURE/CODING/TEST/REVIEW/RELEASE_RULES liên quan)
   ↓
5. Đủ điều kiện? ──NO──→ Dừng lại, lập danh sách câu hỏi cụ thể, chờ ARCHITECT DECISION
   │
  YES
   ↓
6. Code
```

### Bước 1 — Đọc RFC

Nếu task thuộc 1 domain có RFC (`RFC-NNNN`), đọc TOÀN BỘ trước khi làm gì khác. RFC trả lời "nên làm gì và vì sao" — không đủ chi tiết để code, nhưng đủ để hiểu Ý ĐỊNH, tránh implement đúng chữ nhưng sai tinh thần khi SPEC (bước 2) có chỗ mơ hồ.

**RFC do User soạn — Claude Code không tự viết RFC, kể cả bản nháp**, đúng nguyên tắc Specification First đã áp dụng nhất quán từ Sprint-00.

### Bước 2 — Đọc SPEC

Đọc TOÀN BỘ SPEC liên quan (`SPEC-<DOMAIN>-NNN`) TRƯỚC khi code. SPEC là nguồn sự thật cho: Entity, Business Rules, API, Permission, Migration, Event, Performance, Security, Acceptance Criteria.

**Không code nếu SPEC chưa được đánh dấu rõ ràng "APPROVED FOR DEVELOPMENT"/"APPROVED FOR IMPLEMENTATION"** (hoặc từ ngữ tương đương User dùng) — kể cả khi đã đọc và hiểu SPEC, không tự suy diễn "chắc là được duyệt rồi" nếu không có xác nhận tường minh.

### Bước 3 — Kiểm tra ADR liên quan

Đọc `docs/architecture/adr/README.md` (index), xác định ADR nào liên quan tới phạm vi task. Nếu SPEC mới có vẻ MÂU THUẪN với 1 ADR đã Accepted → đây là tín hiệu dừng lại hỏi (bước 5), không tự quyết ADR nào "thắng".

Nếu task tạo ra 1 quyết định kiến trúc mới đáng ghi lại (không phải chi tiết implementation vụn vặt) — flag rõ trong báo cáo rằng cần 1 ADR mới, không tự viết ADR thay User trừ khi được yêu cầu tường minh (khác với SPEC/RFC — soạn ADR sau khi có quyết định RÕ RÀNG từ User có thể được Claude Code thực hiện NẾU được giao, như đã làm ở T004.95, nhưng nội dung/cấu trúc phải khớp đúng những gì User đã quyết định, không tự thêm quyết định mới vào ADR).

### Bước 4 — Kiểm tra quy tắc trong PROJECT_RULES

Đọc các file governance liên quan tới loại thay đổi:
- Đổi kiến trúc/module boundary → `ARCHITECTURE_RULES.md`.
- Viết code → `CODING_RULES.md`.
- Viết/chạy test → `TEST_RULES.md`.
- Chuẩn bị báo cáo/self-review → `REVIEW_RULES.md`.
- Commit/tag/push → `RELEASE_RULES.md`.

### Bước 5 — Đủ điều kiện chưa?

Đủ điều kiện code khi VÀ CHỈ KHI:
- RFC (nếu có) đã đọc, không mâu thuẫn với SPEC.
- SPEC đã đọc TOÀN BỘ, đã được đánh dấu APPROVED.
- Không phát hiện mâu thuẫn giữa SPEC ↔ ADR ↔ code/schema hiện tại.
- Không phát hiện mâu thuẫn giữa 2 điều khoản trong CÙNG 1 SPEC/ARCHITECT DECISION.

**Nếu THIẾU bất kỳ điều kiện nào ở trên** — dừng lại, KHÔNG code, KHÔNG tự thiết kế giải pháp thay User. Lập danh sách câu hỏi theo đúng mẫu đã chứng minh hiệu quả xuyên suốt dự án:

1. Nêu CHÍNH XÁC điểm thiếu/mâu thuẫn, kèm bằng chứng cụ thể (file:line của code hiện tại, hoặc trích dẫn đúng câu chữ mâu thuẫn nhau trong văn bản).
2. Nếu có, đề xuất 2-3 phương án cụ thể (không phải câu hỏi mở chung chung) kèm đánh đổi ngắn gọn của mỗi phương án.
3. Có thể nêu khuyến nghị (phương án nào Claude Code nghiêng về) — nhưng KHÔNG tự chọn thay, chờ User quyết.
4. Hỏi bằng văn bản thường (plain text), KHÔNG dùng tool hỏi trắc nghiệm có cấu trúc — User đã từ chối format đó nhiều lần trong dự án này, ưu tiên trả lời tự do dạng "ARCHITECT DECISION".

### Bước 6 — Code

Chỉ tới bước này khi bước 5 xác nhận đủ điều kiện. Trong lúc code:
- Với các quyết định implementation-level KHÔNG ảnh hưởng hành vi nghiệp vụ mà SPEC không cần chỉ định chính xác — tự quyết định hợp lý theo `CODING_RULES.md`/`ARCHITECTURE_RULES.md`, disclose trong báo cáo, KHÔNG dừng lại hỏi (tránh hỏi vụn vặt, đúng tinh thần "giảm số lần hỏi" mà quy trình này hướng tới).
- Nếu GIỮA CHỪNG code phát hiện 1 xung đột MỚI (khác với những gì đã kiểm tra ở bước 1-4) — dừng lại ngay, quay lại bước 5, không "code tạm cho xong rồi hỏi sau".
- Sau khi code xong, chạy đầy đủ checklist self-review (`REVIEW_RULES.md` §1) trước khi báo cáo hoàn thành.

## Phân loại Module — Type A / Type B (Decision AD05, sau khi T009 Barcode + T011 Customer hoàn thành; quy trình Type A cụ thể hóa bởi Decision AD06 sau T012 Supplier; nguyên tắc Checkout Command Pattern bổ sung bởi Decision AD07 sau SPEC Review T013)

Từ sau T011, mỗi module mới trước khi bắt đầu RFC phải được xếp vào đúng 1 trong 2 loại — quyết định quy trình áp dụng (đủ 7 bước hay Fast Track 5 bước):

### TYPE A — Business-Critical Modules

Gồm: Sales, Purchase, Inventory, Debt Ledger, Cashbook, Reports (và tương tự — nghiệp vụ lõi ảnh hưởng trực tiếp tiền/tồn kho/sổ sách).

~~```
RFC → Architecture Review → SPEC → Architecture Review → Implementation Plan → Architecture Review → Implementation → Release Review
```~~

**[AD06] Quy trình chi tiết (thay thế sơ đồ rút gọn ở trên, sau khi T012 Supplier hoàn thành):**

```
RFC
  ↓
Architecture Review
  ↓
Architect Resolution
  ↓
RFC Revision
  ↓
SPEC
  ↓
SPEC Review
  ↓
Implementation Plan
  ↓
Plan Review
  ↓
Implementation
  ↓
Implementation Report
  ↓
Final Release Review
  ↓
Commit
  ↓
Tag
```

13 bước đầy đủ, **có** Implementation Plan riêng, **không áp dụng Fast Track**. Áp dụng cho mọi module Type A kể từ T013 (Sales Foundation) trở đi.

### TYPE B — Standard Master Data Modules

Gồm: Customer, Supplier, Brand, Category, Unit, Barcode và Master Data tương tự.

```
Short RFC → Architecture Review → SPEC → SPEC Review → Implementation → Release Review
```

**Không** có Implementation Plan riêng (Fast Track Workflow — đã áp dụng cho T011).

**Điều kiện để 1 module được xếp Type B** (cả 3 phải đúng, thiếu 1 → coi là Type A):
1. Không có thay đổi kiến trúc lớn.
2. Không có dependency phức tạp.
3. Không có migration rủi ro cao.

Nếu khi Audit/Architecture Review phát hiện 1 module ban đầu tưởng Type B nhưng thực ra vi phạm 1 trong 3 điều kiện trên (vd phát hiện circular dependency thật như Barcode↔Unit ở T009, hoặc brownfield phức tạp như Customer ở T011) — báo cáo rõ, chờ Architect xác nhận có chuyển sang quy trình Type A hay tiếp tục Type B với Resolution bổ sung (như đã xảy ra ở cả 2 module trên, đều vẫn giữ Type B sau khi Resolution xử lý xong phát hiện mới).

## Checkout Command Pattern (Decision AD07, sau SPEC Review của T013 Sales Foundation)

Architecture Review của T013 xác nhận: Checkout hiện tại (từ Sprint-00) là một **thao tác one-shot
atomic** ("Cart → Checkout → Invoice bất biến"), không phải một Aggregate CRUD kiểu Draft/Update/
Complete/Cancel. Decision AR02-AR04 (RFC-T013 Resolution) đã xác nhận giữ đúng mô hình này thay vì
xây `SalesInvoice` mutable mới. Decision AD07 chính thức hóa nguyên tắc này thành quy tắc kiến trúc
áp dụng cho mọi module tương lai xây trên nền Checkout:

```
Cart
  ↓
Checkout Command
  ↓
Atomic Business Transaction
  ↓
Immutable Invoice
```

**Không được phát triển Checkout theo hướng CRUD Invoice** (không thêm API kiểu `PATCH
/invoices/:id`, `POST /invoices/:id/items`, `POST /invoices/:id/cancel` — mọi chỉnh sửa trước khi
chốt đơn diễn ra trên Cart, không diễn ra trên Invoice). Đây là nền tảng bắt buộc cho:

- **T014 — Sales Return**: xử lý hoàn trả là một Command riêng (tạo `Return` mới tham chiếu ngược
  Invoice gốc), không phải "mở lại" Invoice cũ để sửa.
- **T017 — Debt Ledger**: ghi nhận công nợ là Command nối tiếp (tham chiếu Invoice bất biến làm
  nguồn), không sửa Invoice.
- **T018 — Cashbook**: tương tự, Command riêng tham chiếu Payment/Invoice bất biến.

## Stable Infrastructure Baseline (Decision AD09, sau Phase 1 của T013 Sales Foundation)

Sau khi một Phase trong Implementation theo Decision AD08 (Phase Gate Policy) hoàn thành và được
Architect APPROVE, hạ tầng đã xây trong Phase đó được coi là **Stable Infrastructure Baseline**:

- Các Phase SAU không được thay đổi schema của hạ tầng đã baseline.
- Không được đổi API/contract công khai của hạ tầng đó.
- Không được refactor Domain Service đã baseline.

**Trừ khi** phát hiện lỗi nghiêm trọng và được Architect phê duyệt riêng cho việc sửa.

Mục đích: các Phase sau (vd Phase lắp ráp/tích hợp) không phải chạy theo một nền tảng liên tục
thay đổi — giảm rủi ro rollback dây chuyền, giữ đúng tinh thần Phase Gate (AD08).

**Áp dụng lần đầu:** `checkout_operations` (T013 Phase 1 — Idempotency Foundation) là Stable
Infrastructure Baseline kể từ khi Phase 1 được APPROVE — Phase 2 trở đi không được sửa.

## Repository Boundary Freeze (Decision AD10, sau Phase 2 của T013 Sales Foundation)

Sau khi Phase 2 (Repository Boundary Cleanup) hoàn thành và được Architect APPROVE, Repository
Boundary của `cart`/`invoice`/`payment`/`customer-point` được coi là **Repository Boundary
Stable**. Từ Phase 3 trở đi (và mọi Task sau này chạm các module này):

- Không được export Repository token trở lại.
- Không được bypass Domain Service (`CartDomainService`/`CustomerPointDomainService`/
  `InvoiceService`/`PaymentService`).
- Không được inject repository của module khác trực tiếp (foreign repository injection).

Mọi thay đổi vi phạm Boundary phải được Architect phê duyệt riêng — không tự ý "tạm thời" nới
lỏng để tiện code.

## Checkout Orchestrator Freeze (Decision AD11, sau Phase 3 của T013 Sales Foundation)

Sau khi Phase 3 (Checkout Refactor) hoàn thành và được Architect APPROVE, `CheckoutService`
được coi là **Stable Orchestrator**. Từ nay:

- Không được đưa business logic trở lại Controller.
- Không được bypass `CheckoutOperation`/`CheckoutOperationService`.
- Không được truy cập Repository xuyên module (giữ đúng Repository Boundary Freeze — AD10).

Mọi thay đổi kiến trúc orchestration của Checkout sau này phải thông qua RFC mới — không tự ý
refactor lại trong các Phase/Task sau (Phase 4 Invoice Number, Phase 5 Snapshot, Phase 6 Service
Product chỉ được phép bổ sung dữ liệu/logic cục bộ trong phạm vi của chính Phase đó, không đổi lại
cấu trúc orchestration đã đóng băng).

## Numbering Policy Freeze (Decision AD12, sau Phase 4 của T013 Sales Foundation)

Sau khi Phase 4 (Invoice Number Integration) hoàn thành và được Architect APPROVE — tái sử dụng
`SequenceCodeGeneratorService` (T012) thay vì viết lại logic sequence riêng cho Invoice — chính
sách này được áp dụng bắt buộc cho toàn dự án, không chỉ Invoice:

- Mọi document number mới trong hệ thống sau này (ví dụ Sales Return, Purchase Return, Phiếu
  thu/chi nếu áp dụng) phải tái sử dụng `SequenceCodeGeneratorService`.
- Không được tạo generator riêng lặp lại logic `prisma.sequence.upsert()` cho từng module nếu
  không có RFC mới cho phép ngoại lệ.
- Mọi thay đổi định dạng số chứng từ (prefix, độ dài đệm, phạm vi scope của sequence) phải thực
  hiện qua cấu hình hoặc mở rộng `SequenceCodeGeneratorService` hiện có, không nhân bản logic.

Lưu ý: 8 generator `Sequence*Generator` tồn tại từ trước T012 (branch, inventory-adjustment,
organization, product/sku, purchase-order, purchase-return, stock-count, transfer — xem ghi chú
technical debt tại `sequence-code-generator.service.ts`) KHÔNG bị đụng tới bởi AD12 — chính sách
này áp dụng cho document number MỚI được tạo từ sau Phase 4 trở đi, không hồi tố dọn dẹp các
generator cũ nếu không có RFC riêng.

## Invoice Snapshot Freeze (Decision AD13, sau Phase 5 của T013 Sales Foundation)

Sau khi Phase 5 (Invoice Snapshot) hoàn thành và được Architect APPROVE, Snapshot ghi trên
Invoice/InvoiceItem (`customerCodeSnapshot`/`customerNameSnapshot`/`customerPhoneSnapshot`,
`productCodeSnapshot`/`productNameSnapshot`/`unitNameSnapshot`, giá đã áp dụng) được coi là
**immutable historical record**:

- Không được cập nhật (UPDATE) Snapshot sau khi Invoice đã được tạo, dưới bất kỳ lý do gì (kể cả
  sửa lỗi dữ liệu — không "vá" trực tiếp lên Invoice cũ).
- Nếu phát sinh yêu cầu điều chỉnh dữ liệu Invoice trong tương lai, phải dùng cơ chế chứng từ điều
  chỉnh riêng (Adjustment/Credit Note/Return...), không sửa Snapshot của Invoice gốc.
- Field Conditional (`barcodeId`/`barcodeSnapshot`) hiện luôn `null` (Cart chưa capture nguồn gốc
  quét Barcode — xem Phase 5 Implementation Report) — nếu tương lai bổ sung khả năng ghi giá trị
  này, đó là ghi MỚI cho Invoice MỚI, không phải sửa Invoice cũ đã đóng băng.

## Product Type Policy Freeze (Decision AD14, sau Phase 6 của T013 Sales Foundation)

Sau khi Phase 6 (Service Product Support) hoàn thành và được Architect APPROVE:

- `STOCK` (ngầm định qua `Product.type !== 'SERVICE'`, gồm `STANDARD`/`VARIANT_PARENT`/
  `VARIANT_CHILD`) và `SERVICE` là hai loại Product chính thức có hành vi Checkout/Inventory
  khác nhau trong T013.
- Mọi logic Inventory (trừ tồn, giữ chỗ, movement) CHỈ áp dụng cho Product có yêu cầu quản lý tồn
  kho — SERVICE luôn bị loại trừ khỏi các bước này (xem Checkout Phase 6, `checkout.service.ts`).
- Nếu tương lai bổ sung loại Product mới (vd `DIGITAL`, `SUBSCRIPTION`, `GIFT_CARD`...), phải có
  RFC riêng xác định hành vi Inventory/Checkout của loại mới — KHÔNG được sửa trực tiếp logic đã
  đóng băng của `STOCK` hoặc `SERVICE` để "tiện" nhét loại mới vào.

## T013 Architecture Baseline (Decision AD15, sau Phase 7/Final Regression của T013 Sales Foundation)

Sau khi Phase 7 (Final Regression & Release Readiness) hoàn thành và T013 được xác nhận **COMPLETED ở cấp độ kiến trúc**, toàn bộ kiến trúc T013 (Checkout Command Pattern AD07, Idempotency 2-transaction AD09, Repository Boundary 5 module AD10, Checkout Orchestrator AD11, Numbering Policy AD12, Invoice Snapshot AD13, Product Type Policy AD14) được coi là **Baseline chính thức của dự án**:

- Mọi thay đổi sau này lên bất kỳ phần nào của Baseline này phải thông qua RFC mới — không sửa trực tiếp dựa trên "tiện" hay "nhỏ".
- Phải giữ tương thích ngược (backward compatibility) với Baseline, trừ khi có một quyết định kiến trúc khác minh thị cho phép phá vỡ.
- Không được phá vỡ bất kỳ điều nào trong AD09-AD14 khi triển khai Task tiếp theo (T014 Sales Return, T015 Purchase Foundation, ...) — các Task đó CONSUME Baseline này, không được sửa nó.

## Release Governance (Decision AD16, ban hành cùng lúc T013 COMPLETED)

- Tag chỉ được tạo SAU KHI có phê duyệt Release (Final Release Review) riêng — Release Preparation
  (rà soát changelog, chuẩn bị release note, xác nhận version) KHÔNG phải là ủy quyền tag.
- Commit phát hành (commit cuối cùng trước khi tag) phải tham chiếu rõ RFC, SPEC, và Implementation
  Report của Phase cuối (Phase 7) trong nội dung commit message.
- Không được gộp thêm tính năng ngoài phạm vi Task đang đóng (T013) vào cùng một đợt phát hành —
  mỗi Task đóng gói/tag riêng, không trộn lẫn.

## RC Validation Gate (Decision AD17, ban hành sau T013 Closeout, trước Release)

Sau khi một Task Type A (Business-Critical) hoàn thành Closeout, KHÔNG được commit/tag/bắt đầu
Task tiếp theo ngay — phải qua một vòng **Release Candidate (RC) Validation** riêng trước:

- Mục đích: xác nhận hệ thống trong điều kiện gần với phát hành thực tế (end-to-end kịch bản thật,
  nhiều phương thức thanh toán/voucher/STOCK-SERVICE, idempotency, rollback khi lỗi, hiệu năng và
  đồng thời/concurrency) — không chỉ Unit Test/Architecture Test đã chạy ở Phase cuối.
- Nếu RC Validation đạt → Ủy quyền Commit → Ủy quyền Tag → Release Notes cuối cùng → khóa hoàn
  toàn Task đó → mới mở Task/Milestone tiếp theo.
- Không bắt đầu Task tiếp theo trước khi Task hiện tại đạt mức Release Candidate.
- Nếu môi trường không đủ hạ tầng để chạy RC Validation thật (vd thiếu Docker/Postgres/Redis reachable)
  — đây là một constraint phải được báo cáo minh bạch (bằng chứng cụ thể, không phỏng đoán), không
  được tự hạ thấp phạm vi RC Validation hay giả lập kết quả.

## RC Validation Acceptance (Decision AD19, sau T013 RC Validation Lite — ghi chú: AD18 không được ban hành cho dự án này, đánh số của Architect nhảy từ AD17 sang AD19, giữ nguyên không tự đánh số lại)

RC Validation **Lite** (không có Docker/Postgres/Redis thật) được chấp nhận là đủ điều kiện để
chuyển sang Release Workflow khi ĐỦ CẢ 3 điều kiện:

1. Môi trường hiện tại xác nhận không hỗ trợ Docker/PostgreSQL/Redis (bằng chứng cụ thể, không
   phỏng đoán — xem RC Validation Gate, AD17).
2. Báo cáo RC Validation phân biệt rõ ràng phần đã kiểm chứng (Verified) và phần chưa kiểm chứng
   được trong môi trường hiện tại (Not Verifiable) — không đánh đồng, không suy diễn kết quả cho
   phần chưa chạy được.
3. Không có regression mới được phát hiện.

**Điều kiện đi kèm (Conditional PASS — RC-03):** nếu môi trường production hoặc CI chính thức có
PostgreSQL/Redis, PHẢI có một vòng RC Validation Full (Docker/Postgres/Redis thật) xác nhận trước
khi phát hành rộng rãi — đây là hoạt động BỔ SUNG tăng cường chất lượng, không phủ nhận kết quả RC
Lite đã được chấp nhận ở milestone này.

## Ví dụ cụ thể từ chính dự án này (tham khảo khi áp dụng)

- **RFC/SPEC mâu thuẫn với code thực tế**: `SPEC-ORG-001` giả định `Organization.plan` là SSOT duy nhất cho gói dịch vụ, nhưng code đã có sẵn ý tưởng tách `OrganizationSubscription` — dừng lại hỏi, nhận `ARCHITECT DECISION` xác nhận hướng đi trước khi code T002.
- **2 Decision trong CÙNG 1 SPEC mâu thuẫn nhau**: `SPEC-INV-001` Decision 8 ("không sửa Checkout") mâu thuẫn trực tiếp với Decision 11/12 ("Single Writer, không ngoại lệ") — dừng lại, nêu bằng chứng file:line, đưa 2 phương án, nhận Revision 1 xác nhận trước khi động vào `checkout.service.ts`.
- **Disclosure không thay thế Fix** (áp dụng ở bước 6, sau self-review): báo cáo T004 lần đầu có Coverage giảm nhẹ đã disclose trung thực — User vẫn từ chối cho qua, yêu cầu sửa THẬT (T004.1) trước khi được coi là hoàn thành. Xem `REVIEW_RULES.md` §4.
