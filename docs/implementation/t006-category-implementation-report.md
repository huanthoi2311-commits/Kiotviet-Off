# Sprint-01 — T006: Category Implementation (Implementation / Migration / Test Report)

**SPEC:** `SPEC-CATEGORY-001` (APPROVED WITH MINOR ADJUSTMENTS, Decision S01-S08) → `Category Implementation Plan` (APPROVED, Decision IP01-IP07).
**Nguồn:** `RFC-0002 — Category Domain` → `docs/architecture/category-dependency-audit.md` → `ARCHITECTURE REVIEW – RFC-0002` (Decision Q1-Q12).
**Kết quả:** Build PASS · Lint PASS · TypeCheck PASS · 1292/1292 Unit Test PASS · Coverage module `category` 91.43% statements (≥90%) · 0 module ngoài `category` inject `CATEGORY_REPOSITORY` (không đổi so với trước, xác nhận qua Dependency Audit — không có Architecture Test riêng, xem §9) · Integration Test/Rollback Test/Manual Smoke Test/Query Performance Benchmark: **PENDING (No Docker Environment)**.
**Trạng thái Gate (đúng khung Decision T005-R01/C07):** **Technical Complete = YES · Operational Complete = PENDING**.

---

## 0. Quy trình đã theo (Audit → RFC → SPEC → Plan → Code)

Đây là lần đầu tiên dự án chạy trọn vẹn quy trình `Audit → RFC → Architecture Review → SPEC → Implementation Plan → Code → Review → Release` (Decision G05/G06) cho 1 domain, sau khi 1 chỉ đạo trước đó yêu cầu Claude Code tự viết RFC bị chính Architect hủy bỏ (`ARCHITECT DECISION – Governance Clarification`, Decision G01-G06) vì mâu thuẫn với `PROJECT_RULES.md` §2. Trình tự thực tế:

1. Dependency Audit (`docs/architecture/category-dependency-audit.md`) — thuần khảo sát, không đề xuất.
2. `RFC-0002` do Architect ban hành.
3. Architecture Review của RFC-0002 (Claude Code) — 9 câu hỏi mở (Q1-Q9).
4. `ARCHITECT DECISION – RFC-0002 Architecture Review Resolution` (Q1-Q12) — ủy quyền viết SPEC theo đúng carve-out Decision G02.
5. `SPEC-CATEGORY-001` (Claude Code viết).
6. Architecture Review của SPEC (Decision S01-S08) — điều chỉnh chiến lược Migration (1→3), bổ sung 2 Acceptance Criteria.
7. `Category Implementation Plan` (Claude Code viết).
8. Architecture Review của Plan (Decision IP01-IP07) — chốt tên tham số Query, chiến lược Restore Repository method riêng, yêu cầu defensive cycle-check, 10 nhóm test bắt buộc.
9. AUTHORIZATION — 12 bước Implementation theo đúng thứ tự, không gộp.

## 1. Kiến trúc Target đã hiện thực — 9 commit theo đúng 12 bước AUTHORIZATION

| # | Bước AUTHORIZATION | Commit | Nội dung |
|---|---|---|---|
| — | (chuẩn bị) | `27348f4` | Dependency Audit + SPEC-CATEGORY-001 + Implementation Plan (docs, chưa code) |
| 1-2 | Migration A + Review Build | `1d7821d` | `version` (Optimistic Lock) |
| 3-4 | Migration B + Review Build | `b06a3ce` | `@@unique([organizationId, slug])`, duplicate-check tự động |
| 5 | Migration C | `489ed77` | `CategoryStatus` enum + backfill |
| 6 | Domain | `a27e2ed` | `CategoryEntity` + `category.errors.ts` |
| 7 | Repository | `de08921` | Optimistic Lock, `findAncestorChainIncludingArchived()` |
| 8 | Application | `c1d69de` | Archive/Restore đệ quy có defensive cycle-check |
| 9 | Controller | `3133394` | `CategoryQueryDto`, `search()`, Swagger |
| 10 | Product Adjustment | `e8bfaeb` | `assertValidVariantRelationship()` + `PRODUCT_014` |
| 11 | Tests | `e8f39f9` | 10 nhóm test theo Decision IP07 |
| 12 | Documentation | (commit này) | CHANGELOG + báo cáo này |

