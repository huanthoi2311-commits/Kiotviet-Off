# Release Note — T013: Sales Foundation

**Tag đề xuất:** `v0.9.0-sales-foundation` (chưa tạo — chờ Final Release Review + Authorization riêng, Decision AD16)
**Trạng thái:** Technical Complete = PASS (Phase 1-7 đều APPROVED, Phase 7 Release Readiness Checklist 7/7 PASS) · **Release = CHƯA APPROVED, chưa commit/push/tag.**
**RFC:** `RFC-T013` v2 (`docs/rfc/RFC-T013-sales-foundation.md`) · **SPEC:** `SPEC-T013-SALES-FOUNDATION-001` v2 (`docs/specifications/SPEC-T013-SALES-FOUNDATION-001.md`) · **Quy trình:** Type A / Business-Critical, đầy đủ 13 bước (Decision AD06) + Phase Gate Policy (Decision AD08) — 7 Phase, mỗi Phase có Architect Review + Decision riêng.

---

## Sprint Summary

T013 là module **Type A đầu tiên** áp dụng đầy đủ quy trình 13 bước (RFC → Architecture Review → Architect Resolution → RFC Revision → SPEC → SPEC Review → Implementation Plan → Plan Review → Implementation theo Phase Gate → Implementation Report từng Phase → Final Regression → Final Release Review → Commit → Tag). Architecture Review phát hiện khác biệt căn bản với giả định ban đầu của RFC: Checkout/Cart/Invoice/Payment **đã là hệ thống thật, one-shot atomic** (không phải "Draft Sales Invoice" mutable như RFC v1 giả định) — dẫn tới RFC v2 viết lại theo đúng kiến trúc thật (AD07 Checkout Command Pattern: `Cart → Checkout Command → Atomic Business Transaction → Immutable Invoice`).

```
RFC-T013 v1 (Architect) → Architecture Review (Claude Code)
  → ARCHITECT RESOLUTION (AR01-AR18) — APPROVED WITH DECISIONS
  → RFC-T013 v2 (Claude Code cập nhật theo AR01-AR18)
  → SPEC-T013-SALES-FOUNDATION-001 v1 → SPEC Review (SP01-SP12, Decision AD07)
  → SPEC v2 (thiết kế lại Idempotency thành 2-transaction, SP02)
  → Implementation Plan (7 Phase, Decision AD08 Phase Gate Policy)
  → Phase 1 Idempotency Foundation (APPROVED, Decision AD09)
  → Phase 2 Repository Boundary Cleanup (APPROVED, Decision AD10)
  → Phase 3 Checkout Refactor (APPROVED WITH MINOR REVISIONS, Decision AD11)
  → Phase 4 Invoice Number Integration (APPROVED, Decision AD12)
  → Phase 5 Invoice Snapshot (APPROVED, Decision AD13)
  → Phase 6 Service Product Support (APPROVED, Decision AD14)
  → Phase 7 Final Regression & Release Readiness (APPROVED, Decision AD15/AD16)
  → T013 COMPLETED ở cấp độ kiến trúc — chờ Final Release Review + commit/tag riêng
```

## Feature Summary

### Phase 1 — Idempotency Foundation
- **`checkout_operations`** (bảng mới) — hỗ trợ kỹ thuật cho idempotency của `POST /checkout`, không phải aggregate nghiệp vụ.
- **Thiết kế 2-transaction** (Decision SP01/SP02) — Bước 1 "Reserve" (`INSERT ... PROCESSING`) là transaction/statement riêng, commit ngay lập tức TRƯỚC Business Transaction chính — làm cho trạng thái `PROCESSING` durable, quan sát được, PHỤC HỒI được nếu app crash giữa chừng (điều mà thiết kế 1-transaction ban đầu không thể làm được).
- **Retry Policy đầy đủ**: not-found→NEW; `COMPLETED`+hash khớp→REPLAY (trả lại Invoice/Payment cũ); `COMPLETED`+hash khác→409 `CHECKOUT_IDEMPOTENCY_KEY_REUSED`; `PROCESSING` chưa treo (<2 phút)→409 `CHECKOUT_IDEMPOTENCY_CONFLICT`; `PROCESSING` treo (≥2 phút) hoặc `FAILED`→tự động `tryReclaim()` (compare-and-swap) → NEW.
- **Retention Policy**: `expiresAt = createdAt + 48h`.

### Phase 2 — Repository Boundary Cleanup
- **`CartDomainService`, `CustomerPointDomainService`** (mới) — export duy nhất từ `CartModule`/`CustomerPointModule`, thay cho việc export thẳng repository token.
- **`InvoiceModule`/`PaymentModule`** — gỡ `INVOICE_REPOSITORY`/`PAYMENT_REPOSITORY` khỏi `exports`, chỉ export `InvoiceService`/`PaymentService` (giữ nguyên tên class — xem "Disclosed Deviations" bên dưới).

