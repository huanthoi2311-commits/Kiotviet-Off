# Implementation Report — Prompt 020: Barcode Module

**Ngày:** 2026-07-14
**Phạm vi:** Barcode Module — quản lý mã vạch độc lập cho Product (thêm/sửa/xóa/đặt mặc định), tách khỏi luồng tạo Product.

## 1. Chức năng đã hoàn thành

- **Thêm/liệt kê mã vạch theo sản phẩm**: `GET/POST /products/:productId/barcodes`.
- **Sửa/xóa mã vạch độc lập theo id**: `PATCH/DELETE /barcodes/:id` (không cần biết `productId`, tra cứu qua chính barcode).
- **Đặt mã vạch mặc định**: `POST /barcodes/:id/default` — transaction đảm bảo tại một thời điểm mỗi Product chỉ có tối đa 1 barcode `isDefault=true` (unset toàn bộ default cũ của cùng `productId` trước khi set default mới, trong cùng `$transaction`).
- **Tenant isolation cho thao tác qua id barcode**: `findById`/`update`/`softDelete`/`setDefault` đều join qua `product.organizationId` trong Prisma query — một barcode ở tổ chức khác trả về 404, không lộ dữ liệu chéo tổ chức.
- **Chặn tạo barcode cho Product không tồn tại/không thuộc tổ chức**: `BarcodeService` gọi `IProductRepository.findById(productId, organizationId)` trước khi tạo/liệt kê → 404 `BARCODE_PRODUCT_NOT_FOUND` nếu không hợp lệ. Đây là kiểm soát bảo mật bắt buộc (không chỉ để trả 404 đẹp): nếu bỏ qua bước này, một user có thể truyền `productId` thật của **tổ chức khác** và ràng buộc khóa ngoại (FK) vẫn thỏa mãn vì Product đó tồn tại (chỉ khác tổ chức) — dẫn tới ghi/đọc chéo tổ chức.
- **Soft Delete** (không restore, giống Brand/Unit).
- **Permission**: `barcode:create/view/update/delete` (thêm mới vào catalog). Riêng hành động "đặt mặc định" dùng chung permission `barcode:update` — không tạo permission riêng vì đây là một biến thể của "sửa", tránh phình catalog cho một sub-action.
- **Audit Log**: create/update (old/new)/delete/set_default — action `barcode.create|update|delete|set_default`.
- **Swagger**: đầy đủ, tái dùng `ApiWriteErrors()`/`ApiCommonErrors()`.
- **Validation**: `code` 1-100 ký tự; `type` giới hạn enum (EAN13/EAN8/CODE128/QR/CUSTOM — khớp `BarcodeType` đã có trong schema từ Prompt 016); `unitId` phải là UUID nếu có.

## 2. Quyết định thiết kế

1. **Hai controller riêng biệt trong cùng module** (`ProductBarcodeController` tại `/products/:productId/barcodes`, `BarcodeController` tại `/barcodes`) thay vì gộp route lồng nhau vào một controller: NestJS không hỗ trợ tốt việc trộn 2 base-path khác nhau trong 1 `@Controller()`, tách riêng giữ đúng nguyên tắc route rõ ràng, mỗi controller có prefix cố định.
2. **Không có DTO tìm kiếm/phân trang cho danh sách barcode theo sản phẩm**: số barcode trên mỗi Product trong thực tế rất nhỏ (thường 1-5), không cần phân trang — trả thẳng mảng `BarcodeResponseDto[]`, tránh thêm cấu trúc phân trang không cần thiết.
3. **`BarcodeType` tái dùng từ `product/domain/entities/product.entity.ts`** thay vì định nghĩa lại union type riêng trong module Barcode: đây là kiểu dữ liệu do Product module định nghĩa gốc (khớp enum Prisma `BarcodeType`), import lại tránh rủi ro lệch kiểu giữa hai module theo thời gian — cùng tinh thần với việc Category/Brand/Unit đã import `IProductRepository`/`PRODUCT_REPOSITORY` trực tiếp từ Product module ở các Prompt trước.
4. **`existsByCode` không dùng `organizationId`** (khác `existsByCode` của Brand/Unit): vì cột `code` trên bảng `barcodes` là `@unique` toàn hệ thống (không scoped theo tổ chức) — quyết định này đã có sẵn từ schema Prompt 016 (barcode thực tế theo chuẩn EAN/UPC là duy nhất toàn cầu), Prompt 020 giữ nguyên không đổi schema.
5. **Xóa barcode đang là mặc định không tự động thăng cấp barcode khác lên làm mặc định**: giữ hành vi đơn giản, không suy đoán "barcode nào nên thay thế". Barcode là kênh tra cứu bổ trợ (Product vẫn tìm được qua SKU/tên), không phải trường bắt buộc cho luồng bán hàng, nên thiếu barcode mặc định tạm thời sau khi xóa không phải lỗi nghiêm trọng — nghiệp vụ có thể gọi `POST /barcodes/:id/default` lên barcode còn lại khi cần.

