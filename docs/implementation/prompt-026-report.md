# Implementation Report — Prompt 026: Supplier Module

**Ngày:** 2026-07-14
**Phạm vi:** Quản lý Nhà cung cấp đầy đủ (không chỉ tên+SĐT) — CRUD/Search/Filter/Pagination/Soft Delete/Restore/Export Excel/Import Excel/Supplier-Product Mapping (Many-to-Many). Đây là Prompt đầu tiên trong loạt Purchase/Procurement (026-030) và đầu tiên yêu cầu Import/Export Excel trong toàn bộ dự án.

## 1. Phụ thuộc mới (được chính Prompt 026 yêu cầu trực tiếp)

- **`exceljs@^4.4.0`** (runtime dependency) — Import/Export Excel là Functional Requirement tường minh của Prompt, không thể thực hiện nếu không có thư viện đọc/ghi `.xlsx`. Không vi phạm "Đóng băng phạm vi" vì được chính Prompt này ủy quyền trực tiếp.
- **`@types/multer`** (devDependency, chỉ định kiểu) — `multer` bản thân đã có sẵn qua `@nestjs/platform-express` (dùng cho `FileInterceptor`), nhưng thiếu type definitions khiến `Express.Multer.File` không resolve được. Chỉ bổ sung kiểu, không thêm runtime code mới.
- **`npm audit` phát hiện 2 lỗ hổng mức trung bình (moderate)** trong `uuid` (phiên bản cũ, đóng gói bên trong `exceljs`) — lỗi "Missing buffer bounds check khi buf được cung cấp". **Không áp dụng** `npm audit fix --force` vì sẽ hạ cấp `exceljs` xuống 3.4.0 (breaking change, mất tính năng). Rủi ro thực tế thấp: `uuid` được `exceljs` dùng nội bộ để sinh ID quan hệ/cell trong file `.xlsx`, không nhận buffer từ input người dùng qua bất kỳ đường nào trong code của module này. Disclose minh bạch, không tự ý fix.

## 2. Quyết định thiết kế

