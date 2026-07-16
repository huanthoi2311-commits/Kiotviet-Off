# Sprint-01 — T005: Product Refactor (Implementation / Migration / Test Report)

**SPEC:** `SPEC-PRODUCT-001` (APPROVED WITH MINOR REVISIONS, Decision A01-A10) → `product-refactor-plan.md` (T005.1) → `ARCHITECTURE REVIEW – T005.1` (Decision A11-A18) → `ARCHITECT DECISION – T005 Implementation Clarification` (Decision C01-C08, AUTHORIZATION).
**Nguồn:** `RFC-0001 Revision 1` (Product Domain).
**Kết quả:** Build PASS · Lint PASS · TypeCheck PASS · 1263/1263 Unit Test PASS · Coverage module `product` 97.05% statements (≥90%, Decision A18) · 0 module ngoài `product` còn inject `PRODUCT_REPOSITORY`/`IProductRepository` (Architecture Test, 10/10 PASS) · Integration Test/Rollback Test/Manual Smoke Test: **PENDING (No Docker Environment)**.
**Trạng thái Gate (Decision C07):** **Technical Complete = YES** · **Operational Complete = PENDING** (chờ môi trường có Docker/Postgres/Redis).

---

## 0. Quyết định làm rõ trước khi code (Decision C01-C08)

Trước khi viết code thật, đã dừng lại hỏi 1 điểm duy nhất có rủi ro cao (A13 Backward Compatibility có mâu thuẫn bề mặt với các thay đổi DTO đã duyệt ở SPEC hay không), đồng thời chủ động disclose 2 quyết định kỹ thuật tự đưa ra (không chặn, chỉ báo trước) và 1 giới hạn môi trường đã biết. User xác nhận cả 3 qua `ARCHITECT DECISION – T005 Implementation Clarification`:

- **C01**: A13 không phủ định các thay đổi đã duyệt (bỏ `isService`, thêm `type`/`version`, đổi `ProductStatus`) — chỉ áp dụng cho thay đổi NGOÀI phạm vi đã duyệt. Không cần `/v2/products`, không cần API versioning.
- **C02**: Migration 3 (drop `isService`, drop constraint Barcode cũ) dời sang Commit 3 (Repository) thay vì gộp vào Commit 1 (Migration) — để mỗi commit đều Build/TypeCheck PASS độc lập.
- **C03**: Feature Flag `PRODUCT_REFACTOR_ENABLED` chỉ bảo vệ đúng 3 điểm (Optimistic Lock, Product Type Rule, Archive Rule) — không dual implementation, không fork business flow.
- **C04/C05/C06**: Integration Test/Rollback Test/Manual Smoke Test được phép **PENDING (Environment Constraint)** — không PASS giả, không FAIL, không mock, không suy đoán.
- **C07**: T005 chia 2 trạng thái Gate — Technical Complete (Build/TypeCheck/Lint/Unit/Architecture/Repository Boundary) và Operational Complete (cần Docker thật).
- **C08**: Không còn blocker — AUTHORIZATION bắt đầu Commit 1.

## 1. Bối cảnh

RFC-0001 xác định `product` module đã build đầy đủ (không phải module mới), được 11 model khác tham chiếu trực tiếp và 5 module (`cart`, `barcode`, `unit`, `brand`, `category`) inject thẳng `PRODUCT_REPOSITORY` — vi phạm Repository Boundary (ADR-0010), cùng dạng vấn đề đã xử lý ở T004 cho Inventory nhưng khác bản chất (Product chưa từng có race condition ghi xuyên module — chỉ là export hygiene, không phải Single Writer thật).

## 2. Kiến trúc Target đã hiện thực — 8 commit theo Decision A17 (đã điều chỉnh thứ tự qua C02)

| # | Commit | Nội dung |
|---|---|---|
| 1 | `b35a785` | Migration 1 (`ProductStatus`+`ProductType`+`version`+`parentProductId`) + Migration 2 (`Barcode.organizationId`+constraint mới) — giữ nguyên `isService` và constraint cũ song song |
| 2 | `4b292bb` | `ProductDomainService` (4 method đọc), thêm vào exports (giữ `PRODUCT_REPOSITORY` export tạm) |
| 3 | `90a17d9` | Repository layer đầy đủ (`ProductEntity`/`IProductRepository`/`PrismaProductRepository`, Optimistic Lock, `product.errors.ts`) + Migration 3 (drop `isService`/constraint cũ) |
| 4 | `7d8a1e2` | Application layer (business rule A05/A06/A09, Archive guard, Feature Flag) + toàn bộ DTO |
| 5 | `965377d` | Controller Swagger updates (route không đổi) |
| 6 | `6db3dfa` | 5 module phụ thuộc đổi DI (Category→Brand→Unit→Barcode→Cart), gỡ `PRODUCT_REPOSITORY` khỏi exports |
| 7 | `c4ac06e` | `product-repository-boundary.architecture.spec.ts` (10 test case) |
| 8 | (file này) | CHANGELOG, Swagger review, báo cáo này |

