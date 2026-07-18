# ARCHITECTURE REVIEW — RFC-T012 Supplier Domain

Theo `RFC-T012 — Supplier Domain` (`docs/rfc/RFC-T012-supplier-domain.md`) §18 AUTHORIZATION. Phạm vi đúng như yêu cầu: audit code/schema/API/DTO/permission/repository/dependency/migration risk, đối chiếu với RFC, liệt kê conflict/gap/ambiguity. **Không viết SPEC, không sửa source code, không migration, không commit.** Toàn bộ bằng chứng lấy trực tiếp từ code hiện tại (branch `main`, sau tag `v0.7.0-customer-domain`), có `file:line`.

**Kết luận ngắn gọn:** Supplier cũng là brownfield thật như Customer (RFC §0 đã dự đoán đúng) — module đã có triển khai đầy đủ hơn Customer lúc bắt đầu T011 (thêm Excel Import/Export, thêm `SupplierProduct` linking, và **đã có sẵn 1 Archive Guard thật** — điều Customer chưa từng có). 1 module khác (`supplier-debt`) đang phụ thuộc thật, cùng dạng vi phạm Repository Boundary đã sửa ở T011. Không phát hiện circular dependency.

---

## A. CONFLICT — RFC-T012 mâu thuẫn trực tiếp với code/schema hiện tại

### A1. Archive Guard đã tồn tại và đang hoạt động thật — RFC giả định chưa có

`backend/src/modules/supplier/application/supplier.service.ts:119-135` — `remove()` gọi `this.supplierRepository.hasPurchaseOrders(id)`, nếu `true` → ném `UnprocessableEntityException` với `ErrorCode.SUPPLIER_HAS_PURCHASE_ORDERS` (`error-codes.ts:133`, `SUPPLIER_004`), chặn Archive nhà cung cấp đã có đơn nhập hàng. `backend/src/modules/supplier/domain/repositories/supplier.repository.interface.ts:84` — `hasPurchaseOrders(supplierId: string): Promise<boolean>` là method thật, có implementation, có test (`prisma-supplier.repository.spec.ts`).

Mâu thuẫn trực tiếp với RFC §8 BR08: *"Archive Guard. Thiết kế mở. T015 Purchase Foundation và T017 Debt Ledger sẽ tích hợp. Không tạo dependency giả."* — câu chữ RFC giả định **chưa có guard nào**, chỉ chuẩn bị hạ tầng cho T015 tích hợp sau. Thực tế Supplier **đã có Delete Guard thật, đang chạy**, kiểm tra qua quan hệ Prisma nội bộ tới bảng `purchase_orders` (không phải gọi cross-module tới 1 service/repository của module `purchase-order` — đây là truy vấn SQL nội bộ trong `PrismaSupplierRepository`, không vi phạm Repository Boundary theo nghĩa ADR-0010, chỉ là guard nghiệp vụ đã có sẵn).

**Không tự quyết định giữ hay bỏ.** Xóa guard đang hoạt động để khớp đúng câu chữ RFC có rủi ro toàn vẹn dữ liệu thật (cho phép Archive nhà cung cấp đang có đơn nhập hàng dở dang) — ngược nguyên tắc brownfield §0 ("không phá API hiện tại"). Giữ nguyên guard có thể không đúng ý định ban đầu của RFC (chủ định để trống, chờ T015). Cần Architect xác nhận rõ.

### A2. Repository Boundary violation — `supplier-debt` inject thẳng `SUPPLIER_REPOSITORY`, `SupplierModule` export cả 2 repository token

`backend/src/modules/supplier/supplier.module.ts:26` — `exports: [SUPPLIER_REPOSITORY, SUPPLIER_PRODUCT_REPOSITORY]` — xuất **cả 2** repository token (nặng hơn Customer T011, vốn chỉ xuất 1).

`backend/src/modules/supplier-debt/application/supplier-debt.service.ts:10-11,36-37,68` — inject `SUPPLIER_REPOSITORY` trực tiếp, gọi đúng 1 method `findById()` — **read-only, logic đơn giản**, đúng dạng vi phạm đã sửa ở `checkout`/`customer-point` trong T011 (Decision CR08/SR04).

`SUPPLIER_PRODUCT_REPOSITORY` **hiện không có consumer cross-module nào** (grep toàn bộ `SUPPLIER_PRODUCT_REPOSITORY`/`ISupplierProductRepository`/`SupplierProductService` chỉ khớp file trong chính `supplier` module) — export "rò rỉ nhưng chưa bị khai thác", vẫn nên sửa cùng lúc để nhất quán, mức độ khẩn thấp hơn `SUPPLIER_REPOSITORY`.