## 3. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/barcode/` (đủ 4 lớp): domain (entity tái dùng `BarcodeType` từ Product, repository interface), application (DTO×3, mapper, service + spec + DTO validation spec), infrastructure (Prisma repository + spec — có transaction cho `create(isDefault=true)` và `setDefault`), presentation (2 controller + spec), `barcode.module.ts`.
**Tạo mới khác**: `backend/test/barcode.e2e-spec.ts`.
**Sửa**: `app.module.ts` (đăng ký `BarcodeModule`), `permission-catalog.ts` (+`crud('barcode', 'mã vạch')`).
**Không sửa**: `schema.prisma`, `error-codes.ts` (đã có sẵn `BARCODE_001..003` từ Prompt 017).

## 4. Migration

Không có — model `Barcode` đã đầy đủ (`code`, `type`, `isDefault`, `unitId`, audit fields, `deletedAt`) từ Prompt 016.

## 5. API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/products/:productId/barcodes` | `barcode:view` |
| POST | `/api/v1/products/:productId/barcodes` | `barcode:create` |
| PATCH | `/api/v1/barcodes/:id` | `barcode:update` |
| DELETE | `/api/v1/barcodes/:id` | `barcode:delete` |
| POST | `/api/v1/barcodes/:id/default` | `barcode:update` |

Xác nhận qua Swagger generation offline: **29 route tổng** (tăng từ 26 sau Prompt 019), đúng 3 path barcode-liên-quan. DI graph resolve thành công, không phát hiện circular dependency (`BarcodeModule → ProductModule, RbacModule` một chiều).

## 6. Test

- **Unit**: **282/282 PASS** toàn backend (tăng từ 242 sau Prompt 019). Barcode-specific (40 test): service (listByProduct+404 khi sai product, create+404+audit log, update+404+audit log, remove+404, setDefault+404+audit log), Prisma repository (create thường/qua transaction khi isDefault/P2002→409/P2003→400/lỗi không xác định, findById lọc theo organizationId qua product, listByProduct, update+P2002, softDelete, setDefault dùng transaction unset-rồi-set, existsByCode+loại trừ excludeId), 2 controller (permission metadata `it.each`, ủy quyền actor context đúng), DTO validation (hợp lệ tối thiểu/code rỗng/type sai enum/unitId sai UUID/đầy đủ field tùy chọn).
- **Coverage module `barcode/`** (loại trừ `.module.ts`): **93.25% statement, 100% function, 93.91% line, 82.05% branch** — vượt mốc 90% ở statement/function/line.
- **Integration**: `test/barcode.e2e-spec.ts` — tạo/liệt kê qua API thật, 404 khi `productId` không tồn tại, set-default đảm bảo chỉ 1 barcode mặc định/sản phẩm (test tạo 2 barcode, set default sang barcode thứ 2, xác nhận danh sách chỉ còn đúng 1 default), 409 khi trùng `code` toàn hệ thống, cập nhật/xóa mềm qua HTTP thật (204, sau đó thao tác tiếp trả 404). **Chưa xác nhận PASS** — sandbox không có Docker/PostgreSQL, cùng giới hạn môi trường đã disclose từ Prompt 016 (Gate B, `docs/release-gates.md`).
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 7. Self-Review

Không còn TODO/FIXME/console.log/`any` thừa trong `src/modules/barcode/` (đã `grep` xác nhận rỗng). Clean Architecture giữ nguyên layering; interface dùng `import type` riêng theo yêu cầu `isolatedModules`. Không phát sinh circular dependency: `BarcodeModule → ProductModule, RbacModule` một chiều. Multi-tenant isolation là trọng tâm thiết kế của module này (mục 2.1 ở trên) — đã kiểm tra kỹ vì đây là module đầu tiên thao tác trên một entity (Barcode) không có cột `organizationId` trực tiếp, phải join qua `Product` ở mọi điểm truy cập theo id. Rủi ro hiệu năng: không đáng kể — số barcode/sản phẩm nhỏ, `setDefault`/`create(isDefault=true)` dùng `$transaction` ngắn (2 câu lệnh), không khóa bảng diện rộng.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Đây là prompt cuối trong loạt 016-020 (Product/Category/Brand/Unit/Barcode Foundation) — chờ chỉ đạo tiếp theo của người dùng trước khi sang phạm vi mới (đúng "Đóng băng phạm vi").