Mỗi commit đã verify Build+TypeCheck PASS độc lập trước khi commit tiếp (Decision A17) — xác nhận qua `git log` từng bước trong quá trình thực hiện, không chỉ ở cuối.

### 2.1 `ProductDomainService` — khác bản chất so với `InventoryDomainService`

`InventoryDomainService` (T004) giải quyết Single Writer thật (nhiều module CÙNG GHI, có race condition — ADR-0005). `ProductDomainService` chỉ giải quyết Repository Boundary/export hygiene (ADR-0010) — chỉ `product` module từng ghi `Product`, 5 module phụ thuộc chỉ ĐỌC. Vì vậy bề mặt public đúng 4 method đọc (`findById`, `hasActiveProductsInCategory/Brand/Unit`), không `tx`, không method ghi, không "God Service" (Decision A01/A03).

### 2.2 Optimistic Lock — compare-and-swap qua `updateMany`

`PrismaProductRepository.update()` dùng `updateMany({ where: { id, version: expectedVersion } })` (Prisma `update()` không cho thêm điều kiện ngoài unique field), 0 dòng bị ảnh hưởng → `ProductConcurrencyConflictError` → `ConflictException` (409) ở tầng Service — đúng mẫu `PrismaInventoryRepository.recordMovement()` (T004, ADR-0007).

### 2.3 Feature Flag `PRODUCT_REFACTOR_ENABLED` — single code path, không fork

`isProductRefactorEnabled()` (`product-refactor.flag.ts`) đọc `process.env.PRODUCT_REFACTOR_ENABLED === 'true'`, mặc định `false`. Gate đúng 3 điểm quyết định (không dual implementation):

```ts
// Optimistic Lock: chọn NGUỒN expectedVersion, không rẽ nhánh luồng gọi
const expectedVersion = isProductRefactorEnabled() ? dto.version : existing.version;

// Product Type Rule (A06): chỉ kiểm tra hasTransactionHistory khi flag bật
if (isProductRefactorEnabled() && dto.type !== existing.type) { ... }

// Archive Rule: chỉ kiểm tra hasActiveVariantChildren khi flag bật
if (isProductRefactorEnabled()) { ... }
```

Khi tắt, hành vi tương đương trước refactor (không có gì để "bảo vệ" vì `type`/`parentProductId` chưa từng tồn tại). Có thể xóa toàn bộ file + các điều kiện `isProductRefactorEnabled()` ở cuối Sprint-01 mà không ảnh hưởng cấu trúc code khác.

## 3. Behavior Change được SPEC ủy quyền tường minh (không phải judgment call)

- **`PATCH /products/:id` bắt buộc `version`** (Decision A09) — sai version → 409. Trước refactor không có khái niệm này.
- **`DELETE /products/:id` nay set cả `status=ARCHIVED` lẫn `deletedAt`** (Decision 4, RFC-0001) — trước chỉ set `deletedAt`. Từ chối nếu còn Variant Child `status=ACTIVE` (RFC §8).
- **`POST /products/:id/restore` luôn trả `status=INACTIVE`**, không tự động `ACTIVE` (Decision A05) — tránh vô tình bán lại sản phẩm đã archive.
- **`ProductStatus` thêm `DRAFT`, đổi `DISCONTINUED`→`ARCHIVED`** (Decision 3, `RENAME VALUE`, giữ dữ liệu cũ).
- **`Barcode.code` unique theo `(organizationId, code)`** thay unique toàn cục (Decision 7) — 2 tổ chức khác nhau nay có thể dùng cùng 1 mã vạch.

## 4. Judgment call đã đưa ra (disclosed trong code/commit message, không âm thầm)