Mâu thuẫn trực tiếp với RFC §9 (*"Không export repository"*) và RFC §17 (liệt kê đúng "Repository Boundary violation" là điều kiện dừng). **Đánh giá mức độ khó: thấp** — đúng mẫu Customer, chỉ cần `SupplierDomainService` mới + 1 chỗ swap trong `supplier-debt.service.ts`, không có circular dependency.

### A3. Import/Export Excel đã tồn tại và hoạt động thật — RFC liệt kê là Out of Scope

`backend/src/modules/supplier/presentation/supplier.controller.ts:79-136` — `POST /suppliers/import` (multipart file, rollback toàn bộ nếu lỗi) và `GET /suppliers/export` (xuất `.xlsx`) là route thật, có `SupplierExcelService`, `ExceljsSupplierExcelAdapter`, permission riêng `supplier:import`/`supplier:export` (`permission-catalog.ts:154`), error code riêng (`SUPPLIER_IMPORT_INVALID_FILE`, `SUPPLIER_IMPORT_VALIDATION_FAILED`).

RFC §3 Out of Scope liệt kê nguyên văn: *"Import/Export Excel"*.

**Không phải xung đột kiểu "phải xóa code sai"** — đây là tính năng thật, đã hoạt động, không có gì trong RFC nói phải xóa. Nhiều khả năng ý RFC là "T012 không cần **xây mới** Import/Export" (đã có sẵn, không việc gì phải làm) — đúng tinh thần Evolution §0. Nhưng cần xác nhận rõ, không tự suy diễn: giữ nguyên hoàn toàn không đụng tới, hay có yêu cầu điều chỉnh nào (vd Import/Export có cần đồng bộ theo `version`/`CustomerStatus`-tương-đương mới không)?

---

## B. STRUCTURAL GAP — RFC-T012 dự liệu đúng, cần làm rõ quy mô

### B1. Không có Optimistic Lock — không có `version` ở bất kỳ đâu

Không tìm thấy `version` trong `schema.prisma` (model `Supplier`), `supplier.entity.ts`, `supplier.repository.interface.ts`, DTO. Cần 1 migration thêm `version INTEGER NOT NULL DEFAULT 1`, đúng mẫu Customer/Barcode/Unit.

### B2. Status model — `SupplierStatus` hiện chỉ 2 giá trị, tách rời `deletedAt`

`backend/src/modules/supplier/domain/entities/supplier.entity.ts:1` — `export type SupplierStatus = 'ACTIVE' | 'INACTIVE'`. `backend/prisma/schema.prisma:1141` — `status CommonStatus @default(ACTIVE)` (dùng chung `CommonStatus`, không phải type riêng ở tầng schema — khác Entity TypeScript đã có type tên riêng `SupplierStatus` nhưng thực chất cùng 2 giá trị `CommonStatus`). `softDelete()`/`restore()` (`prisma-supplier.repository.ts:109-121`) chỉ set `deletedAt`, không đụng `status` — cùng dạng tách rời đã sửa ở Customer T011. Cần enum `SupplierStatus` 3 giá trị riêng (không dùng chung `CommonStatus`, đang dùng bởi 5 model khác).

### B3. Không có code generator — `code` hiện luôn bắt buộc từ client

`backend/src/modules/supplier/application/dto/create-supplier.dto.ts:16-20` — `code: string` **bắt buộc** (`@IsString() @Length(1,50)`, không `@IsOptional()`). Không tìm thấy `SupplierCodeGenerator`/tương đương nào trong module. **Khác Customer** (đã có sẵn `SequenceCustomerCodeGenerator`, chỉ cần audit + đổi Service logic) — Supplier cần **xây mới hoàn toàn** generator đáp ứng RFC §6 (organization-scoped, atomic, concurrency-safe, không `count()+1`) — khuyến nghị tái dùng đúng pattern `Sequence` table đã có (`SequenceCustomerCodeGenerator`/`SequenceSkuGenerator`), không phải quyết định kiến trúc mới, chỉ là khối lượng việc nhiều hơn Customer.

### B4. Không có Activate/Deactivate — chỉ có `PATCH`+`status` chung

Giống hiện trạng Customer trước T011 — cần 2 route mới, `changeStatusWithVersion()` repository method mới, 2 permission mới (`supplier:activate`/`supplier:deactivate`).

### B5. Ghi (`update`/`softDelete`/`restore`) hiện KHÔNG lọc `organizationId` ở tầng Prisma