Mỗi bước 1-10 đã xác nhận Build+TypeCheck+Lint PASS độc lập trước khi sang bước tiếp theo (AUTHORIZATION — "Không được gộp các bước").

### 1.1 Sự cố quy trình tự phát hiện và tự sửa

Khi bắt đầu commit Bước 1, vô tình gộp nhầm 3 file docs (Audit/SPEC/Plan) với 2 file Migration A vào cùng 1 commit (do dùng `git add` 2 lần liên tiếp mà không kiểm tra staging area giữa chừng). Phát hiện ngay qua `git status`, sửa bằng `git reset --soft` + `git restore --staged .` (xác nhận chưa push trước khi làm, đúng `RELEASE_RULES.md` §1), tách lại đúng thành 2 commit riêng biệt (`27348f4` docs-only, `1d7821d` Migration A-only) — không mất nội dung, không phải `--hard`.

### 1.2 Không tạo `CategoryDomainService` (Decision Q5/S07/IP07)

Khác hẳn `product` (T005, phải tạo `ProductDomainService` vì có 5 module phụ thuộc thật), `category.module.ts` **giữ nguyên** `exports: [CATEGORY_REPOSITORY]` — quyết định tường minh, dứt khoát (YAGNI): hiện 0 module bên ngoài tiêu thụ Repository của `category` (xác nhận ở Dependency Audit §1/§2). Không có Architecture Test tự động nào được viết cho ranh giới này (khác `product-repository-boundary.architecture.spec.ts` của T005) — vì hiện chưa có gì để bảo vệ.

### 1.3 `findAncestorChainIncludingArchived()` — method Repository chuyên biệt (Decision IP02)

Thay vì sửa `listAll()` (vốn luôn lọc `deletedAt: null`) để phục vụ nhu cầu đọc cả category đã archive, tạo method RIÊNG chỉ phục vụ guard Restore — 1 truy vấn `findMany({ where: { organizationId } })` duy nhất (không lọc `deletedAt`, không N+1 — Decision IP06), đi ngược `parentId` trong bộ nhớ. Không expose ra API, không dùng lại cho chức năng khác.

### 1.4 Defensive Cycle-Check (Decision IP03)

Cả 2 thuật toán đệ quy (Archive descendant-check ở `CategoryService`, Restore ancestor-check ở Repository) đều có bảo vệ `visited`-set riêng, độc lập với `assertNoCircularReference()` (vốn chặn tạo vòng lặp ở THỜI ĐIỂM GHI) — nếu dữ liệu đã lưu có vòng lặp bất thường (lý thuyết, không nên xảy ra qua flow ghi bình thường), thuật toán dừng và ném `UnprocessableEntityException` (tái dùng `CATEGORY_CIRCULAR_REFERENCE`) thay vì lặp vô hạn. Có test riêng xác nhận (§7).

## 2. Behavior Change được SPEC/Decision ủy quyền tường minh

- **`DELETE /categories/:id` chặn Archive nếu còn danh mục con Ở BẤT KỲ CẤP NÀO đang ACTIVE** (Decision Q6/S05) — trước T006 hoàn toàn không có khái niệm `status`, không thể có kiểm tra này.
- **`POST /categories/:id/restore` chặn nếu bất kỳ tổ tiên nào đang ARCHIVED** (Decision Q7) — mới hoàn toàn.
- **`PATCH /categories/:id` bắt buộc `version`** (Decision Q9) — mới hoàn toàn, sai version → 409.
- **`PATCH /categories/:id` không cho set `status=ARCHIVED`/`ACTIVE` trực tiếp** (Decision S01, thiết kế do Claude Code đề xuất ở bước SPEC, được Architect xác nhận qua S01) — tránh shortcut bỏ qua 2 guard đệ quy.
- **`Category.slug` nay unique thật ở tầng DB** (Decision Q3) — trước chỉ dựa vào app-level check-trước-khi-ghi (có race condition).
- **Variant Child (Product) bắt buộc cùng `categoryId` với Variant Parent** (RFC-0002 §7, Decision Q8/S03) — rule hoàn toàn mới, chạm cả 2 module (`category` định nghĩa invariant, `product` thực thi).