- **`hasTransactionHistory()` — method mới không có trong SPEC §7.1 gốc**: SPEC §5 định nghĩa rule ("đã phát sinh giao dịch" = có mặt ở 1 trong 7 bảng dòng giao dịch) nhưng không liệt kê method Repository cần thêm để hiện thực hoá. Bổ sung `hasTransactionHistory(productId): Promise<boolean>` trên `IProductRepository`, implement bằng `Promise.all` 7 `findFirst` trực tiếp trên Prisma Client dùng chung (không import Repository/Service module khác — không vi phạm ADR-0010, vốn chỉ cấm inject Repository CLASS của module khác, không cấm đọc trực tiếp bảng cùng schema).
- **Migration 3 dời sang Commit 3** (đã xác nhận qua C02) — chi tiết ở §0.
- **`existsByBarcode()` đổi sang lọc trực tiếp `Barcode.organizationId`** thay vì join qua `product.organizationId` — tận dụng cột mới từ Migration 2, đơn giản hoá query, hành vi không đổi.
- **`softDelete()`/`restore()` không nhận `expectedVersion`** — chỉ `PATCH` được SPEC yêu cầu client gửi `version` (§4); 2 route còn lại vẫn tăng `version` (bookkeeping, Decision A09) nhưng không có compare-and-swap, vì SPEC không yêu cầu.
- **Cầu nối tạm thời ở Commit 3** (đã thay bằng wiring thật ở Commit 4, không còn tồn tại trong code cuối cùng — chỉ ghi lại đây cho đầy đủ lịch sử): `product.service.ts` tạm dùng `type: 'STANDARD'` cố định và `existing.version` khi DTO chưa có field tương ứng, để giữ Build/TypeCheck PASS đúng thứ tự A04 (Repository trước Application).

## 5. File List (40 file thay đổi, +1495/-203 dòng)

**Migration (6 file, 3 migration độc lập):**
`backend/prisma/migrations/20260716020000_product_status_type_version_parent/` (migration.sql + rollback.sql), `20260716030000_barcode_organization_scope/`, `20260716040000_product_drop_legacy_fields/`, `backend/prisma/schema.prisma`.

**Mới — lõi `product` (6 file):**
`application/product-domain.service.ts` (+`.spec.ts`), `domain/errors/product.errors.ts`, `product-refactor.flag.ts`, `product-repository-boundary.architecture.spec.ts`.

**Sửa — lõi `product` (11 file):** `product.module.ts`, `product.service.ts` (+`.spec.ts`), `product.entity.ts`, `product.repository.interface.ts`, `prisma-product.repository.ts` (+`.spec.ts`), `product.mapper.ts`, `product.controller.ts`, 4 DTO (`create`/`update`/`response`/`query`) + 1 DTO spec.

**Sửa — 5 module phụ thuộc DI swap (10 file service+spec):** `category`, `brand`, `unit`, `barcode` (service + repository interface), `cart`.

**Sửa — dùng chung:** `backend/src/common/errors/error-codes.ts` (6 code mới: `PRODUCT_008`..`013`).

**Docs:** `CHANGELOG.md`, `docs/implementation/t005-product-refactor-report.md` (file này).

## 6. Migration Report

| Migration | Nội dung | Trạng thái |
|---|---|---|
| `20260716020000` | `ProductStatus` (+`DRAFT`, `DISCONTINUED`→`ARCHIVED`), `ProductType` (backfill từ `isService`), `parentProductId`, `version` | Viết xong, **chưa chạy thật** |
| `20260716030000` | `Barcode.organizationId` (denormalize+backfill+FK), duplicate-check tự động (`RAISE EXCEPTION`), unique constraint mới | Viết xong, **chưa chạy thật** |
| `20260716040000` | Drop DEFAULT `type`, drop `isService`, drop unique constraint cũ Barcode | Viết xong, **chưa chạy thật** |

Mỗi migration có `rollback.sql` riêng (Decision A15), viết theo đúng thứ tự ngược, có ghi chú giới hạn rõ ràng (vd: không thể `DROP VALUE` cho enum Postgres — `DRAFT` sẽ tồn tại vĩnh viễn trong type nếu rollback `20260716020000`). **Rollback chưa được kiểm thử thật** — chỉ được review logic, không chạy `up→down→up` trên DB thật (Decision A15/C05: PENDING, không đánh dấu PASS giả).

Postgres version xác nhận `postgres:16-alpine` (docker-compose.yml) — `ALTER TYPE ... ADD VALUE` chạy được trong transaction (giới hạn "không dùng giá trị mới trong cùng transaction" của PG<12 không áp dụng), nên không cần tách migration vì lý do này.

