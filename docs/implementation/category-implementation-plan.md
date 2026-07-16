# Category Implementation Plan (T006, dựa trên SPEC-CATEGORY-001)

**Trạng thái:** Chờ Architecture Review. **Không code, không migration, không commit** ở bước này — chỉ kế hoạch.
**Nguồn:** `SPEC-CATEGORY-001` (APPROVED WITH MINOR ADJUSTMENTS, Decision S01-S08).

---

## 1. Danh sách file

### 1.1 Module `category` — sửa (12 file)

| File | Thay đổi |
|---|---|
| `domain/entities/category.entity.ts` | Thêm `status: CategoryStatus`, `version: number` |
| `domain/repositories/category.repository.interface.ts` | Thêm `CategoryStatus` type, `UpdateCategoryInput.status?`, đổi `update()` nhận `expectedVersion` |
| `infrastructure/persistence/prisma-category.repository.ts` | `update()` dùng `updateMany` compare-and-swap (đúng mẫu `PrismaProductRepository`), `softDelete()` set thêm `status='ARCHIVED'`, `restore()` set thêm `status='INACTIVE'`, cả 2 tăng `version` |
| `infrastructure/persistence/prisma-category.repository.spec.ts` | Cập nhật mock cho `updateMany`/`findUniqueOrThrow`, thêm test Optimistic Lock conflict |
| `application/category.service.ts` | Thêm `assertCanArchive()` (đệ quy descendant), `assertCanRestore()` (đệ quy ancestor), Optimistic Lock wiring, event hook no-op x4, đổi `search()`/thêm xử lý `CategoryQueryDto` |
| `application/category.service.spec.ts` | Cập nhật + thêm test case theo SPEC §11.1 |
| `application/mappers/category.mapper.ts` | Map thêm `status`, `version` |
| `application/dto/create-category.dto.ts` | Thêm `status?` |
| `application/dto/create-category.dto.spec.ts` | Thêm test validate `status` |
| `application/dto/update-category.dto.ts` | Thêm `status?`, `version` (bắt buộc) |
| `presentation/category.controller.ts` | `GET /categories` nhận `CategoryQueryDto`, Swagger update cho 4 route còn lại (đúng mẫu Commit 5 của T005) |
| `presentation/category.controller.spec.ts` | Cập nhật cho DTO mới |

### 1.2 Module `category` — file mới (4 file)

| File | Nội dung |
|---|---|
| `domain/errors/category.errors.ts` | `CategoryConcurrencyConflictError` (đúng mẫu `product.errors.ts`) |
| `application/dto/category-query.dto.ts` | `search`/`status`/`parentId`/`isActive`/`page`/`limit`/`sortBy`/`sortOrder` (SPEC §9, §4.1 — chờ xác nhận tên tham số) |
| `application/dto/category-query.dto.spec.ts` | Test validate DTO mới |
| `application/category.service.archive-tree.spec.ts` **(cân nhắc — có thể gộp vào `category.service.spec.ts`)** | Test riêng cho thuật toán đệ quy Archive/Restore nếu số lượng case đủ lớn để tách file, quyết định lúc code thật dựa trên độ dài |

### 1.3 Migration (3 migration độc lập, Decision S04 — 6 file)

| Migration | File |
|---|---|
| A — `version` | `migration.sql` + `rollback.sql` |
| B — `slug` unique constraint | `migration.sql` + `rollback.sql` |
| C — `CategoryStatus` | `migration.sql` + `rollback.sql` |

Tên thư mục theo timestamp tại thời điểm code thật (không đặt trước ở bước Plan này).

### 1.4 Module `product` — sửa tối thiểu (3 file, Decision Q8/S03)

| File | Thay đổi |
|---|---|
| `application/product.service.ts` | `assertValidVariantRelationship()` thêm tham số `categoryId: string`, thêm điều kiện `categoryId !== parent.categoryId` → `PRODUCT_014`. Cả 2 lời gọi (`create()` dòng ~54, `update()` dòng ~162) truyền thêm `categoryId`/`effectiveCategoryId` |
| `application/product.service.spec.ts` | Thêm test: Variant Child khác `categoryId` với Variant Parent → lỗi |
| `common/errors/error-codes.ts` | Thêm `PRODUCT_VARIANT_CATEGORY_MISMATCH: 'PRODUCT_014'` |

**Không đổi** `product.repository.interface.ts`, `prisma-product.repository.ts`, DTO, Controller, migration, Aggregate — đúng giới hạn Decision S03 ("Không thêm business rule khác. Không thay đổi Product API. Không thay đổi Product Aggregate. Không thêm Product Migration").