## 3. Judgment call đã đưa ra (disclosed trong code/commit message)

- **Tên tham số Query** (`page`/`limit`/`search`/`sortBy`/`sortOrder`/`status`/`parentId`/`isActive`) — Decision IP01 dùng đúng các tên này, khớp với cách hiểu đã đề xuất ở bước SPEC (§4.1 SPEC-CATEGORY-001), không phải `pageSize`/`sort` như văn bản Decision S02 dùng ban đầu — đã được Architect xác nhận chính thức qua IP01, không còn là giả định.
- **`search()` method mới trên `ICategoryRepository`** — không nằm trong Implementation Plan gốc (chỉ liệt kê `findAncestorChainIncludingArchived()` là method mới), nhưng cần thiết để hiện thực `GET /categories` filter/phân trang thật (RFC-0002 §2 "Category Search") — bổ sung tại Bước 7 (Controller), disclosed rõ trong commit message.
- **Migration 3 drop `isService`-tương-đương**: không áp dụng cho Category (không có field tương tự cần dọn) — khác T005, cả 3 migration A/B/C của Category đều thuần `ADD COLUMN`/`CREATE INDEX`, không `DROP` gì.
- **Migration C (status) backfill**: category đã `deletedAt != null` → `ARCHIVED`, còn lại giữ `DEFAULT ACTIVE` — không có danh mục nào tự động thành `DRAFT` (nhất quán với cách SPEC-PRODUCT-001 xử lý `ProductStatus` ở T005).
- **Thứ tự Migration 3 drop `isService` dời sang Commit Repository** (mẫu T005 Decision C02) — **không áp dụng** cho Category vì cả 3 migration đều an toàn ngay từ đầu (không có cột nào cần code ngừng tham chiếu trước khi drop).

## 4. File List (24 file, +1178/-63 dòng)

**Migration (6 file, 3 migration độc lập):** `20260716050000_category_version/`, `20260716060000_category_slug_unique/`, `20260716070000_category_status/` (mỗi thư mục `migration.sql`+`rollback.sql`), `backend/prisma/schema.prisma`.

**Mới — `category` (2 file):** `domain/errors/category.errors.ts`, `application/dto/category-query.dto.ts`.

**Sửa — `category` (10 file):** `category.entity.ts`, `category.repository.interface.ts`, `prisma-category.repository.ts`(+`.spec.ts`), `category.service.ts`(+`.spec.ts`), `category.mapper.ts`, `category.controller.ts`(+`.spec.ts`), `create-category.dto.ts`, `update-category.dto.ts`, `category-response.dto.ts`.

**Sửa — `product` (2 file, phạm vi tối thiểu theo Decision Q8/S03/IP04):** `product.service.ts`(+`.spec.ts`).

**Sửa — dùng chung:** `backend/src/common/errors/error-codes.ts` (4 code mới: `CATEGORY_007`..`009`, `PRODUCT_014`).

**Docs:** `CHANGELOG.md`, `docs/implementation/t006-category-implementation-report.md` (file này).

## 5. Migration Report

| Migration | Nội dung | Trạng thái |
|---|---|---|
| A (`20260716050000`) | `version INTEGER NOT NULL DEFAULT 1` | Viết xong, **chưa chạy thật** |
| B (`20260716060000`) | Duplicate-check tự động (`RAISE EXCEPTION`) + `@@unique([organizationId, slug])` | Viết xong, **chưa chạy thật** |
| C (`20260716070000`) | `CategoryStatus` enum (hoàn toàn mới, không rename) + backfill theo `deletedAt` | Viết xong, **chưa chạy thật** |

