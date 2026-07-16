# Release Note — T005: Product Refactor (Sprint-01)

**Tag:** `v0.2.0-product-foundation`
**Trạng thái:** Technical Complete = PASS · Operational Complete = PENDING (Decision C07)
**SPEC:** `SPEC-PRODUCT-001` · **Báo cáo kỹ thuật đầy đủ:** `docs/implementation/t005-product-refactor-report.md`

---

## Mục tiêu Sprint

Refactor module `product` (đã build sẵn từ trước, không phải module mới) để giải quyết vi phạm Repository Boundary (ADR-0010) — 5 module (`cart`, `barcode`, `unit`, `brand`, `category`) từng inject trực tiếp `PRODUCT_REPOSITORY`, cùng dạng vấn đề đã xử lý ở T004 cho Inventory nhưng khác bản chất (Product chưa từng có race condition ghi xuyên module). Đồng thời bổ sung mô hình Variant (Product Type + self-reference), Optimistic Lock, và chuẩn hóa `ProductStatus`.

## Chức năng hoàn thành

- **`ProductDomainService`** — cửa ngõ đọc duy nhất của `Product` cho module khác (`findById`, `hasActiveProductsInCategory/Brand/Unit`). `PRODUCT_REPOSITORY` không còn export ra ngoài `product` module (xác nhận bằng Architecture Test tự động, 10/10 PASS).
- **Product Variant** — `ProductType` (`STANDARD`/`SERVICE`/`VARIANT_PARENT`/`VARIANT_CHILD`) thay thế `isService`; `parentProductId` self-reference cho Variant Child (không có model `Variant` riêng).
- **Optimistic Lock** — `Product.version`, compare-and-swap qua `updateMany`, `PATCH /products/:id` bắt buộc gửi `version` hiện tại, sai → `409`.
- **`ProductStatus`** — thêm `DRAFT`, đổi tên `DISCONTINUED` → `ARCHIVED`.
- **Barcode đa tenant** — `Barcode.organizationId` mới, unique theo `(organizationId, code)` thay vì toàn cục.
- **Business rule mới** (sau Feature Flag): chặn đổi `type` nếu Product đã phát sinh giao dịch; chặn Archive nếu còn Variant Child đang hoạt động.
- **5 module phụ thuộc** (`category`→`brand`→`unit`→`barcode`→`cart`) đã chuyển sang inject `ProductDomainService`.

## Breaking Changes

| Thay đổi | Trước | Sau |
|---|---|---|
| `isService` (boolean) | Có trong DTO/response | **Đã xóa** — thay bằng `type` |
| `PATCH /products/:id` | Không cần `version` | **Bắt buộc** gửi `version` (409 nếu sai) |
| `DELETE /products/:id` | Chỉ set `deletedAt` | Set cả `status=ARCHIVED` lẫn `deletedAt`; từ chối nếu còn Variant Child active |
| `POST /products/:id/restore` | — | Luôn trả `status=INACTIVE` (không tự động `ACTIVE`) |
| `Barcode.code` unique | Toàn cục | Theo `(organizationId, code)` |
| `ProductStatus` giá trị `DISCONTINUED` | Có | Đổi tên thành `ARCHIVED` (dữ liệu cũ tự động chuyển) |

Các thay đổi này đã được duyệt tường minh qua RFC-0001/SPEC-PRODUCT-001 (Decision A13/C01: đây là breaking change có chủ đích, không áp dụng nguyên tắc Backward Compatibility cho phạm vi đã duyệt).

## Migration Notes

3 migration độc lập, mỗi migration kèm `rollback.sql` riêng:

1. `20260716020000_product_status_type_version_parent` — `ProductStatus`/`ProductType`/`version`/`parentProductId`.
2. `20260716030000_barcode_organization_scope` — `Barcode.organizationId` + unique constraint mới (có duplicate-check tự động, FAIL nếu phát hiện trùng — không tự merge).
3. `20260716040000_product_drop_legacy_fields` — dọn `isService`/constraint cũ (chạy an toàn vì code đã ngừng tham chiếu từ trước).

**Chưa chạy thật trên môi trường có Postgres** — xem Operational Pending bên dưới. Khi chạy thật: dùng `npx prisma migrate deploy`, xác nhận qua query đối chiếu số dòng trước/sau (đặc biệt Barcode duplicate-check).

## Feature Flag

`PRODUCT_REFACTOR_ENABLED` (env var, mặc định `false`) — gate đúng 3 điểm: Optimistic Lock enforcement, Product Type change guard, Archive-blocks-active-variant guard. Không dual implementation, không fork business flow (chỉ chọn nguồn dữ liệu/điều kiện rẽ nhánh boolean đơn giản). **Chỉ bật sau khi Integration Test PASS trên môi trường thật.** Là cơ chế tạm thời — xóa hoàn toàn khỏi code khi refactor đã ổn định trong production.

## Known Limitations

- Integration Test (e2e), Rollback Test, Manual API Smoke Test — 🟡 **PENDING (Environment Constraint)**, không phải lỗi code (Decision C04-C06/C07). Không có Docker/Postgres/Redis trong môi trường phát triển hiện tại.
- `test/product.e2e-spec.ts` chưa tồn tại — cần tạo khi có môi trường Docker.
- Domain Event (`ProductCreated`/`Updated`/`Archived`/`Activated`) — chỉ có hook no-op, chưa publish thật (chờ Sprint Event + Outbox Pattern, ADR-0011).

## Operational Pending

Cần môi trường có Docker (`docker-compose up`, Postgres 16 + Redis) để hoàn tất:

1. Chạy 3 migration thật (`prisma migrate deploy`), xác nhận không mất dữ liệu.
2. Chạy thử `rollback.sql` của từng migration (up → rollback → up lại, xác nhận idempotent).
3. Viết và chạy `test/product.e2e-spec.ts`.
4. Manual Smoke Test qua Swagger UI/curl cho đủ 6 route (`POST`/`GET`/`GET :id`/`PATCH`/`DELETE`/`POST :id/restore`).
5. Bật `PRODUCT_REFACTOR_ENABLED=true` sau khi tất cả mục trên PASS.

Khi hoàn tất, cập nhật `docs/implementation/t005-product-refactor-report.md` §8 (Acceptance Criteria) — 4 mục PENDING (#5/#6/#10/#11) chuyển PASS.

## Next Sprint

- **T006 — Category Domain** (RFC-0002, đang khởi động — xem `docs/architecture/category-dependency-audit.md` và `docs/rfc/RFC-0002-category-domain.md`).
- Nâng cấp `Inventory` lên chuẩn `version` (Optimistic Lock) để đồng bộ toàn dự án (ghi nhận ở SPEC-PRODUCT-001 §1.1, chưa lên lịch cụ thể).
- ProductPrice/multi-price-list — chờ Promotion Sprint (ngoài phạm vi Sprint-01).
- Sprint Event — triển khai Outbox Pattern thật (ADR-0011), publish 4 Domain Event của Product đã định nghĩa ở T005.