### 1.5 Tổng: 12 sửa + 4 mới (category) + 6 (migration) + 3 sửa (product) = **25 file**

## 2. Chi tiết kỹ thuật đáng chú ý

### 2.1 `assertValidVariantRelationship()` — chữ ký mới

```ts
private async assertValidVariantRelationship(
  type: ProductType,
  parentProductId: string | null,
  categoryId: string,        // MỚI — Decision Q8/S03
  organizationId: string,
): Promise<void> {
  if (type === 'VARIANT_CHILD') {
    // ... (giữ nguyên 2 check hiện có: parentProductId bắt buộc, parent phải type=VARIANT_PARENT)
    if (parent.categoryId !== categoryId) {           // MỚI
      throw new UnprocessableEntityException(
        withCode(ErrorCode.PRODUCT_VARIANT_CATEGORY_MISMATCH,
          'Variant Child phải cùng danh mục với Variant Parent'),
      );
    }
    return;
  }
  // ... (giữ nguyên nhánh còn lại)
}
```

`create()` gọi với `dto.categoryId`; `update()` gọi với `dto.categoryId ?? existing.categoryId` (đúng cách `effectiveType`/`effectiveParentProductId` đã tính trước đó trong cùng hàm).

### 2.2 Thuật toán Archive đệ quy (Decision Q6/S05)

```ts
private async assertCanArchive(categoryId: string, organizationId: string): Promise<void> {
  const all = await this.categoryRepository.listAll(organizationId); // đã có, tái dùng
  const childrenByParent = new Map<string, CategoryEntity[]>();
  for (const c of all) {
    if (!c.parentId) continue;
    childrenByParent.set(c.parentId, [...(childrenByParent.get(c.parentId) ?? []), c]);
  }
  const stack = [...(childrenByParent.get(categoryId) ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.status === 'ACTIVE') throw new UnprocessableEntityException(/* CATEGORY_HAS_ACTIVE_DESCENDANT */);
    stack.push(...(childrenByParent.get(node.id) ?? []));
  }
}
```

Độ phức tạp O(n) trên số category trong `organizationId` (1 lần `listAll()`, không N+1 query) — phù hợp Decision S06 (Adjacency List đủ dùng, không cần Closure Table/Nested Set).

### 2.3 Thuật toán Restore theo chain tổ tiên (Decision Q7)

```ts
private async assertCanRestore(category: CategoryEntity, organizationId: string): Promise<void> {
  const all = await this.categoryRepository.listAll(organizationId); // bao gồm cả ARCHIVED? — xem lưu ý dưới
  const byId = new Map(all.map((c) => [c.id, c]));
  let current = category.parentId ? byId.get(category.parentId) : undefined;
  while (current) {
    if (current.status === 'ARCHIVED') throw new UnprocessableEntityException(/* CATEGORY_ANCESTOR_ARCHIVED */);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
}
```

**Lưu ý kỹ thuật cần xác nhận lúc code thật**: `listAll()` hiện tại lọc `deletedAt: null` (không trả về category đã Archive/soft-delete) — nhưng để kiểm tra "tổ tiên đang ARCHIVED", chính category tổ tiên đó CẦN được đọc dù đã `deletedAt != null`. Cần dùng 1 biến thể đọc KHÔNG lọc `deletedAt` cho riêng bước này (có thể tái dùng `findByIdIncludingDeleted()` theo từng bước đi ngược cây thay vì tải toàn bộ qua `listAll()`, hoặc thêm tham số `includeDeleted` cho `listAll()`). Sẽ quyết định cách cụ thể lúc viết Repository thật, không ảnh hưởng SPEC.

### 2.4 Error code mới cần thêm vào `error-codes.ts` (module `category`)

`CATEGORY_HAS_ACTIVE_DESCENDANT` (`CATEGORY_007`), `CATEGORY_ANCESTOR_ARCHIVED` (`CATEGORY_008`), `CATEGORY_VERSION_CONFLICT` (`CATEGORY_009`) — nối tiếp `CATEGORY_001`..`006` hiện có (`error-codes.ts:62-68`, cao nhất hiện tại là `CATEGORY_PARENT_NOT_FOUND: 'CATEGORY_006'`).

## 3. Migration Plan (tóm tắt — chi tiết ở SPEC §3)

3 migration độc lập, thứ tự A→B→C (Decision S04):
- **A** (`version`): `ADD COLUMN`, rủi ro thấp nhất, không cần duplicate-check.
- **B** (`slug` unique): có bước duplicate-check bắt buộc chạy trước (FAIL nếu trùng, không tự merge).
- **C** (`CategoryStatus`): `CREATE TYPE` + `ADD COLUMN` + `UPDATE` backfill theo `deletedAt`.

