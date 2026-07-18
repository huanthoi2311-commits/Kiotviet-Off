# Release Note — T011: Customer Domain

**Tag:** `v0.7.0-customer-domain`
**Trạng thái:** Technical Complete = PASS · Operational Complete = PENDING (End-to-End Migration Scenario + Integration Test — thiếu Docker/Postgres trong sandbox phát triển).
**RFC:** `RFC-T011` v2 (`docs/rfc/RFC-T011-customer-domain.md`) · **SPEC:** `SPEC-T011-CUSTOMER-001` (`docs/specifications/SPEC-T011-CUSTOMER-001.md`) · **Quy trình:** Fast Track Workflow (không Implementation Plan riêng — `SPEC Review → Implementation → Implementation Report → Release Review → Commit → Tag`).

---

## Sprint Summary

T011 là task **brownfield refactor** đầu tiên trong dự án (Decision CR01) — khác mọi Master Data trước (Product/Category/Brand/Unit/Barcode đều là greenfield khi bắt đầu RFC). Customer đã có triển khai đầy đủ từ Sprint-00 (20 file, có test) với 2 module khác (`checkout`, `customer-point`) phụ thuộc thật vào nó — Architecture Review đầu tiên phát hiện 5 conflict cụ thể + 3 ambiguity giữa RFC gốc và code thật, dẫn tới **2 vòng Architect Resolution** trước khi RFC được duyệt đủ điều kiện viết SPEC:

```
RFC-T011 v1 (Architect) → Architecture Review (Claude Code)
  → ARCHITECT RESOLUTION lần 1 (AR-T011-01~08) — RFC REVISION REQUIRED
  → RFC-T011 v2 (Claude Code cập nhật theo CR01-CR13, ủy quyền tường minh)
  → ARCHITECTURE REVIEW SPEC-T011-CUSTOMER-001 (SR01-SR15) — APPROVED, Fast Track
  → Implementation (7 commit logic, chưa commit thật)
```

## Feature Summary

- **`CustomerStatus`** (`ACTIVE`/`INACTIVE`/`ARCHIVED`, enum riêng — thay `CommonStatus` 2 giá trị) — thống nhất trạng thái + soft-delete (trước đây `status` và `deletedAt` hoàn toàn tách biệt).
- **`Customer.version`** (Optimistic Lock, mới hoàn toàn — trước đây Customer không có Optimistic Lock) — áp dụng cho Update/Activate/Deactivate/Archive/Restore (5 route ghi).
- **`POST /customers/:id/activate`** và **`POST /customers/:id/deactivate`** (mới) — tách lifecycle transition ra khỏi `PATCH` chung, đúng transition table RFC §8 (chỉ `INACTIVE→ACTIVE` và `ACTIVE→INACTIVE`, sai transition → `422`).
- **Customer code — optional input, mandatory stored value** (Decision CR05/SR08) — client có thể tự cung cấp `code` (validate + unique check) hoặc để hệ thống tự sinh (giữ nguyên `SequenceCustomerCodeGenerator` hiện có, không viết generator mới — đã audit đạt cả 3 tiêu chí: atomic, organization-scoped, concurrency-safe).
- **`phone` không còn unique** (Decision CR06/SR09) — gỡ `@@unique([organizationId, phone])`, gỡ application-level duplicate check, gỡ `CUSTOMER_PHONE_DUPLICATE` khỏi luồng Create/Update (giữ định nghĩa error code, không dùng). `phone` cũng chuyển sang nullable (trước đây bắt buộc).
- **`CustomerDomainService`** (mới) — 6 method (`findById`/`findActiveById`/`findUsableForSale`/`existsByCode`/`assertBelongsToOrganization`/`assertNotArchived`), sửa **Repository Boundary violation tồn tại từ trước T011**: `checkout.service.ts`/`customer-point.service.ts` từng inject thẳng `CUSTOMER_REPOSITORY` — nay dùng `CustomerDomainService`.
- **`contactName`, `paymentTermDays`** (field mới, RFC §6.9/§6.12).
- **3 field tài chính/thống kê deprecated, KHÔNG xóa** (Decision CR02/CR03/SR06/SR07): `currentDebt`, `totalRevenue`, `totalOrder` — vẫn có trong response (Backward Compatibility — Decision CR12), nhưng không nhận input từ Create/Update DTO nào.
- **`totalPoint` giữ nguyên** (Decision CR04/SR05) — system-maintained projection, đồng bộ qua Domain Event thật từ `customer-point` (không phải no-op hook như Brand/Unit/Barcode — module Customer đã có publish/subscribe thật từ Sprint-00, đúng chuẩn ADR-0009).

## Breaking Changes