`backend/src/modules/supplier/infrastructure/persistence/prisma-supplier.repository.ts:81,111,118` — cả 3 đều `where: { id }` thuần. Đúng lỗ hổng hệ thống đã sửa ở Brand/Unit/Barcode/Customer (T007/T008/T009/T011) — dự kiến tiếp tục xuất hiện ở mọi module scaffold Sprint-00 chưa qua Audit chính thức.

### B6. `existsByCode()` đã có sẵn (khác Customer lúc T011)

`backend/src/modules/supplier/domain/repositories/supplier.repository.interface.ts:79-83` — đã tồn tại, đúng chữ ký RFC §10 muốn — không cần thêm mới, chỉ cần wiring thật vào `SupplierService.create()`/`update()` nếu chưa gọi (hiện `create()` chưa gọi `existsByCode()` trước khi ghi — `supplier.service.ts:40-48` — chỉ dựa vào `@@unique([organizationId, code])` + bắt `P2002`, chưa có pre-check nghiệp vụ như Customer/Barcode đã làm).

---

## C. AMBIGUITY — cần Architect quyết định, Claude Code không tự chọn

### C1. `SupplierProduct` (bảng giá/liên kết Supplier-Product) — có thuộc phạm vi T012 không?

`backend/prisma/schema.prisma:1161-1176` — model `SupplierProduct` (giá mặc định, `leadTime`, `minimumOrderQuantity`, `priority`) đã tồn tại, có module thật (`supplier-product.service.ts`, `supplier-product.controller.ts`, route riêng, đã export `SUPPLIER_PRODUCT_REPOSITORY` — xem A2).

RFC không nhắc `SupplierProduct` ở bất kỳ đâu — không trong Scope (§2), không tên riêng trong Out of Scope (§3 chỉ có "Purchase Pricing" — có thể ý chỉ đúng tính năng này, vì `defaultPrice`/`priority` chính là "giá mua theo NCC"). **Câu hỏi cần Architect trả lời:** T012 hoàn toàn không đụng `SupplierProduct` (giữ nguyên, kể cả phần export repository leak ở A2), hay cần xử lý cùng lúc (vd Optimistic Lock/Activate-Deactivate có áp dụng cho `SupplierProduct` không, hay chỉ riêng `Supplier`)?

### C2. Field naming: `paymentTerm` (hiện có) vs `paymentTermDays` (RFC §5)

Khác biệt thuần tên gọi, cùng ý nghĩa (số ngày công nợ). Đề xuất giữ `paymentTerm` (đúng nguyên tắc brownfield §0 "giảm breaking change") — nhưng đây là điểm cụ thể hóa SPEC, không phải xung đột cần dừng — nêu ở đây để xác nhận cùng lúc với C1/A3 nếu Architect muốn.

---

## D. DEPENDENCY IMPACT

| Module bị chạm | Mức độ | Lý do |
|---|---|---|
| `supplier` (chính) | Sâu | Entity/Repository/Service/Controller/DTO cần cập nhật (status model, version, code generator mới, Activate/Deactivate, Domain Service mới) |
| `supplier-debt` | Nông | 1 dòng — đổi `SUPPLIER_REPOSITORY.findById()` thành gọi `SupplierDomainService` mới (`supplier-debt.service.ts:68`) |
| `rbac` (permission-catalog.ts) | Nông | Thêm `activate`/`deactivate` vào `crud('supplier', ...)` |
| `purchase-order`/`purchase-return`/`purchase-report` | Không | Grep xác nhận không có file nào gọi Supplier Service/Repository — chỉ quan hệ FK schema-level |

Không phát hiện circular dependency. Hướng phụ thuộc `supplier-debt` → `supplier` một chiều, đang cài sai cách (raw repository), không tạo vòng lặp.

## E. MIGRATION RISK

- Thêm `version` (default 1): an toàn, đúng mẫu 4 module trước.
- Đổi status model (`CommonStatus` → `SupplierStatus` riêng 3 giá trị, đồng bộ `deletedAt`): an toàn dữ liệu (backfill từ `deletedAt` hiện có), đúng mẫu Customer Migration B.
- Không phát hiện rủi ro mất dữ liệu nào bắt buộc — mọi thay đổi đều additive hoặc backfill an toàn, miễn là câu hỏi A1/A3/C1 được trả lời trước khi viết SPEC.

---

**Dừng lại — chờ Architect Resolution.** Không tự quyết định A1-A3/C1-C2. Không viết SPEC, không sửa source code, không migration, không commit.