Mỗi migration có `rollback.sql` độc lập (Decision IP05 — "Mỗi migration phải migrate/rollback/verify độc lập"). **Rollback chưa được kiểm thử thật** trên Postgres (Decision C05/IP05 — PENDING, không đánh dấu PASS giả). Không có migration nào `DROP` dữ liệu — an toàn tuyệt đối về mặt rollback so với T005 (vốn có `DROP COLUMN isService`/`DROP VALUE` hạn chế).

## 6. Test Report

**Build/TypeCheck/Lint:** PASS — xác nhận độc lập ở cả 10/10 bước code (không chỉ ở cuối).
**Unit Test:** 137 suites / **1292/1292 PASS** — 0 regression module khác (chạy full suite sau mỗi bước).
**Coverage module `category`:** 91.43% statements / 84.06% branch / 93.22% funcs / 94.29% lines (≥90%, đo bằng `jest --coverage --collectCoverageFrom="modules/category/**/*.ts"`). Thấp nhất: `category.module.ts` (0% — cùng nguyên nhân đã ghi nhận ở T004/T005: không có Architecture Test nào `import` tĩnh để đọc metadata, và Category cố ý không có Architecture Test vì không có gì cần bảo vệ, §1.2).
**10 nhóm test theo Decision IP07:**

| # | Nhóm | Vị trí | Kết quả |
|---|---|---|---|
| 1 | Circular Detection | `category.service.spec.ts` (existing 2-cấp + mới defensive 3-cấp a→b→c→a) | ✅ PASS |
| 2 | Archive nhiều cấp | `category.service.spec.ts` (con trực tiếp / cháu cấp 2 / toàn bộ không active) | ✅ PASS |
| 3 | Restore nhiều cấp | `category.service.spec.ts` (cha trực tiếp / ông cấp 2 / không ai archived / không tổ tiên) | ✅ PASS |
| 4 | Parent Archived | `category.service.spec.ts` (`assertParentExists` tự chặn qua `findById` lọc `deletedAt`) | ✅ PASS |
| 5 | Variant khác Category | `product.service.spec.ts` (`create()` + `update()`, cả 2 chiều mismatch/match) | ✅ PASS |
| 6 | Optimistic Lock | `category.service.spec.ts` (409 translation) + `prisma-category.repository.spec.ts` (compare-and-swap) | ✅ PASS |
| 7 | Pagination | `category.service.spec.ts` (page/limit/sortBy/sortOrder tùy chỉnh) | ✅ PASS |
| 8 | Search | `category.service.spec.ts` + `prisma-category.repository.spec.ts` | ✅ PASS |
| 9 | Multi Tenant Isolation | `category.service.spec.ts` (`list`/`findOne`) | ✅ PASS |
| 10 | Permission | `category.controller.spec.ts` (14 test hiện có, không đổi — Decision Q4) | ✅ PASS |

**Integration Test (e2e):** 🟡 PENDING (No Docker Environment).
**Rollback Test:** 🟡 PENDING (No Docker Environment) — 3 `rollback.sql` đã viết, chưa chạy `up→down→up`.
**Manual API Smoke Test:** 🟡 PENDING (No Docker Environment).
**Query Performance Benchmark (>1000 category, Decision S06):** 🟡 PENDING (No Docker Environment) — thuật toán đã thiết kế set-based (1 query + in-memory traversal, không N+1 — §1.3/§1.4), nhưng chưa có số đo thật trên dữ liệu lớn.

### Điều kiện để 4 mục PENDING chuyển PASS

1. **Migration**: `npx prisma migrate deploy` cho 3 migration, đối chiếu dữ liệu trước/sau.
2. **Rollback**: chạy từng `rollback.sql` thủ công (Prisma không hỗ trợ down-migration tự động), xác nhận schema về đúng trạng thái, chạy `up` lại lần 2 xác nhận idempotent.
3. **Integration Test**: chưa có `test/category.e2e-spec.ts` — cần tạo khi có Docker.
4. **Manual Smoke Test**: `npm run start:dev`, gọi đủ 6 route qua Swagger UI/curl.
5. **Performance Benchmark**: seed ≥1000 category trong 1 Organization (đa cấp), đo thời gian `GET /categories?search=...` và `GET /categories/tree`.