| Thay đổi | Trước | Sau |
|---|---|---|
| `POST /customers` | `code` không nhận được (luôn tự sinh) | `code` optional — client có thể tự cung cấp |
| `POST /customers` | `phone` bắt buộc | `phone` tùy chọn |
| `PATCH /customers/:id` | Không cần `version`, có thể set `status` | Bắt buộc `version` (409 nếu sai); **không** nhận `status` (chuyển sang route riêng) |
| `DELETE /customers/:id` | Không cần body | Bắt buộc body `{ version }` |
| `POST /customers/:id/restore` | Không cần body | Bắt buộc body `{ version }` |
| `POST /customers/:id/activate`, `.../deactivate` | Không tồn tại | Mới |
| Tạo 2 Customer cùng `phone` trong 1 Organization | Bị chặn (`409`) | Cho phép |
| `checkout` chọn Customer đã `ARCHIVED` | Cho phép (chỉ check tồn tại) | Bị chặn (`404`, qua `findActiveById()` — đúng BR04) |

Dự án hiện `v0.x`, chưa có khách hàng production thật — rủi ro chỉ ảnh hưởng nội bộ. Toàn bộ thay đổi đã qua RFC v2 + SPEC + Architecture Review (CR01-CR13, SR01-SR15) — breaking change có chủ đích.

## Migration Guide

3 migration độc lập, mỗi migration kèm `rollback.sql` riêng, không `DROP` dữ liệu nghiệp vụ:

1. `20260718000000_customer_version` — thêm `version INTEGER NOT NULL DEFAULT 1`.
2. `20260718010000_customer_status_and_fields` — `CREATE TYPE "CustomerStatus"`, đổi cột `status` sang enum mới (backfill từ `status`+`deletedAt` cũ), thêm `contactName`/`paymentTermDays`, đổi `phone` sang nullable.
3. `20260718020000_customer_phone_unique_removal` — gỡ `@@unique([organizationId, phone])`.

**Chưa chạy thật trên môi trường có Postgres.** Không có Migration nào đụng tới `currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint` (Decision CR02/CR03/CR04 — giữ nguyên, không backfill, không đổi kiểu).

## Rollback Guide

- Rollback 1: `ALTER TABLE customers DROP COLUMN version`.
- Rollback 2: khôi phục `phone NOT NULL` (chỉ an toàn nếu chưa có dữ liệu NULL thật), xóa `contactName`/`paymentTermDays`, khôi phục `status` về `CommonStatus` 2 giá trị (ARCHIVED gộp về INACTIVE).
- Rollback 3: khôi phục `@@unique([organizationId, phone])` (chỉ an toàn nếu chưa phát sinh dữ liệu trùng phone thật).

Chi tiết đầy đủ + câu lệnh kiểm tra trước khi rollback: `SPEC-T011-CUSTOMER-001.md` §15.

## Cross-module Changes

- **`checkout`**: `checkout.service.ts` đổi từ inject `CUSTOMER_REPOSITORY` sang `CustomerDomainService`, dùng `findActiveById()` (đúng BR04 — Archived Customer không dùng được cho giao dịch mới). Đây là thay đổi hành vi có chủ đích, không phải chỉ đổi cách inject.
- **`customer-point`**: `customer-point.service.ts` đổi sang `CustomerDomainService`, giữ nguyên `findById()` (không áp dụng BR04 — đồng bộ điểm không phải giao dịch bán hàng mới).
- **`rbac`**: `permission-catalog.ts` thêm `customer:activate`/`customer:deactivate`.
- Không module nào khác bị chạm — `Order`/`Debt` chỉ có quan hệ FK schema-level, chưa có module NestJS; `Payment`/`Invoice` có module nhưng chưa từng gọi Customer Service/Repository.

## Known Limitations