1. **`code` không tự sinh (khác Product/Transfer/StockCount/Adjustment)**: Prompt 026 không nêu "tự sinh mã" như các Prompt trước — chỉ nêu "Supplier Code Unique Trong Organization" như một ràng buộc, không phải một quy trình sinh mã. Xử lý như Brand/Unit/Warehouse: `code` do người dùng nhập, unique theo `[organizationId, code]`, P2002 dịch sang 409.
2. **`name` (Foundation) → `companyName`, xóa `debtAmount`**: Field list của Prompt 026 dùng `companyName` (không phải `name`), và không liệt kê `debtAmount`. Migration **backfill dữ liệu** (`companyName = name` trước khi enforce NOT NULL và xóa cột `name` cũ) thay vì DROP+ADD thẳng — tránh phá vỡ dữ liệu nếu bảng `suppliers` đã có bản ghi (không bắt buộc theo luật chỉ áp dụng từ Prompt 031, nhưng là thực hành đúng và đón đầu). `debtAmount` bị xóa vì Prompt 029 (Supplier Debt) sẽ thay bằng ledger `SupplierDebt` — một raw balance column trên Supplier đi ngược nguyên tắc "không update Debt trực tiếp" đã được xác lập xuyên suốt từ Prompt 022.
3. **`SupplierProduct` API không có trong API list gốc** (chỉ "Supplier Product Mapping" được nêu ở Functional Requirements, không có endpoint cụ thể) — bổ sung 3 endpoint tối thiểu cần thiết theo mẫu Barcode (Prompt 020): `GET/POST /suppliers/:id/products`, `DELETE /suppliers/:id/products/:productId`. Dùng lại permission `supplier:update` (không tạo permission riêng) vì đây là một dạng cập nhật dữ liệu của Supplier, không phải một resource độc lập với vòng đời riêng.
4. **Import Excel: validate TOÀN BỘ file trước khi ghi bất kỳ dòng nào** — nếu có bất kỳ dòng nào lỗi, không dòng nào được ghi (thay vì mở DB transaction rồi rollback giữa chừng). Đây là cách đơn giản và tuyệt đối an toàn nhất để thỏa "Import Excel → Rollback nếu lỗi": không có gì để rollback vì chưa từng ghi. `importBatch()` (transaction ở tầng repository) chỉ chạy sau khi 100% dòng đã pass validate, và vẫn atomically wrap bằng `$transaction` để phòng vệ thêm cho lỗi DB-level (vd. constraint) xảy ra giữa chừng khi ghi.
5. **Import theo cơ chế "upsert theo code"**: dòng có `code` đã tồn tại trong Organization → cập nhật; chưa tồn tại → tạo mới. Đây là hành vi hợp lý nhất cho một luồng import thực tế (vừa thêm mới vừa cập nhật hàng loạt qua cùng 1 file) — không được nêu rõ trong Prompt nhưng là diễn giải tự nhiên nhất của "Import Excel" không kèm ràng buộc "chỉ tạo mới".
6. **Cấu trúc Clean Architecture cho Excel**: `exceljs` bị cô lập hoàn toàn trong `infrastructure/excel/` sau `ISupplierExcelPort` (domain interface) — cùng nguyên tắc Prisma chỉ xuất hiện trong `infrastructure/persistence/`. `application/supplier-excel.service.ts` không import `exceljs` trực tiếp, chỉ gọi qua port.
7. **Lỗi kiểu dữ liệu từ chính `exceljs`**: file khai báo kiểu của `exceljs` tự viết `declare interface Buffer extends ArrayBuffer {}` (global augmentation lỗi, xung đột với `Buffer` thật của Node). Giải quyết bằng cách dùng overload `workbook.xlsx.read(stream)` thay vì `load(buffer)` (chuyển `Buffer` thành `Readable` qua `stream.Readable.from()`) — né hoàn toàn xung đột kiểu, **không dùng `any`** ở bất kỳ đâu, đúng Definition of Done.
8. **Cột Excel dùng chung 1 nguồn định nghĩa** (`SUPPLIER_EXCEL_COLUMNS`) cho cả Export (sinh cột) và Import (đọc header để map cột theo tên, không phụ thuộc thứ tự cột trong file người dùng tải lên) — người dùng có thể sắp xếp lại cột mà import vẫn đúng.
9. **Lỗi Import trả về đúng cơ chế `errors: string[]` đã có sẵn** trong `HttpExceptionFilter` (mỗi lỗi có tiền tố "Dòng N: ...") thay vì phát minh một cấu trúc lỗi lồng nhau mới mà filter không render được — giữ nguyên envelope lỗi thống nhất toàn hệ thống.

## 3. Chức năng đã hoàn thành

- **CRUD đầy đủ** + Search (theo code/tên công ty/MST/người liên hệ/SĐT) + Filter (status/province) + Pagination + Sort + Soft Delete + Restore.
- **Chặn xóa khi đã có Purchase Order** (bất kỳ, không chỉ "active") — `hasPurchaseOrders()`.
- **Export Excel**: `GET /suppliers/export`, áp cùng bộ lọc với danh sách, trả file `.xlsx` qua `Content-Disposition: attachment`.
- **Import Excel**: `POST /suppliers/import` (multipart/form-data), validate toàn bộ trước khi ghi, upsert theo code, trả về `{createdCount, updatedCount}`.
- **Supplier-Product Mapping**: gán/liệt kê/bỏ gán sản phẩm cho nhà cung cấp (M2M qua `SupplierProduct`, unique `[supplierId, productId]`).
- **Audit Log** đầy đủ cho mọi hành động ghi (create/update/delete/restore/import/export/product-mapping), gồm IP/Browser/Request-ID (qua cơ chế `AuditLogService`/`AsyncLocalStorage` đã có từ Prompt 011-015).
- **Permission**: `supplier:view/create/update/delete/restore/import/export` — đúng 7 permission đã cho.