Không có `DROP`/rename nào — cả 3 đều thuần bổ sung, an toàn rollback độc lập từng migration.

## 4. Risk Matrix

| # | Rủi ro | Mức độ | Ghi chú |
|---|---|---|---|
| R1 | Migration B (slug unique) fail do dữ liệu trùng sẵn có | Thấp | Slug generator đã check trước khi ghi từ trước — chỉ có khoảng hở race condition, không phải lỗi phổ biến |
| R2 | Thuật toán Restore (§2.3) đọc nhầm category đã xóa mềm do `listAll()` lọc `deletedAt` | Trung bình | Đã ghi nhận rõ ở §2.3 — cần xử lý đúng lúc code, không phải rủi ro ẩn |
| R3 | Tên tham số `GET /categories` sai lệch với ý Architect (`limit`/`sortBy` vs `pageSize`/`sort`) | Trung bình | Đã hỏi lại ở SPEC §4.1, cần xác nhận trước khi code Controller |
| R4 | Sửa `product.service.ts` (đã đóng ở T005/tag `v0.2.0-product-foundation`) có thể ảnh hưởng test hiện có của `product` | Thấp | Chỉ thêm 1 điều kiện mới vào hàm đã có, không đổi 2 điều kiện cũ — 92 test hiện có của `product` dự kiến không vỡ, chỉ thêm test mới |
| R5 | Optimistic Lock cho Category dùng `updateMany` như Product — cần đảm bảo `assertCanArchive`/`assertCanRestore` không tạo race condition riêng (đọc `listAll()` rồi mới `update()`, có thể lệch giữa 2 bước) | Thấp | Cùng dạng rủi ro đã chấp nhận ở Product (đọc-rồi-ghi không bọc transaction) — không phải rủi ro mới phát sinh riêng cho Category |

## 5. Test Matrix (ước tính)

| Nhóm | Số test case ước tính |
|---|---|
| `category.entity`/`category.mapper` | +2 (map field mới) |
| `category.repository.interface`/`prisma-category.repository.spec.ts` | +6 (Optimistic Lock success/conflict, status backfill implicit qua field mapping) |
| `category.service.spec.ts` | +10 (Archive đệ quy PASS/FAIL nhiều cấp, Restore chain PASS/FAIL, Optimistic Lock, slug conflict, circular 3 cấp) |
| `category-query.dto.spec.ts` (mới) | +6 (validate từng filter) |
| `category.controller.spec.ts` | +2 (route mới nhận query params) |
| `product.service.spec.ts` | +2 (Variant-Category mismatch, Variant-Category match) |
| **Tổng ước tính** | **~28 test case mới**, cộng dồn vào baseline hiện có (category: 50 test/91.11% coverage — Dependency Audit §8; product: 1263 test toàn backend) |

## 6. Ước tính tác động

- **Không có module phụ thuộc nào cần refactor** (khác T005) — Dependency Audit xác nhận 0 consumer runtime của `CATEGORY_REPOSITORY`.
- **Đúng 1 module khác bị chạm**: `product` (3 file, phạm vi tối thiểu — Decision S03).
- **Không đổi Permission, không đổi Aggregate của module khác, không đổi route của module khác.**
- **Benchmark hiệu năng (Decision S06)** cần môi trường Docker thật — không thể đo trong sandbox hiện tại, sẽ ghi PENDING giống Integration Test.

## 7. Implementation Order (nhắc lại từ SPEC §13)

```
Migration A (version) → Migration B (slug unique) → Migration C (status)
  ↓
Repository (category.errors.ts, ICategoryRepository, PrismaCategoryRepository)
  ↓
Application (CategoryService: Archive đệ quy, Restore chain, Optimistic Lock, Event hook no-op)
  ↓
Controller + DTO (CategoryQueryDto mới)
  ↓
product module (assertValidVariantRelationship + categoryId, Decision Q8/S03)
  ↓
Test (bao gồm circular 3 cấp — Decision S05)
  ↓
Benchmark hiệu năng >1000 category (Decision S06, PENDING nếu không có Docker)
  ↓
Architecture Review
```

## 8. Câu hỏi còn mở trước khi code thật

1. **Tên tham số `GET /categories`** (§4.1 SPEC, R3 ở trên) — `limit`/`sortBy`/`sortOrder` (theo chuẩn `Product`/`Brand`/`Unit`) hay đúng literal `pageSize`/`sort` như Decision S02 liệt kê?

Không có câu hỏi mở nào khác chặn việc bắt đầu code — chờ Architecture Review lần cuối cho Implementation Plan này.