- Integration Test (`test/customer.e2e-spec.ts`) — 🟡 chưa tồn tại, cần tạo mới + chạy trên Docker/Postgres thật (PENDING, nhóm chung với các module khác trong `technical-debt.md`).
- **End-to-End Migration Scenario** (Decision SR14, Acceptance Criteria #13 của SPEC) — 🟡 PENDING, cần Docker để chạy migration thật trên dữ liệu Customer cũ và xác nhận toàn bộ chuỗi (migration → build → test → đăng nhập → đọc/tạo/sửa/archive Customer → checkout/customer-point vẫn hoạt động).
- Rollback Test cho 3 migration — chưa chạy thử thật.
- Manual API Smoke Test — chưa thực hiện.
- Branch Coverage module `customer`: 86.32% (dưới 90%, cùng tình huống Barcode T009 — Decision FR01 tiền lệ: không chặn Release, ghi nhận PENDING).
- Archive Guard (BR07) — T011 **không** implement guard thật (chưa có Sales Foundation/Debt Ledger), chỉ đảm bảo `CustomerDomainService` có API sẵn sàng cho T013/T017 tích hợp sau — đúng quyết định RFC, không phải thiếu sót.

## Pending Operational Tests

Xem `docs/architecture/technical-debt.md` — Customer được gộp vào 3 mục PENDING chung đã có (Integration Test #1, Rollback Test #2, Manual Smoke Test #3) + mục riêng cho End-to-End Migration Scenario.

## Test Summary

- Module `customer`: 15 test suite / 142 test PASS. Coverage: 99.14% statements, 86.32% branch, 100% functions, 99.69% lines.
- Module `checkout`/`customer-point` (phần bị chạm bởi Repository Boundary fix): PASS, không regression.
- **Architecture Test**: `customer-repository-boundary.architecture.spec.ts` — 5/5 assertion PASS, xác nhận `CustomerModule` chỉ export `CustomerDomainService`, `checkout`/`customer-point` không còn import `CUSTOMER_REPOSITORY`/`ICustomerRepository`.
- **Regression Baseline**: toàn bộ `npx jest` — **153/153 test suite PASS, 1478/1478 test PASS** (2 suite không liên quan — `argon2-password-hasher`, `purchase-report-export` — timeout khi chạy song song do tranh chấp CPU, xác nhận flake bằng cách chạy lại độc lập PASS 8/8, không phải regression — cùng hiện tượng đã ghi nhận ở T009).
- Build/TypeCheck/Lint: PASS, 0 lỗi (toàn backend).

## Next Sprint

- **T012 — Supplier**, WAITING RFC từ Architect.

## Release Review

`FINAL RELEASE REVIEW — T011 Customer Domain` — **APPROVED FOR RELEASE**. Toàn bộ 10 tiêu chí PASS:

| # | Tiêu chí | Kết quả |
|---|---|---|
| FR01 | RFC/SPEC Compliance | PASS — khớp RFC-T011 v2, SPEC-T011-CUSTOMER-001, CR01-CR13, SR01-SR15, không tự mở rộng phạm vi |
| FR02 | Brownfield Strategy | PASS — Evolution of existing module, không rewrite/xóa dữ liệu/refactor ngoài phạm vi |
| FR03 | Repository Boundary | PASS — **thành công lớn nhất của T011**: `checkout`/`customer-point` chuyển hẳn sang `CustomerDomainService`, không `forwardRef()`, không circular dependency, không repository leak, Architecture Test 5/5 xác nhận |
| FR04 | Migration | PASS — 3 migration độc lập đúng quyết định, có rollback, chưa chạy do thiếu Docker (đúng quy trình) |
| FR05 | Regression | PASS — 153/153 suite, 1478/1478 test; 2 timeout (argon2/purchase-report-export) xác nhận flake, không chặn release |
| FR06 | Coverage | PASS WITH TECHNICAL DEBT — 99%/100%/99%/86% (branch dưới mục tiêu, giống Barcode, không chặn release, đã ghi Technical Debt #8) |
| FR07 | Backward Compatibility | PASS — giữ `totalPoint`/`totalRevenue`/`totalOrder`, không phá API, không phá dữ liệu |
| FR08 | Breaking Changes | PASS — đã ghi rõ đầy đủ, các thay đổi (code optional, phone optional/non-unique, version bắt buộc, activate/deactivate) đều hợp lý |
| FR09 | Documentation | PASS — đặc biệt ghi nhận Claude Code tự phát hiện và sửa gap CHANGELOG.md (T009 release note chưa được chuyển khỏi `[Unreleased]`) |
| FR10 | Working Tree | PASS — chưa add/commit/push/tag trước khi có Final Release Review, đúng quy trình |

**Đánh giá kiến trúc sau T011:** Repository Boundary đã ổn định hơn rõ rệt — Customer và Barcode đã hình thành chung 1 pattern (Domain Service làm public read port, Repository token không export ra ngoài module), kỳ vọng giúp T012 (Supplier) triển khai nhanh hơn đáng kể.

**FINAL RELEASE DECISION:** APPROVED. Release/Git/Commit/Push/Tag đều AUTHORIZED. Commit message: `feat(customer): complete customer domain refactor`. Tag: `v0.7.0-customer-domain`.

**Quyết định mới sau T011 (Decision AD05):** chính thức phân loại module thành **Type A** (Business-Critical — Sales/Purchase/Inventory/Debt Ledger/Cashbook/Reports, đủ 7 bước kể cả Implementation Plan) và **Type B** (Standard Master Data — Customer/Supplier/Brand/Category/Unit/Barcode, Fast Track 5 bước không Implementation Plan). Chi tiết: `docs/project-governance/AI_WORKFLOW.md` mục "Phân loại Module — Type A / Type B".

**Module kế tiếp:** T012 — Supplier Domain (Type B, Fast Track Workflow), WAITING Short RFC từ Architect.