## 4. File đã tạo/sửa

**Tạo mới** — `backend/src/modules/supplier/` (đủ 4 lớp + Excel port/adapter riêng): domain (2 entity, 2 repository interface, Excel port interface), application (7 DTO, mapper, 3 service — CRUD/mapping/Excel — + spec tương ứng + DTO validation spec), infrastructure (2 Prisma repository + spec, `ExceljsSupplierExcelAdapter` + spec dùng exceljs thật không mock), presentation (2 controller + spec), `supplier.module.ts`.
**Tạo mới khác**: `backend/test/supplier.e2e-spec.ts`, migration `20260714110000_supplier_module`.
**Sửa**: `schema.prisma` (Supplier mở rộng đầy đủ field list, thêm `SupplierProduct`; back-relation `Product.supplierProducts`), `app.module.ts` (đăng ký `SupplierModule`), `error-codes.ts` (+`SUPPLIER_001..008`), `permission-catalog.ts` (`supplier` group +`restore`/`import`/`export`), `package.json` (+`exceljs`, +`@types/multer`).

## 5. Migration

`20260714110000_supplier_module`: backfill `companyName` từ `name` trước khi enforce NOT NULL và xóa cột `name`; xóa `debtAmount`; thêm 9 cột mới (`contactName`, `website`, `province`, `district`, `ward`, `bankName`, `bankAccount`, `paymentTerm`, `creditLimit`, `note` — 10 thực tế); tạo bảng `supplier_products` (unique `[supplierId, productId]`, FK CASCADE cả 2 chiều).

## 6. API

| Method | Path | Permission |
|---|---|---|
| POST | `/api/v1/suppliers` | `supplier:create` |
| POST | `/api/v1/suppliers/import` | `supplier:import` |
| GET | `/api/v1/suppliers/export` | `supplier:export` |
| GET | `/api/v1/suppliers` | `supplier:view` |
| GET | `/api/v1/suppliers/:id` | `supplier:view` |
| PATCH | `/api/v1/suppliers/:id` | `supplier:update` |
| DELETE | `/api/v1/suppliers/:id` | `supplier:delete` |
| POST | `/api/v1/suppliers/:id/restore` | `supplier:restore` |
| GET/POST | `/api/v1/suppliers/:id/products` | `supplier:view` / `supplier:update` |
| DELETE | `/api/v1/suppliers/:id/products/:productId` | `supplier:update` |

Xác nhận qua Swagger generation offline: **56 route tổng** (tăng từ 49 sau Prompt 025), đúng 7 route suppliers-liên-quan (không tính mapping) + 2 route mapping. Thứ tự route xác nhận đúng: `import`/`export` (path tĩnh) đăng ký trước `:id` (path động) — không bị nuốt route. DI graph resolve thành công.

## 7. Test

