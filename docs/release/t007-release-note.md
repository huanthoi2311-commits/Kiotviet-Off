# Release Note — T007: Brand Implementation (Sprint-01)

**Tag:** `v0.4.0-brand-foundation`
**Trạng thái:** Technical Complete = PASS · Operational Complete = PENDING (cùng mẫu T005/T006 — thiếu Docker/Postgres/Redis trong sandbox phát triển).
**SPEC:** `SPEC-BRAND-001` · **Implementation Plan:** `docs/implementation/brand-implementation-plan.md`

---

## Sprint Summary

T007 là task thứ 2 chạy **trọn vẹn** quy trình chính thức đã thiết lập từ T006: `Dependency Audit → RFC → Architecture Review → SPEC → Implementation Plan → Architecture Review → Code (6 bước, không gộp) → Release`. Khác T006 (không có RFC formal, chỉ Architect Decision trực tiếp), T007 có `RFC-0003` đầy đủ do Claude Code soạn theo ủy quyền 1 lần (`ARCHITECT DECISION – START RFC-0003`, Decision B01-B04), qua Architecture Review + Architect Resolution (Decision RQ1-RQ5) trước khi vào SPEC-BRAND-001.

Đây cũng là Sprint đầu tiên **không chạm bất kỳ module nào khác** ngoài `brand` (ngoại trừ 2 file dùng chung toàn dự án: `error-codes.ts`, `permission-catalog.ts`) — xác nhận qua Dependency Impact (Implementation Plan §3): 0 tham chiếu tới `Brand`/`brandId` trong `purchase-order`/`purchase-return`/`inventory`/`inventory-adjustment`/`supplier`.

## Feature Summary

- **`Brand.version`** (Optimistic Lock) — `PATCH /brands/:id` bắt buộc gửi đúng version, sai → `409` (`BRAND_VERSION_CONFLICT`).
- **`POST /brands/:id/restore`** (mới) — khôi phục Brand đã xóa mềm, luôn trả `status` về `INACTIVE`, không bao giờ trực tiếp `ACTIVE` (Decision RQ2) — permission mới `brand:restore`.
- **`GET /brands`** — thêm `isActive`/`sortBy`/`sortOrder`. `isActive` là **filter alias tầng business cho `status`, không phải cột schema mới** (Decision RQ1) — quyết định có chủ đích khác Product/Category, theo nguyên tắc mới **"Business First, Consistency Second"** (Decision RQ5): không thêm field chỉ để nhất quán hình thức khi không tạo giá trị nghiệp vụ thật.
- **`CommonStatus` giữ nguyên** — không tạo `BrandStatus` riêng (Decision B02.1), tiếp tục dùng chung với `Warehouse`/`Tax`/`Supplier`/`Customer`.
- **Không tạo `BrandDomainService`** — quyết định YAGNI có chủ đích (Decision B02.8), giống Category: Dependency Audit xác nhận 0 module khác tiêu thụ `BRAND_REPOSITORY`.

## Breaking Changes

| Thay đổi | Trước | Sau |
|---|---|---|
| `PATCH /brands/:id` | Không cần `version` | **Bắt buộc** gửi `version` (409 nếu sai) |
| `GET /brands` sắp xếp | Hardcode `{ name: 'asc' }` | Mặc định `name`/`asc`, có thể đổi qua `sortBy`/`sortOrder` |

Không có Breaking Change nào liên quan tới `status`/`isActive` — hỗ trợ đồng thời cả 2 filter được xác nhận **không phải Breaking Change** (Decision RQ4), không cần API version mới. Dự án hiện ở `v0.x`, chưa phát hành `v1.0.0`, chưa có khách hàng production thật — rủi ro Breaking Change của `version` bắt buộc chỉ ảnh hưởng nội bộ (đã ghi nhận ở Implementation Plan §6, Risk R4).

## Migration Guide

Đúng 1 migration độc lập (khác Category có 3) — Brand chỉ có 1 thay đổi schema:

1. `20260716080000_brand_version` — thêm `version INTEGER NOT NULL DEFAULT 1`. Không `DROP`, không backfill dữ liệu nào khác ngoài `DEFAULT`.

**Chưa chạy thật trên môi trường có Postgres.** Khi chạy thật: `npx prisma migrate deploy`, xác nhận qua `SELECT COUNT(*) FROM brands WHERE version = 1` khớp đúng số dòng hiện có.