### Phase 3 — Checkout Refactor
- `CheckoutService`/`CheckoutController` tích hợp đầy đủ Idempotency: header `Idempotency-Key` bắt buộc (400 `CHECKOUT_IDEMPOTENCY_KEY_MISSING` nếu thiếu), reserve→REPLAY-shortcut-hoặc-NEW→validate→Business Transaction (kết thúc bằng `markCompleted`)→clear cart→publish event, `markFailed()` chạy trong `catch` cho MỌI nhánh lỗi kể từ sau reserve() thành công.

### Phase 4 — Invoice Number Integration
- `SequenceInvoiceCodeGenerator` đổi sang dùng `Branch.invoicePrefix` (fallback `"HD"` nếu Branch chưa cấu hình) + `SequenceCodeGeneratorService` dùng chung (T012) — sequence tách riêng theo từng Branch (`invoice_code_<branchId>`).

### Phase 5 — Invoice Snapshot
- **Mandatory**: `Invoice.customerCodeSnapshot`/`customerNameSnapshot`/`customerPhoneSnapshot` (null nếu khách lẻ), `InvoiceItem.productCodeSnapshot`/`productNameSnapshot`/`unitNameSnapshot` — luôn ghi khi checkout thành công.
- **Conditional**: `InvoiceItem.barcodeId`/`barcodeSnapshot` — hiện luôn `null` (xem Known Limitations).
- Tất cả cột mới đều nullable, KHÔNG backfill Invoice cũ.

### Phase 6 — Service Product Support
- Product loại `SERVICE`: được bán, có mặt trên `InvoiceItem`/`Payment`, tính đúng discount/voucher/tax như Product thường — CHỈ loại trừ khỏi bước gọi `InventoryDomainService.decrease()`. Hóa đơn hỗn hợp STOCK+SERVICE hoạt động đúng.

## Breaking Changes

| Thay đổi | Trước | Sau |
|---|---|---|
| `POST /checkout` | Không cần header | Bắt buộc header `Idempotency-Key` (400 nếu thiếu) |
| `POST /checkout` response (Invoice/InvoiceItem) | Không có Snapshot field | +6 field Mandatory Snapshot (Invoice: 3, InvoiceItem: 3) + 2 field Conditional (`barcodeId`/`barcodeSnapshot`, luôn null hiện tại) — **additive, không phá vỡ client cũ** |
| `CHECKOUT_FAILED_EVENT` | Chỉ phát khi lỗi trong/sau Business Transaction | Phát cho MỌI lỗi sau khi reserve() thành công (kể cả lỗi validate sớm) |
| Mã hóa đơn mới | 1 sequence chung toàn Organization | 1 sequence riêng theo từng Branch (mã hóa đơn cũ giữ nguyên) |
| `InvoiceModule`/`PaymentModule` exports | Export cả Service + Repository token | Chỉ export Service |

Dự án hiện `v0.x`, chưa có khách hàng production thật — rủi ro chỉ ảnh hưởng nội bộ. Toàn bộ thay đổi đã qua RFC v2 + SPEC v2 + 7 vòng Architect Review — breaking change có chủ đích, đã disclosed từng Phase.

## Disclosed Deviations (qua các Phase, đã Architect xác nhận)

1. **Phase 2** — giữ nguyên `InvoiceService`/`PaymentService` thay vì tạo `InvoiceDomainService`/`PaymentDomainService` như Architect yêu cầu chữ nghĩa — lý do: 2 service này đã đóng đúng vai trò Domain Service (không có CRUD dư thừa cần tách). Không bị yêu cầu sửa lại.
2. **Phase 1** — dùng `'COMPLETED'` (theo authorization prompt) thay vì `'SUCCEEDED'` (SPEC v2 dùng từ này) cho `CheckoutOperationStatus` — terminology drift, disclosed, không bị yêu cầu đổi.
3. **Phase 3** — `markFailed()` mở rộng phạm vi `CHECKOUT_FAILED_EVENT` (widening có chủ đích, cần thiết cho Idempotency-Key release ngay thay vì đợi stuck-timeout 2 phút).
4. **Phase 4** — Branch's `BRANCH_REPOSITORY` (chưa qua Repository Boundary Cleanup) được `invoice` module tiêu thụ trực tiếp — không tự tạo `BranchDomainService` mới (ngoài phạm vi Phase 4).
5. **Phase 5** — Snapshot field cũng được thêm vào `InvoiceResponseDto`/`InvoiceMapper` (API expose), vượt literal "persist" — lý do: dữ liệu persisted mà không hiển thị được thì vô dụng cho mục đích Invoice.

## Migration Guide

2 migration độc lập, mỗi migration kèm `rollback.sql`:

1. `20260719000000_checkout_operations` (Phase 1) — `CREATE TYPE`/`CREATE TABLE checkout_operations`, unique `(organizationId, idempotencyKey)`, index `(status, createdAt)` + `(expiresAt)`.
2. `20260720000000_invoice_snapshot_fields` (Phase 5) — 8 cột nullable trên `invoices`/`invoice_items` + FK `invoice_items.barcodeId → barcodes.id`.

**Chưa chạy thật trên môi trường có Postgres/Docker.**