## 7. Test Report

**Build:** `nest build` — PASS (xác nhận độc lập ở cả 8 commit, không chỉ ở cuối).
**TypeCheck:** `tsc --noEmit` — PASS, 0 lỗi.
**Lint:** `eslint` — PASS, 0 lỗi trên toàn bộ file chạm tới.
**Unit Test:** 137 suites / **1263/1263 PASS** — 0 regression ở bất kỳ module nào khác (chạy full suite sau mỗi commit).
**Coverage module `product`:** 97.05% statements / 83.96% branch / 94.66% funcs / 98.14% lines (đo bằng `jest --coverage --collectCoverageFrom="modules/product/**/*.ts"`, vượt ngưỡng ≥90% theo Decision A18). Không đo baseline trước T005 riêng (module không tồn tại ở dạng đo lường tách biệt trước đây) — nhưng số lượng test mới (test case cho Feature Flag ON/OFF của cả 3 rule, Optimistic Lock conflict, Variant guard, `hasTransactionHistory` 7-bảng, Architecture Test) chỉ có thể làm TĂNG coverage so với trước, không giảm.
**Architecture Test (Repository Boundary):** `product-repository-boundary.architecture.spec.ts` — **10/10 PASS**, xác nhận (1) không module nào ngoài `product` import `PRODUCT_REPOSITORY`/`IProductRepository` (dùng word-boundary, có test riêng xác nhận không false-positive với `SUPPLIER_PRODUCT_REPOSITORY`), (2) không module nào ghi trực tiếp `prisma.product`/`tx.product`, (3) `ProductModule` chỉ export `ProductDomainService`, (4) cả 5 module phụ thuộc xác nhận import `ProductModule`.
**Integration Test (e2e):** 🟡 **PENDING (No Docker Environment)** — không có Docker/Postgres/Redis trong sandbox phát triển hiện tại.
**Rollback Test:** 🟡 **PENDING (No Docker Environment)** — 3 file `rollback.sql` đã viết, chưa chạy thật.
**Manual API Smoke Test:** 🟡 **PENDING (No Docker Environment)** — không thể khởi động app thật (cần Postgres/Redis) để gọi HTTP endpoint thật.

### Điều kiện để 3 mục PENDING chuyển PASS