- **Unit**: **581/581 PASS** toàn backend (tăng từ 497 sau Prompt 025). Supplier-specific (84 test): `SupplierService` (create/findOne+404/search/update+404/remove+chặn-khi-có-PO+404/restore+404+chặn-chưa-xóa), `SupplierProductService` (list/upsert/remove, đều chặn khi supplier không tồn tại), `SupplierExcelService` (export+audit, import: file rỗng→422, có dòng lỗi→422 không ghi gì, toàn bộ hợp lệ→importBatch+audit, rollback-toàn-bộ khi 1/3 dòng lỗi), **`ExceljsSupplierExcelAdapter` dùng exceljs thật** (không mock — build buffer hợp lệ có magic bytes ZIP "PK", round-trip build→parse giữ đúng dữ liệu, bỏ qua dòng trống, xử lý workbook rỗng), `PrismaSupplierRepository` (CRUD+P2002, restore, search/export, hasPurchaseOrders, **importBatch** — tạo mới/cập nhật/xử lý nhiều dòng cùng transaction), `PrismaSupplierProductRepository` (upsert+P2002+P2003, list, findOne, remove), 2 controller (permission metadata, ủy quyền, xử lý file upload/response buffer), DTO validation.
- **Coverage** (`supplier/`, loại trừ `.module.ts`): **92.22% statement, 96.2% function, 94.23% line, 78.74% branch** — vượt mốc ≥90% mà Prompt 026 yêu cầu tường minh ở statement/function/line.
- **Integration**: `test/supplier.e2e-spec.ts` — vòng đời đầy đủ qua HTTP thật (tạo→tìm kiếm→chi tiết→cập nhật→xóa mềm→khôi phục), từ chối trùng code (409), **chặn xóa khi đã có Purchase Order thật** (tạo trực tiếp 1 dòng `PurchaseOrder` qua Prisma rồi gọi DELETE → 422), gán/liệt kê/bỏ gán Supplier-Product qua API thật, **Export** (xác nhận response là file `.xlsx` hợp lệ qua Content-Type + magic bytes "PK"), **Import** (dùng `exceljs` thật build 1 file hợp lệ → gửi qua `supertest.attach()` → xác nhận supplier được tạo; dùng `exceljs` build 1 file có 1/2 dòng lỗi → xác nhận 422 và dòng hợp lệ KHÔNG được tạo, chứng minh rollback-toàn-bộ hoạt động đúng qua HTTP thật). **Chưa xác nhận PASS** — sandbox không có Docker/PostgreSQL, cùng giới hạn Gate B đã disclose từ Prompt 016.
- Build/Lint/TypeCheck/Prisma validate: tất cả **PASS** trên toàn repo.

## 8. Self-Review (Definition of Done)

- **Không TODO** — đã `grep` xác nhận rỗng trong `src/modules/supplier/`.
- **Không FIXME** — đã `grep` xác nhận rỗng.
- **Không `any`** — đã `grep` xác nhận rỗng; xung đột kiểu `Buffer` của `exceljs` được giải quyết bằng cách đổi API (`read(stream)` thay vì `load(buffer)`), không dùng `any`/ép kiểu bừa.
- **Không console.log** — đã `grep` xác nhận rỗng.
- **Architecture Review**: Clean Architecture giữ nguyên layering 4 lớp; `exceljs` bị cô lập hoàn toàn sau `ISupplierExcelPort`, domain/application không phụ thuộc nó. Không circular dependency (`SupplierModule → RbacModule` một chiều).
- **Security Review**: multipart upload dùng `FileInterceptor` (memory storage mặc định của multer, không ghi file tạm ra đĩa — tránh path traversal); không thực thi công thức Excel nào (chỉ đọc `.result`/`.text` dạng chuỗi, không `eval`); mọi truy vấn đều lọc `organizationId` (kể cả `SupplierProduct` qua `supplier.organizationId` lồng trong `where`) — không có đường rò rỉ dữ liệu chéo tổ chức.
- **Performance Review**: Import xử lý tuần tự từng dòng trong 1 transaction — chấp nhận được ở quy mô nhà cung cấp thực tế (hàng trăm-nghìn dòng/lần import), không có yêu cầu hiệu năng cụ thể nào ở Prompt 026 (yêu cầu hiệu năng định lượng chỉ bắt đầu bắt buộc từ Prompt 031 theo đúng thông báo mới nhất của người dùng).
- **Claude Review**: đã tự rà soát toàn bộ luồng Import/Export bằng test round-trip thật (không mock `exceljs`) để đảm bảo hành vi đúng với thư viện thực tế, không chỉ đúng với mock.

**Definition of Done đạt được** (trừ Integration Test PASS thật — cùng giới hạn Gate B đã biết, đã disclose minh bạch). Sẵn sàng cho Prompt 027 (Purchase Order — nghiệp vụ nhập hàng, module quan trọng nhất của Inventory theo lời người dùng).