## Rollback Guide

- Rollback 1: `DROP TABLE "checkout_operations"` (và `DROP TYPE`).
- Rollback 2: `ALTER TABLE invoices/invoice_items DROP COLUMN ...` (9 cột, xem `rollback.sql`).
- Repository Boundary: nếu cần rollback, revert export về trạng thái cũ (tạm thời, không khuyến nghị).

Chi tiết đầy đủ: `SPEC-T013-SALES-FOUNDATION-001.md` §19.

## Cross-module Changes

- **`cart`**: +`CartDomainService` (export mới).
- **`customer-point`**: +`CustomerPointDomainService` (export mới).
- **`invoice`**: export thu hẹp (chỉ `InvoiceService`), +6 field Snapshot trên entity/DTO, generator đổi logic (branch-scoped), import `BranchModule`.
- **`payment`**: export thu hẹp (chỉ `PaymentService`).
- **`checkout`**: constructor injection đổi hoàn toàn (10+ dependency), +idempotency, +Snapshot lookup (Product/Unit), +SERVICE skip trong Inventory loop, import thêm `ProductModule`/`UnitModule`.
- **`branch`**: không đổi code, nhưng `BRANCH_REPOSITORY` (export sẵn có, chưa cleanup) nay có thêm 1 consumer (`invoice`).
- Không module nào khác bị chạm.

## Known Limitations

- **Barcode Conditional Snapshot luôn null** — Cart chưa capture nguồn gốc quét Barcode, cần RFC riêng nếu muốn bổ sung.
- **`checkout_operations` Cleanup Job chưa xây** — chỉ có lazy recovery (`tryReclaim()`).
- Integration Test (`test/checkout.e2e-spec.ts`, `test/invoice.e2e-spec.ts` nếu cần) — chưa tạo mới cho các flow T013, cần Docker/Postgres thật.
- End-to-End Acceptance Scenario — PENDING, cần Docker.
- Rollback Test cho 2 migration — chưa chạy thử thật.
- Manual API Smoke Test — chưa thực hiện.
- 8 generator `Sequence*Generator` khác (ngoài Customer/Supplier từ T012) vẫn chưa hợp nhất vào `SequenceCodeGeneratorService` (ngoài phạm vi AD12).
- `BranchModule` vẫn export raw `BRANCH_REPOSITORY` (chưa qua Repository Boundary Cleanup riêng).

## Test Summary

- **Full regression**: 166/166 test suite PASS, 1584/1584 test PASS (chạy lại 2 lần ở Phase 7, cả 2 lần fully clean — 1 flake `argon2-password-hasher` đã biết từ trước, KHÔNG xuất hiện ở cả 2 lần chạy Phase 7).
- **Coverage** (checkout+invoice+cart+customer-point+payment, tổng hợp Phase 5-7): checkout 97.75-100% stmts/85.9-100% branch, invoice 95.91-100% stmts/75-92.85% branch, customer-point 97.77-100% stmts/80-100% branch, payment 100%/75-100% branch, cart 100%/100% (baseline Phase 2, không đổi).
- **Architecture Test**: 5 Repository Boundary spec (`cart`/`checkout-operation`/`customer-point`/`invoice`/`payment`) — tất cả PASS, xác nhận qua cả Architecture Test lẫn grep thủ công toàn repo (0 vi phạm).
- Build/TypeCheck/Lint/Prisma Validate: PASS, 0 lỗi (toàn backend, chạy lại tại Phase 7).

## Next Sprint

- **T014 — Sales Return** (tiếp theo trong roadmap phẳng T009-T025), WAITING RFC từ Architect.

## Release Review

**CHƯA THỰC HIỆN.** Phase 7's "Release Readiness Checklist" (7/7 PASS, xem Phase 7 Implementation Report) xác nhận sẵn sàng về mặt kỹ thuật, nhưng theo Decision AD16, một vòng **Final Release Review** riêng (theo đúng tiền lệ T009-T012) vẫn cần được Architect thực hiện/ủy quyền trước khi commit/push/tag. Release note này là tài liệu **chuẩn bị** (Release Preparation), không phải xác nhận Release.

**Đề xuất cho Final Release Review** (chờ Architect xác nhận hoặc điều chỉnh):
- **Version đề xuất**: `v0.9.0-sales-foundation` (nối tiếp `v0.7.0-customer-domain` → `v0.8.0-supplier-domain`, đúng Versioning Policy — vẫn `v0.x` cho tới khi Master Data/CRM/Inventory/POS/ERP Core hoàn tất).
- **Commit message đề xuất** (single commit hoặc theo Phase — chờ chỉ đạo): `feat(sales): complete T013 sales foundation (RFC-T013 v2, SPEC-T013-SALES-FOUNDATION-001 v2, Phase 1-7 approved)`.
- **Tag đề xuất**: `v0.9.0-sales-foundation`.

**FINAL RELEASE DECISION:** PENDING — chưa commit/push/tag.

**Module kế tiếp:** T014 — Sales Return, WAITING RFC từ Architect.