## 7. Acceptance Criteria (SPEC-CATEGORY-001 §12, 18 tiêu chí)

| # | Tiêu chí | Kết quả |
|---|---|---|
| 1 | Build/Lint/TypeCheck PASS | ✅ |
| 2 | Unit Test PASS, Coverage ≥ baseline | ✅ 1292/1292, 91.43% |
| 3 | Multi Tenant | ✅ |
| 4 | Repository Boundary | ✅ (0 vi phạm, không cần DomainService — §1.2) |
| 5 | Soft Delete | ✅ |
| 6 | Audit | ✅ (dùng `AuditLogService` hiện có, không bảng mới) |
| 7 | Permission | ✅ (không đổi catalog) |
| 8 | Version (Optimistic Lock) | ✅ |
| 9 | Parent Tree | ✅ |
| 10 | Circular Detection | ✅ |
| 11 | Archive đệ quy | ✅ |
| 12 | Restore chain | ✅ |
| 13 | Slug unique DB-level | ✅ |
| 14 | Variant-Category consistency | ✅ |
| 15 | Integration Test PASS | 🟡 PENDING |
| 16 | Không TODO/FIXME/`any` | ✅ |
| 17 | Circular 3 cấp (Decision S05) | ✅ |
| 18 | Query Performance (Decision S06) | 🟡 PENDING (thiết kế đạt, chưa đo thật) |

**16/18 PASS, 2/18 PENDING** (đều thuộc nhóm cần Docker thật). Technical Complete = YES, Operational Complete = PENDING.

## 8. Kỹ thuật/Technical Debt còn lại cho Sprint sau

- `test/category.e2e-spec.ts` chưa tồn tại — tạo khi có Docker.
- Domain Event (`CategoryCreated`/`Updated`/`Archived`/`Restored`) — chỉ hook no-op, chờ Sprint Event + Outbox Pattern (giống `product`).
- Nếu Sprint sau có module thứ 2 cần đọc `Category` (Promotion/Report theo ngành hàng) — cần tạo `CategoryDomainService` lúc đó, đóng `CATEGORY_REPOSITORY` export (Decision Q5/S07 đã dự trù rõ điều kiện này).
- Query Performance Benchmark thật (>1000 category) chưa có số đo — cần thực hiện khi có Docker, đúng Decision S06.

## 9. Tự đánh giá (Self-Review)

- Theo đúng và đầy đủ quy trình `Audit → RFC → Architecture Review → SPEC → Implementation Plan → Code` lần đầu tiên chạy trọn vẹn cho 1 domain — không rút gọn bước nào dù đã có kinh nghiệm từ T005.
- Phát hiện đúng 1 xung đột thật với `PROJECT_RULES.md` (chỉ đạo yêu cầu viết RFC) và dừng lại hỏi thay vì tự quyết hoặc tự từ chối — được Architect xác nhận đúng và hủy chỉ đạo sai, không phải lỗi của Claude Code hay quy tắc.
- Tự phát hiện và tự sửa 1 lỗi quy trình (gộp nhầm commit) bằng công cụ an toàn (`git reset --soft`, xác nhận chưa push trước) thay vì để lẫn lộn lịch sử git.
- Tự phát hiện 1 false positive ở Architecture Test của T005 (do comment trích dẫn tên class) và sửa bằng cách đổi cách diễn đạt, không sửa bài test đã đóng của Sprint trước.
- 1 khoảng trống thật của Implementation Plan gốc (thiếu `search()` method) được bổ sung minh bạch, disclosed rõ trong commit message, không âm thầm mở rộng phạm vi.
- Toàn bộ 10 nhóm test theo Decision IP07 đều có mặt, không nhóm nào bị bỏ sót hoặc gộp chung mơ hồ.
- 4 mục PENDING (Integration/Rollback/Smoke Test/Performance Benchmark) ghi đúng bản chất — giới hạn môi trường, không phải lỗi code, có điều kiện cụ thể để chuyển PASS.

**Trạng thái:** Technical Complete. Chờ Architecture Review lần cuối trước khi coi T006 đóng hoàn toàn.