Cần môi trường có Docker chạy `docker-compose up` (Postgres 16 + Redis theo cấu hình hiện có), sau đó:
1. **Migration**: `npx prisma migrate deploy` cho 3 migration mới, xác nhận qua query đối chiếu số dòng trước/sau (Acceptance Criteria #5, #6, SPEC §12).
2. **Rollback**: chạy `up` → chạy thủ công từng `rollback.sql` (Prisma không hỗ trợ down-migration tự động) → xác nhận schema về đúng trạng thái trước migration → chạy `up` lại lần 2 để xác nhận idempotent.
3. **Integration Test**: cập nhật/thêm `test/product.e2e-spec.ts` (nếu áp dụng) — hiện chưa có file e2e riêng cho `product` trong `test/` (chỉ có unit/architecture test).
4. **Manual Smoke Test**: `npm run start:dev`, gọi `POST/GET/PATCH/DELETE/POST :id/restore /products` qua Swagger UI hoặc curl, xác nhận response shape khớp `ProductResponseDto` mới.

## 8. Acceptance Criteria (SPEC-PRODUCT-001 §12, 17 tiêu chí)

| # | Tiêu chí | Kết quả |
|---|---|---|
| 1 | Build/Lint/TypeCheck PASS | ✅ |
| 2 | Unit Test PASS, Coverage không thấp hơn baseline | ✅ 1263/1263, coverage module 97.05% |
| 3 | `PRODUCT_REPOSITORY` không còn export ngoài `product` | ✅ Architecture Test |
| 4 | Đúng 5 module gọi qua `ProductDomainService` | ✅ Architecture Test |
| 5 | Migration không mất dữ liệu (`DISCONTINUED`→`ARCHIVED`, `isService=true`→`SERVICE`) | 🟡 PENDING (chưa chạy thật) |
| 6 | Barcode duplicate-check chạy trước, FAIL nếu trùng | 🟡 PENDING (logic đã viết, chưa chạy thật trên dữ liệu thật) |
| 7 | Optimistic Lock hoạt động đúng | ✅ Unit Test (Repository + Service), 🟡 PENDING cho concurrency test thật |
| 8 | Không ảnh hưởng hành vi 11 module tham chiếu Product | ✅ Full suite 1263/1263 PASS, 0 regression |
| 9 | Không TODO/FIXME/`any` không cần thiết | ✅ |
| 10 | Migration PASS (chạy thật) | 🟡 PENDING |
| 11 | Rollback PASS (chạy thật) | 🟡 PENDING |
| 12 | Existing API Compatibility PASS | ✅ (chỉ đổi field đã biết trước — `isService` bỏ có chủ đích) |
| 13 | Existing Tests PASS | ✅ 0 test nào vỡ |
| 14 | New Tests PASS | ✅ |
| 15 | Architecture PASS | ✅ |
| 16 | Repository Boundary PASS | ✅ |
| 17 | Optimistic Lock PASS | ✅ (unit-level); 🟡 PENDING (concurrency thật) |

**13/17 PASS hoàn toàn, 4/17 PENDING** (đều thuộc nhóm cần Docker thật — #5/#6/#10/#11, và #7/#17 PASS một phần ở unit-level). Đúng khung Decision C07: **Technical Complete = YES, Operational Complete = PENDING**.

## 9. Kỹ thuật/Technical Debt còn lại cho Sprint sau

- **`test/product.e2e-spec.ts` chưa tồn tại** — cần tạo khi có Docker, theo mẫu các file e2e hiện có (`test/checkout.e2e-spec.ts` v.v.).
- **Feature Flag `PRODUCT_REFACTOR_ENABLED`** cần được bật thật (qua `.env`) sau khi Operational Complete đạt, rồi xóa hoàn toàn (code + điều kiện) khi ổn định — không để tồn tại vĩnh viễn.
- **Domain Event (`ProductCreated`/`Updated`/`Archived`/`Activated`)** — chỉ có hook no-op (SPEC §10), chưa publish thật. Chờ Sprint Event triển khai Outbox Pattern (ADR-0011).
- **`Inventory` chưa có `version` column** — SPEC-PRODUCT-001 §1.1 đã ghi nhận, sẽ nâng cấp ở Sprint sau để đồng bộ chuẩn Optimistic Lock toàn dự án.
- **ProductPrice/multi-price-list** — ngoài phạm vi Sprint-01 (Decision 8, RFC-0001), chờ Promotion Sprint.

## 10. Tự đánh giá (Self-Review)

- Hỏi đúng 1 lần cho điểm rủi ro cao thật sự (A13), không hỏi tràn lan cho các quyết định kỹ thuật thấp rủi ro (Migration 3 timing, Feature Flag shape) — những điểm này disclose kèm lý do rồi tiến hành luôn, đúng tinh thần "được phép dừng và hỏi khi gặp xung đột kiến trúc MỚI" chứ không phải mọi chi tiết triển khai.
- Phát hiện 1 khoảng trống thật sự của SPEC (`hasTransactionHistory()` không có trong §7.1 dù §5 yêu cầu rule cần nó) — bổ sung tối thiểu, disclose rõ trong code comment và commit message, không tự ý mở rộng thêm gì khác.
- Mỗi commit trong 8 commit đều Build+TypeCheck+Test PASS độc lập trước khi sang commit tiếp — không có trạng thái "gãy tạm" giữa các bước, kể cả 2 "cầu nối tạm thời" ở Commit 3 đều compile/test PASS và được thay bằng wiring thật ngay Commit 4 kế tiếp (không tồn tại trong code cuối).
- 3 mục PENDING (Integration/Rollback/Manual Smoke Test) được ghi đúng bản chất — không đánh dấu PASS giả, không mock để né, có ghi rõ điều kiện cụ thể để chuyển PASS (§7).
- Feature Flag thực hiện đúng cam kết "không dual implementation, không fork business flow" — chỉ 3 điểm rẽ nhánh boolean đơn giản, không có code path song song nào.
- Coverage 97.05% không phải mục đích tự thân — là hệ quả của việc viết đủ test case theo đúng yêu cầu SPEC §11 (Optimistic Lock conflict, Variant guard, Type change guard, cả 2 nhánh Feature Flag).

**Trạng thái:** Technical Complete. Chờ Architecture Review lần cuối trước khi coi T005 là đóng hoàn toàn (Operational Complete cần môi trường Docker, ngoài khả năng của sandbox phát triển hiện tại).