## Rollback Guide

```sql
ALTER TABLE "brands" DROP COLUMN "version";
```

An toàn tuyệt đối — không có `DROP TYPE`/đổi enum nào (`CommonStatus` không bị chạm). **Rollback chưa được chạy thử thật** — cần môi trường Docker (xem `technical-debt.md`).

## Known Limitations

- Integration Test (`test/brand.e2e-spec.ts`, đã cập nhật đủ case Restore/Optimistic Lock/isActive) — chưa chạy được thật, cần Docker.
- Rollback Test cho migration `20260716080000_brand_version` — chưa chạy thử thật.
- Manual API Smoke Test — chưa thực hiện, cần app chạy thật với Postgres/Redis.
- Domain Event (`BrandCreated`/`Updated`/`Archived`/`Restored`) — chỉ có hook no-op, chưa publish thật (chờ Sprint Event + Outbox Pattern, ADR-0011), đúng mẫu Product/Category.

## Pending Operational Tests

Xem `docs/architecture/technical-debt.md` — Brand đã được gộp vào 3 mục PENDING chung đã có (Integration Test #1, Rollback Test #2, Manual Smoke Test #3), cùng nhóm nguyên nhân với Product/Category (thiếu Docker/Postgres/Redis), đúng quy ước đã dùng cho T005/T006 thay vì mở mục riêng cho từng Task.

## Test Summary

- Module `brand`: 64/64 test PASS (38 baseline + 26 mới cho Optimistic Lock/Restore/isActive/Sort/Validation/API Contract). Coverage ~97-100% statements (baseline trước đó 91.41%).
- **Regression Baseline** (Decision T007-04.9): toàn bộ `npx jest` — **139/139 test suite PASS, 1318/1318 test PASS** — xác nhận Sprint-00, T005 (Product), T006 (Category), Auth, RBAC, Inventory, Organization, Branch đều không bị ảnh hưởng.
- Coverage toàn backend: 87.47% statements (không phải mục tiêu của T007 — T007 không chạm module nào khác ngoài `brand`/`error-codes.ts`/`permission-catalog.ts`). **Xác nhận qua Decision R01**: "Coverage ≥ 90%" áp dụng theo phạm vi module đang triển khai (`brand`, đã đạt ~97-100%), không phải toàn Backend — cùng cách đã áp dụng cho T005/T006.

## Next Sprint

- Sprint-01 hoàn thành khoảng **30%** (Decision R07: T005/T006/T007 DONE trên tổng roadmap Master Data).
- **T008 — Unit Domain**, theo đúng thứ tự roadmap đã cố định (Decision R08/T007-03: Brand → Unit → Barcode → Attribute → Variant, "không được bỏ qua thứ tự"). **Không chuyển sang Customer/Supplier/Inventory/Promotion/POS/ERP.** Bước bắt buộc kế tiếp là `RFC-0004 — Unit Domain` từ Architect — Claude Code không tự bắt đầu RFC/SPEC/code cho T008 khi chưa có chỉ đạo.
- Từ T007 trở đi, Regression Baseline mở rộng thành **T005 + T006 + T007** (Decision T007-04.9).
- Versioning giữ `v0.x.y` cho tới khi hoàn thành toàn bộ Master Data/CRM/Inventory/POS/ERP Core theo roadmap — chưa phát hành `v1.0.0` sớm.

## Release Review

`ARCHITECTURE REVIEW – T007 Brand Implementation` — APPROVED WITH FINAL DECISIONS (Decision R01-R08). Toàn bộ Release Gate (Decision R04) xác nhận PASS: Build/TypeCheck/Lint/Unit Test/Architecture Test/Regression/Coverage/Release Note/PROJECT_STATUS/CHANGELOG. Decision R01 xác nhận cách diễn giải "Coverage ≥ 90%" theo phạm vi module `brand` (không phải toàn Backend) là đúng — cùng cách đã áp dụng cho T005/T006. Decision R02 xác nhận việc sửa CHANGELOG của T006 là Maintenance Fix hợp lệ. AUTHORIZATION cuối cùng cho phép tag `v0.4.0-brand-foundation`, push, cập nhật `PROJECT_STATUS.md`, đóng T007 — đã thực hiện đầy đủ.
