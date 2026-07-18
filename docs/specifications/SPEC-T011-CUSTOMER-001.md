# SPEC-T011-CUSTOMER-001 — Customer Domain

**Status:** APPROVED WITH DECISIONS (`ARCHITECTURE REVIEW — SPEC-T011-CUSTOMER-001`, Decision SR01-SR15) — LOCKED. Implementation Authorization GRANTED (Fast Track Workflow — không tạo Implementation Plan riêng: `SPEC Review → Implementation → Implementation Report → Release Review → Commit → Tag`).
**Nguồn:** `RFC-T011 — Customer Domain` v1 (Architect) → `ARCHITECTURE REVIEW — RFC-T011 Customer Domain` (Claude Code, `docs/architecture/T011-architecture-review.md`) → `ARCHITECT RESOLUTION` lần 1 (AR-T011-01~08, RFC REVISION REQUIRED) → `ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN` lần 2 (Decision CR01-CR13, APPROVED WITH DECISIONS) → `RFC-T011 — Customer Domain` v2 (`docs/rfc/RFC-T011-customer-domain.md`, Claude Code cập nhật theo ủy quyền tường minh) — ràng buộc bắt buộc của SPEC này.
**Bản chất:** Refactor/mở rộng module `customer` **đang chạy thật** (không phải module mới — CR01, "Evolution of existing Customer Domain") — thêm `version`/`CustomerStatus` riêng, code khách hàng chuyển sang optional-input, gỡ unique constraint `phone`, sửa vi phạm Repository Boundary đã tồn tại từ trước (`checkout`/`customer-point` inject thẳng `CUSTOMER_REPOSITORY`), deprecate (không xóa) 3 field tài chính/thống kê, thêm Activate/Deactivate riêng, chuẩn hóa permission dấu hai chấm.
**Tác giả SPEC:** Claude Code, theo ủy quyền tường minh trong `AUTHORIZATION` của `ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN` (Decision CR01-CR13, mục 2: "Viết SPEC-T011-CUSTOMER-001").

---

## 0. Các điểm cụ thể hóa khi viết SPEC (chưa có trong RFC v2 — cần Architecture Review xác nhận)

RFC v2 đã giải quyết toàn bộ A1-A5/C1-C3 từ Architecture Review. Khi cụ thể hóa thành SPEC, phát sinh 6 điểm cần xác nhận (không phải mâu thuẫn — chỉ là quyết định triển khai cụ thể chưa có trong RFC):

1. **Tên field `archivedAt` (RFC §6) vs `deletedAt` (schema hiện tại)** — đề xuất: **giữ tên `deletedAt`** (không đổi tên cột), coi là hiện thực hóa đúng khái niệm "archivedAt" của RFC — đúng nguyên tắc CR01 "giảm breaking change". Đúng tiền lệ Barcode/Unit/Brand (đều dùng `deletedAt`, không có cột `archivedAt` riêng).
2. **`phone` phải đổi từ NOT NULL sang nullable** — RFC §6.5 nói "Tùy chọn" nhưng CR06 chỉ nói rõ "gỡ DB unique constraint", không nói rõ gỡ luôn `NOT NULL`. Đề xuất: **đổi `phone String` → `phone String?`** trong cùng Migration A (phone) — vì "tùy chọn" ở RFC chỉ có ý nghĩa đầy đủ nếu cột cho phép NULL; nếu không, DTO có thể bỏ optional nhưng schema vẫn ép buộc nhập.
3. **`contactName` và `paymentTermDays` là cột MỚI hoàn toàn** (không tồn tại trong schema hiện tại) — xác nhận đây là migration additive thuần túy, không phải đổi tên/tái sử dụng cột có sẵn.
4. **Tên public read port (CR08/CR09 để ngỏ)** — đề xuất: **`CustomerDomainService`** — đúng convention đặt tên đã dùng ở mọi Master Data trước (`ProductDomainService`, `UnitDomainService`, `BarcodeDomainService`), không có lý do đặt tên khác.
5. **Status model** — giữ `deletedAt` (soft-delete marker) VÀ thêm `CustomerStatus` (`ACTIVE`/`INACTIVE`/`ARCHIVED`) riêng, đúng mẫu Barcode Migration B (backfill `ARCHIVED` từ `deletedAt IS NOT NULL`) — không dùng chung `CommonStatus` (đang dùng bởi 5 model khác).
6. **Migration B (RFC §16, "Customer code adjustment nếu cần")** — Audit generator hiện có (`SequenceCustomerCodeGenerator`) theo đúng 3 tiêu chí RFC §7 yêu cầu:
   - Organization scope: ĐẠT — dùng bảng `Sequence` với khóa `(organizationId, name)`.
   - Concurrency safety: ĐẠT — `upsert` nguyên tử trên `Sequence`, không race condition.
   - Tương tác Optimistic Lock: ĐẠT — generator không đụng tới `version`, không xung đột.
   - **Kết luận: Migration B KHÔNG cần thiết** — giữ nguyên generator, chỉ đổi Service logic (gọi generator CHỈ KHI client không cung cấp `code`).

Không còn điểm nào khác cần làm rõ ngoài 6 điểm trên. **Toàn bộ 6 điểm đã được `ARCHITECTURE REVIEW — SPEC-T011-CUSTOMER-001` xác nhận đúng (Decision SR01-SR15) — không điểm nào bị bác bỏ hay sửa.**

## 1. Entity

### 1.1 `CustomerEntity` — thay đổi so với hiện tại

```ts
export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';  // MỚI — 3 giá trị, thay CustomerStatus cũ ('ACTIVE'|'INACTIVE') dùng CommonStatus

export interface CustomerEntity {
  id: string;
  organizationId: string;
  code: string;
  customerType: CustomerType;              // giữ nguyên (CR07 — OPTIONAL PROFILE)
  fullName: string;                        // hiện thực "name" của RFC §6.4 — KHÔNG đổi tên field
  phone: string | null;                    // MỚI: nullable (điểm §0.2)
  email: string | null;
  birthday: Date | null;                   // giữ (CR07)
  gender: Gender | null;                   // giữ (CR07)
  taxCode: string | null;
  companyName: string | null;              // giữ (CR07)
  contactName: string | null;              // MỚI — cột mới (RFC §6.9)
  address: string | null;
  province: string | null;                 // giữ (CR07)
  district: string | null;                 // giữ (CR07)
  ward: string | null;                     // giữ (CR07)
  avatar: string | null;                   // giữ (CR07)
  note: string | null;
  creditLimit: string | null;
  paymentTermDays: number | null;          // MỚI — cột mới (RFC §6.12)
  status: CustomerStatus;                  // ĐỔI — 3 giá trị thay vì 2
  version: number;                         // MỚI — Optimistic Lock (BR09)
  /** @deprecated CR02 — không còn là dữ liệu nghiệp vụ, KHÔNG cho Create/Update ghi. Chờ T017 Debt Ledger xử lý. */
  currentDebt: string;
  /** @deprecated CR03 — system-maintained projection, KHÔNG expose trong Create/Update DTO input. */
  totalRevenue: string;
  /** @deprecated CR03 — system-maintained projection, KHÔNG expose trong Create/Update DTO input. */
  totalOrder: number;
  /** system-maintained projection (CR04) — CHỈ Customer Point workflow được cập nhật, qua Domain Event. */
  totalPoint: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;                  // giữ — đồng bộ với status=ARCHIVED (xem §3.2)
}
```

`status` mặc định `ACTIVE` khi tạo mới. `currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint` giữ nguyên `@default(0)` hiện có — **không đổi giá trị mặc định, không migration dữ liệu** (CR02/CR03/CR04).

## 2. Aggregate

```
Customer (Aggregate Root, version — BR09)
```

Không có entity con. Thuộc về Organization (bắt buộc). **Không thuộc Branch** (RFC §5 — công nợ/giao dịch quản lý cấp Organization, Branch chỉ ghi ở từng chứng từ). Quan hệ ra ngoài Aggregate (schema hiện có, không đổi ở T011): `Order[]`, `Debt[]`, `CustomerPointLedger[]`, `Payment[]`, `Invoice[]` — chỉ tham chiếu `id`, không phụ thuộc cách biểu diễn nội bộ `status`/`deletedAt` (xác nhận ở Architecture Review §B4).

## 3. Migration

**Không migration nào được tạo ở bước SPEC này.** 3 migration độc lập, đúng tách theo Decision CR11 (mở rộng — xem §0.5/§0.6 lý do vì sao chỉ 3, không phải 4):

### 3.1 Migration A — `version` (Optimistic Lock, BR09)

```sql
ALTER TABLE "customers" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
```

### 3.2 Migration B — `CustomerStatus` + field mới + phone nullable

```sql
-- Status model riêng (thay CommonStatus 2 giá trị bằng CustomerStatus 3 giá trị)
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
ALTER TABLE "customers" ADD COLUMN "status_new" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "customers" SET "status_new" = 'ARCHIVED' WHERE "deletedAt" IS NOT NULL;
UPDATE "customers" SET "status_new" = "status"::text::"CustomerStatus" WHERE "deletedAt" IS NULL;
ALTER TABLE "customers" DROP COLUMN "status";
ALTER TABLE "customers" RENAME COLUMN "status_new" TO "status";

-- Field mới (RFC §6.9/§6.12)
ALTER TABLE "customers" ADD COLUMN "contactName" TEXT;
ALTER TABLE "customers" ADD COLUMN "paymentTermDays" INTEGER;

-- phone nullable (điểm §0.2)
ALTER TABLE "customers" ALTER COLUMN "phone" DROP NOT NULL;
```

Không `DROP` dữ liệu — `status` cũ được backfill sang `status` mới trước khi xóa cột tạm, không mất thông tin ACTIVE/INACTIVE hiện có.

### 3.3 Migration C — Phone unique removal (Decision CR06)

```sql
DROP INDEX IF EXISTS "customers_organizationId_phone_key";
```

Không migration dữ liệu — chỉ gỡ constraint, không đổi giá trị cột.

**Không có Migration cho `currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint`** (Decision CR02/CR03/CR04 — retain, không xóa, không đổi kiểu dữ liệu, không backfill).

## 4. API

### 4.1 Route hiện có — thay đổi

| Route | Thay đổi |
|---|---|
| `POST /customers` | `code` chuyển thành **optional** (điểm §7 RFC v2/CR05) — nếu không gửi, hệ thống tự sinh qua `SequenceCustomerCodeGenerator` (giữ nguyên). `phone` chuyển thành **optional**. Không nhận `currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint` (chưa từng có, tiếp tục không có). |
| `GET /customers` | Thêm `sortBy=fullName` làm mặc định (thay `createdAt`) — RFC §12 "default sort name ASC". Search theo `phone` trả **danh sách** (CR06). |
| `GET /customers/:id` | Không đổi. |
| `PATCH /customers/:id` | Thêm `version` **bắt buộc** (409 nếu sai — BR09, khác hiện tại không cần). `phone` optional (không còn check trùng). Không nhận field `code` (giữ nguyên bất biến — đã đúng từ trước, DTO hiện tại không có `code`). |
| `DELETE /customers/:id` | Nhận body `{ version }` bắt buộc (hiện tại không có body). Nghĩa là Archive — set `status=ARCHIVED` + `deletedAt`. |
| `POST /customers/:id/restore` | Nhận body `{ version }` bắt buộc (hiện tại không có body). Trả `status` về `INACTIVE` — **không đổi hành vi** (Service hiện tại đã đúng), chỉ thêm version check. |

### 4.2 Route mới (RFC §13)

| Route | Mô tả |
|---|---|
| `POST /customers/:id/activate` | **MỚI**. `INACTIVE → ACTIVE`. Nhận body `{ version }` bắt buộc. Sai transition (vd gọi khi đang `ARCHIVED`) → lỗi `CUSTOMER_INVALID_TRANSITION`. |
| `POST /customers/:id/deactivate` | **MỚI**. `ACTIVE → INACTIVE`. Nhận body `{ version }` bắt buộc. |

Cả 2 route dùng chung repository method `changeStatusWithVersion()` (§9).

### 4.3 Field hệ thống duy trì — không editable qua API (Decision SR10)

`currentDebt`/`totalRevenue`/`totalOrder` **có thể xuất hiện trong response** (`GET`) nhưng **không được phép sửa qua `PATCH`**. Cơ chế thực thi: `UpdateCustomerDto` không khai báo các field này (§5/§10) — kết hợp với `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` đã bật toàn cục (`backend/src/main.ts:49-55`), bất kỳ request `PATCH` nào cố gửi field không khai báo trong DTO sẽ bị từ chối `400` tự động ở tầng framework — **không cần thêm code kiểm tra thủ công**, chỉ cần đảm bảo DTO không khai báo field.

## 5. Validation

**`CreateCustomerDto`:**
- `code?: string` — **MỚI**, optional (`@IsOptional() @IsString() @Length(1,50)`). Nếu gửi: trim + uppercase trước khi lưu/check unique.
- `phone?: string` — đổi từ bắt buộc sang optional (`@IsOptional()` thêm vào).
- `contactName?: string` — **MỚI**, optional.
- `paymentTermDays?: number` — **MỚI**, optional (`@IsInt() @Min(0)`).
- Toàn bộ field khác giữ nguyên như `create-customer.dto.ts` hiện có.
- **KHÔNG** thêm field `currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint`/`status`(khởi tạo luôn `ACTIVE`, không cho client set trực tiếp ở Create — khác hiện tại đang cho `status?` trong `CreateCustomerDto`, xem lý do ở BR11 mới).

**`UpdateCustomerDto`:**
- `version: number` — **MỚI, bắt buộc** (`@IsInt()`).
- `phone?: string` — optional, không còn ràng buộc unique.
- `contactName?: string`, `paymentTermDays?: number` — **MỚI**, optional.
- Không nhận `status` trực tiếp (chuyển hẳn sang route Activate/Deactivate/Archive/Restore riêng — khác hiện tại `UpdateCustomerDto` có `status?`).

**`CustomerVersionDto`** (mới, dùng chung Archive/Restore/Activate/Deactivate): `{ version: number }` — đúng mẫu `BarcodeVersionDto` (T009).

**`CustomerQueryDto`:** thêm `sortBy` default đổi từ `'createdAt'` sang `'fullName'`. Không đổi field khác.

## 6. Permission (Decision CR10)

Chuẩn hóa theo `crud()` — không đổi 5 permission hiện có, thêm 2 permission mới:

```
customer:view      (không đổi)
customer:create    (không đổi)
customer:update    (không đổi)
customer:activate  (MỚI)
customer:deactivate (MỚI)
customer:delete → customer:archive  (đổi ý nghĩa hiển thị — permission code giữ hay đổi tên chốt khi code, khuyến nghị giữ "delete" để không phá vỡ permission đã seed, chỉ đổi ý nghĩa Swagger/description sang "Archive")
customer:restore   (không đổi)
```

`permission-catalog.ts:155` hiện tại: `...crud('customer', 'khách hàng', ['restore'])` → đổi thành `...crud('customer', 'khách hàng', ['restore', 'activate', 'deactivate'])`.

## 7. Multi-tenant (BR01)

Toàn bộ method ghi (`update`/`softDelete`/`restore`/`changeStatusWithVersion`) phải nhận **và lọc** `organizationId` trong `where` — sửa đúng lỗ hổng đã tồn tại (Architecture Review §B3: `update()`/`softDelete()`/`restore()` hiện tại `where: { id }` thuần, không có `organizationId`). Đúng lỗi hệ thống đã sửa ở Brand/Unit/Barcode (T007-T009).

## 8. Archive Guard (BR07 — mở, chờ T013/T017)

T011 **không** implement Archive Guard thật (chưa có Sales/Debt Ledger để kiểm tra) — chỉ đảm bảo `CustomerDomainService` có đủ API (`assertNotArchived`, `findActiveById`...) để T013/T017 tích hợp sau. `remove()` (Archive) trong T011 **không có điều kiện chặn nào** — luôn cho phép Archive bất kỳ Customer nào (khác Barcode/Unit đã có Delete Guard thật) — đúng quyết định RFC §9 BR07: "Archive được phép khi Customer chưa có module phụ thuộc thực tế."

## 9. Repository

### 9.1 `ICustomerRepository` — thay đổi interface

```ts
create(input: CreateCustomerInput): Promise<CustomerEntity>;
findById(id: string, organizationId: string): Promise<CustomerEntity | null>;                    // không đổi
findByCode(organizationId: string, code: string): Promise<CustomerEntity | null>;                 // MỚI (RFC §11)
findByIdIncludingDeleted(id: string, organizationId: string): Promise<CustomerEntity | null>;      // không đổi
update(id: string, organizationId: string, expectedVersion: number, input: UpdateCustomerInput): Promise<CustomerEntity>;              // + organizationId + expectedVersion
changeStatusWithVersion(id: string, organizationId: string, expectedVersion: number, status: CustomerStatus, updatedBy: string): Promise<CustomerEntity>;  // MỚI — dùng chung Activate/Deactivate
softDelete(id: string, organizationId: string, expectedVersion: number, deletedBy: string): Promise<void>;    // + organizationId + expectedVersion, set status=ARCHIVED
restore(id: string, organizationId: string, expectedVersion: number, restoredBy: string): Promise<void>;       // + organizationId + expectedVersion, set status=INACTIVE
search(params: CustomerSearchParams): Promise<CustomerSearchResult>;                                // không đổi shape, đổi default sort
existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean>;           // MỚI (RFC §11, thay thế existsByPhone làm cơ chế check trùng chính)
syncTotalPoint(customerId: string, totalPoint: number): Promise<void>;                              // không đổi (CustomerPointSubscriber tiếp tục dùng)
count(params): Promise<number>;                                                                     // MỚI nếu chưa có method riêng (search() đã trả total, count() có thể alias — chốt khi code)
```

**Bỏ `existsByPhone()`** khỏi vai trò "chặn trùng" (Decision CR06) — có thể xóa hẳn method hoặc giữ làm tiện ích tra cứu không dùng để validate (chốt khi code, khuyến nghị xóa vì không còn caller nào sau khi gỡ application-level check).

Tất cả method ghi dùng `updateMany` compare-and-swap: `where: { id, organizationId, version: expectedVersion }`, đúng mẫu Barcode/Unit. **Lỗi domain mới**: `CustomerConcurrencyConflictError` (file mới `domain/errors/customer.errors.ts`).

### 9.2 `existsByCode()` — wiring (đúng mẫu Barcode Decision BQ6)

`CustomerService.create()` gọi `existsByCode(organizationId, code, undefined)` **TRƯỚC** khi ghi nếu `code` được client cung cấp (nếu không cung cấp, code do generator sinh — atomic qua `Sequence`, tự nó không trùng trong cùng Organization, không cần check trước). `CustomerService.update()` — code bất biến, không có nhánh update code, không cần gọi `existsByCode` ở update. Giữ `translateWriteError()` bắt `P2002` làm lớp bảo vệ cuối cho race condition (đặc biệt khi client tự nhập code).

**Quy tắc chính thức (Decision SR08 — bổ sung, không đổi thiết kế đã có, chỉ làm rõ ràng buộc bắt buộc):**

```
Nếu client truyền code  → validate (trim, uppercase, độ dài) → existsByCode() → ghi nếu không trùng
Nếu client không truyền → generator sinh code → ghi (không cần existsByCode() trước, generator tự đảm bảo không trùng)
```

Generator (`SequenceCustomerCodeGenerator`, giữ nguyên — xem §0.6) **bắt buộc** giữ đúng 3 tính chất: atomic, organization-scoped, concurrency-safe — đã đạt qua cơ chế `prisma.sequence.upsert({ where: { organizationId_name }, update: { value: { increment: 1 } } })`. **Cấm tuyệt đối pattern `count() + 1`** (đọc `COUNT(*)` rồi cộng 1 để sinh số tiếp theo) — không atomic, có race condition thật giữa 2 request đồng thời. Không đổi cơ chế generator hiện có ở T011.

### 9.3 `CustomerDomainService` — MỚI (Decision CR08/CR09, xem §0.4)

```ts
// backend/src/modules/customer/application/customer-domain.service.ts — file mới
@Injectable()
export class CustomerDomainService {
  constructor(
    @Inject(CUSTOMER_REPOSITORY) private readonly customerRepository: ICustomerRepository,
  ) {}

  findById(organizationId: string, customerId: string): Promise<CustomerEntity | null> {
    return this.customerRepository.findById(customerId, organizationId);
  }

  async findActiveById(organizationId: string, customerId: string): Promise<CustomerEntity | null> {
    const customer = await this.customerRepository.findById(customerId, organizationId);
    return customer && customer.status !== 'ARCHIVED' ? customer : null;
  }

  async findUsableForSale(organizationId: string, customerId: string): Promise<CustomerEntity | null> {
    const customer = await this.customerRepository.findById(customerId, organizationId);
    return customer && customer.status === 'ACTIVE' ? customer : null;
  }

  existsByCode(organizationId: string, code: string, excludeId?: string): Promise<boolean> {
    return this.customerRepository.existsByCode(organizationId, code, excludeId);
  }

  async assertBelongsToOrganization(organizationId: string, customerId: string): Promise<void> {
    const customer = await this.customerRepository.findById(customerId, organizationId);
    if (!customer) throw new NotFoundException(withCode(ErrorCode.CUSTOMER_NOT_FOUND, 'Không tìm thấy khách hàng'));
  }

  async assertNotArchived(organizationId: string, customerId: string): Promise<void> {
    const customer = await this.customerRepository.findById(customerId, organizationId);
    if (customer?.status === 'ARCHIVED') {
      throw new UnprocessableEntityException(withCode(ErrorCode.CUSTOMER_ARCHIVED, 'Khách hàng đã bị lưu trữ'));
    }
  }
}
```

`CustomerDomainService` là public domain API — export **duy nhất** đây từ `CustomerModule`, **không export `CUSTOMER_REPOSITORY`** (gỡ khỏi `exports` — Decision CR08, sửa `customer.module.ts:26`).

### 9.4 Repository Boundary — xử lý Technical Debt (Decision CR08, BẮT BUỘC trong T011)

`checkout.service.ts:17-18,77-78,106-114` và `customer-point.service.ts:11-12,44-45,167` hiện đang inject `CUSTOMER_REPOSITORY` trực tiếp, chỉ gọi `findById()`. Cả 2 phải đổi sang inject `CustomerDomainService`, gọi `findById()` (giữ nguyên tên method, chỉ đổi nguồn) hoặc `findActiveById()` nếu muốn từ chối Customer đã Archive ngay tại checkout (quyết định cụ thể — khuyến nghị `findActiveById()` cho `checkout` vì đúng tinh thần BR04 "Archived Customer không được sử dụng cho giao dịch bán hàng mới", giữ `findById()` cho `customer-point` vì đồng bộ điểm không phải giao dịch bán hàng mới).

`CustomerModule.imports` không đổi (`[RbacModule]`) — không phát sinh dependency mới, không cần `forwardRef()`, không cần Reference Module (khác Barcode/Unit — ở đây không có circular dependency, chỉ là hướng một chiều `checkout`/`customer-point` → `customer` đang cài sai công cụ).

**Architecture Test mới** (`customer-repository-boundary.architecture.spec.ts`): xác nhận không module nào ngoài `customer` import `CUSTOMER_REPOSITORY`/`ICustomerRepository`; `CustomerModule.exports` chỉ chứa `CustomerDomainService`; không `forwardRef()`.

## 10. DTO

- `CreateCustomerDto`: thêm `code?` (optional — Decision SR11), `contactName?`, `paymentTermDays?`; đổi `phone` sang optional; bỏ `status?` (luôn `ACTIVE` khi tạo, không cho client set).
- `UpdateCustomerDto`: thêm `version` (bắt buộc), `contactName?`, `paymentTermDays?`; đổi `phone` sang optional (bỏ ràng buộc từng có); bỏ `status?` (chuyển sang route riêng). **Xác nhận (Decision SR11): `UpdateCustomerDto` KHÔNG có field `code`** — code bất biến sau khi tạo (BR03), không có nhánh sửa code nào ở T011.
- `CustomerVersionDto` (mới): `{ version: number }`.
- `CustomerResponseDto`: thêm `version`, `contactName`, `paymentTermDays`. **Giữ nguyên toàn bộ field hiện có** (Decision CR12 — Backward Compatibility): `customerType`, `gender`, `birthday`, `companyName`, `province`, `district`, `ward`, `avatar`, `totalRevenue`, `totalOrder`, `totalPoint` — không xóa field response nào.
- `CustomerQueryDto`: đổi default `sortBy` từ `'createdAt'` sang `'fullName'`.

## 11. Event

Giữ nguyên cơ chế hiện có (`CUSTOMER_CREATED_EVENT`/`CUSTOMER_UPDATED_EVENT`/`CUSTOMER_DELETED_EVENT`, publish thật qua `DomainEventPublisher`, đúng ADR-0009 — **khác** mẫu no-op hook của Brand/Unit/Barcode, đây là module ĐẦU TIÊN có publish thật đã tồn tại từ trước T011). Thêm 2 event mới cho Activate/Deactivate:

| Event | Khi nào |
|---|---|
| `CUSTOMER_CREATED_EVENT` | Sau `POST /customers` thành công (không đổi) |
| `CUSTOMER_UPDATED_EVENT` | Sau `PATCH /customers/:id` thành công (không đổi) |
| `CUSTOMER_ACTIVATED_EVENT` | **MỚI** — sau `POST /customers/:id/activate` |
| `CUSTOMER_DEACTIVATED_EVENT` | **MỚI** — sau `POST /customers/:id/deactivate` |
| `CUSTOMER_DELETED_EVENT` | Sau `DELETE /customers/:id` (Archive) thành công (không đổi tên event, dù ý nghĩa là Archive không phải hard delete — giữ tên cũ để không phá vỡ subscriber hiện có nếu có) |
| `CUSTOMER_RESTORED_EVENT` | **MỚI** — sau `POST /customers/:id/restore` (hiện tại chưa publish gì ở restore) |

`CustomerPointSubscriber` không bị ảnh hưởng — tiếp tục lắng nghe event từ `customer-point`, không lắng nghe event của chính `customer`.

## 12. Test

Theo `TEST_RULES.md`/`MASTER_DATA_TEMPLATE.md` — nhóm bắt buộc: CRUD (cả 2 nhánh code: client cung cấp / tự sinh), Restore, Optimistic Lock (Update/Activate/Deactivate/Archive/Restore — 5 route, không phải 4 như Barcode), Pagination, Search (bao gồm case phone trùng trả danh sách), Sort (default `fullName asc`), Permission, Multi Tenant, Repository, Validation, API Contract, Regression. Thêm riêng theo RFC §17 (29 case, xem RFC v2 §17) + Repository Boundary Architecture Test cho việc gỡ `CUSTOMER_REPOSITORY` khỏi `checkout`/`customer-point`.

**Bổ sung bắt buộc (Decision SR13):**

- **Projection Test**: xác nhận không API nào (Create/Update) có thể cập nhật `currentDebt` — gửi `currentDebt` trong body `PATCH`/`POST` phải bị từ chối `400` (whitelist validation, §4.3) hoặc bị bỏ qua hoàn toàn nếu tới được Service (test cả 2 lớp: DTO validation + Service không đọc field này từ input dù có lọt qua).
- **Compatibility Test** (migration không mất dữ liệu): trước migration — snapshot toàn bộ Customer hiện có (số dòng, `fullName`/`phone`/`status`/`deletedAt` của từng dòng mẫu); sau migration — xác nhận số dòng không đổi, `status` mới ánh xạ đúng từ `status` cũ + `deletedAt` (ACTIVE/INACTIVE giữ nguyên nếu `deletedAt IS NULL`, chuyển `ARCHIVED` nếu `deletedAt IS NOT NULL`), `phone` giữ nguyên giá trị cũ (không bị xóa khi đổi nullable).
- **Repository Boundary Architecture Test** (`customer-repository-boundary.architecture.spec.ts`) phải kiểm tra rõ ràng: `checkout.module.ts`/`checkout.service.ts` không còn import `CUSTOMER_REPOSITORY`; `customer-point.module.ts`/`customer-point.service.ts` không còn import `CUSTOMER_REPOSITORY`; cả 2 chỉ phụ thuộc `CustomerDomainService`.

## 13. Acceptance Criteria

| # | Tiêu chí |
|---|---|
| 1 | Build/Lint/TypeCheck PASS |
| 2 | Coverage module `customer` ≥ 90% |
| 3 | `PATCH`/`DELETE`/`restore`/`activate`/`deactivate` đều bắt buộc `version`, sai → `409` |
| 4 | Phone không còn unique — tạo 2 Customer cùng phone cùng Organization thành công; search theo phone trả danh sách |
| 5 | Code: optional ở input, luôn có giá trị lưu trữ; client cung cấp → validate + unique; không cung cấp → tự sinh qua generator hiện có (không viết generator mới) |
| 6 | `CUSTOMER_REPOSITORY` không còn trong `CustomerModule.exports`; `checkout`/`customer-point` không còn inject trực tiếp — cả 2 dùng `CustomerDomainService`; Architecture Test xác nhận |
| 7 | `currentDebt`/`totalRevenue`/`totalOrder`/`totalPoint` không nhận input từ Create/Update DTO; response tiếp tục trả các field này (Backward Compatibility — CR12) |
| 8 | Response DTO giữ nguyên toàn bộ field hiện có (`customerType`/`gender`/`birthday`/...) — không xóa field nào khỏi response |
| 9 | 3 migration (version/status+field mới+phone nullable/phone-unique-removal) độc lập, có rollback, không `DROP` dữ liệu nghiệp vụ |
| 10 | Permission dùng dấu hai chấm, không dấu chấm — khớp `crud()` convention |
| 11 | Regression Baseline (T005-T009) PASS |
| 12 | Integration Test PASS — PENDING nếu không có Docker |
| 13 | **End-to-End Migration Scenario PASS** (Decision SR14 — "bài test quan trọng nhất của T011", xem chi tiết bên dưới) |

### 13.1 End-to-End Migration Scenario (Decision SR14)

Bắt buộc xác nhận toàn bộ chuỗi sau hoạt động đúng, theo thứ tự (integration/manual, PENDING nếu không có Docker — nhóm chung với Integration Test):

```
Customer cũ (dữ liệu trước migration)
  → chạy 3 migration (A/B/C)
  → build PASS
  → test PASS
  → đăng nhập thành công
  → Customer cũ vẫn đọc được (GET /customers/:id trả đúng dữ liệu, không mất field)
  → Customer mới tạo được (POST /customers, cả 2 nhánh: có code / không code)
  → Customer cũ sửa được (PATCH /customers/:id với version đúng)
  → Customer archive được (DELETE /customers/:id với version đúng)
  → checkout vẫn hoạt động (tạo đơn có customerId hợp lệ, qua CustomerDomainService)
  → customer-point vẫn hoạt động (cộng/trừ điểm, đồng bộ totalPoint qua CustomerDomainService)
```

Mỗi mũi tên là 1 bước phải PASS trước khi qua bước kế — nếu môi trường không có Docker/Postgres thật, đánh dấu PENDING (đúng quy ước `technical-debt.md`), không được bỏ qua khỏi Acceptance Criteria.

## 14. Implementation Order — Commit Strategy (Decision SR15, Fast Track — 7 commit, ít hơn Barcode)

**Không tạo Implementation Plan riêng** (Fast Track Workflow). Thứ tự triển khai = thứ tự 7 commit dưới đây — mỗi bước Build+TypeCheck+Lint PASS trước khi sang bước kế, đúng Coding Rules chuẩn dự án. **Không commit thật nào được tạo cho tới khi có Final Release Review** (Decision AUTHORIZATION) — thứ tự này chỉ để tổ chức công việc.

```
Commit 1 — Migration
  Migration A (version) → Migration B (status/contactName/paymentTermDays/phone nullable) → Migration C (phone unique removal)
  + cập nhật schema.prisma tương ứng

Commit 2 — Domain
  CustomerEntity (CustomerStatus 3 giá trị), ICustomerRepository (organizationId+version ở write path,
  existsByCode/findByCode/changeStatusWithVersion mới), CustomerConcurrencyConflictError,
  CustomerDomainService mới (6 method — §9.3)

Commit 3 — Application
  CustomerService: code optional-input (generator chỉ gọi khi thiếu code), Activate/Deactivate mới,
  existsByCode wiring, bỏ status khỏi Update, Optimistic Lock trên Update/Activate/Deactivate/Archive/Restore

Commit 4 — Presentation
  CustomerController: route activate/deactivate mới, version bắt buộc ở 5 route ghi (Update/Activate/
  Deactivate/Archive/Restore), CustomerVersionDto mới, permission-catalog.ts (customer:activate/deactivate)

Commit 5 — Repository Boundary
  checkout.service.ts + customer-point.service.ts chuyển từ inject CUSTOMER_REPOSITORY sang
  CustomerDomainService; gỡ CUSTOMER_REPOSITORY khỏi CustomerModule.exports;
  customer-repository-boundary.architecture.spec.ts mới

Commit 6 — Tests
  Toàn bộ test đơn vị cập nhật/mới (29 case RFC §17 + Projection Test + Compatibility Test —
  Decision SR13), Regression Baseline

Commit 7 — Documentation
  Release note T011, CHANGELOG.md, PROJECT_STATUS.md, SPRINT_DASHBOARD.md, technical-debt.md
  (End-to-End Migration Scenario PENDING nếu không Docker)
```

## 15. Rollback Plan

- Rollback A: `ALTER TABLE customers DROP COLUMN version`.
- Rollback B: `ALTER TABLE customers DROP COLUMN "contactName"`, `DROP COLUMN "paymentTermDays"`, `ALTER COLUMN "phone" SET NOT NULL` (chỉ an toàn nếu chưa có dữ liệu NULL thật — kiểm tra trước khi rollback production), khôi phục `status` 2 giá trị (`CommonStatus`) qua quy trình ngược tương tự forward migration.
- Rollback C: khôi phục lại `@@unique([organizationId, phone])` — **chỉ an toàn nếu chưa phát sinh dữ liệu trùng phone thật sau khi gỡ constraint** — phải kiểm tra `SELECT phone, COUNT(*) FROM customers WHERE phone IS NOT NULL GROUP BY organizationId, phone HAVING COUNT(*) > 1` trước khi rollback.
- Code: nếu Acceptance Criteria không đạt, không merge/commit.
- `checkout`/`customer-point`: nếu cần rollback, revert về inject `CUSTOMER_REPOSITORY` trực tiếp (tạm thời) trong lúc chờ fix — không khuyến nghị, chỉ nêu như phương án cuối.

## Lịch sử quyết định

- **RFC-T011 — Customer Domain v1 (PROPOSED)** — Architect soạn trực tiếp (Short RFC).
- **`ARCHITECTURE REVIEW — RFC-T011 Customer Domain`** (Claude Code, `docs/architecture/T011-architecture-review.md`) — phát hiện Customer là domain đang hoạt động thật (20 file, có test, 2 module khác phụ thuộc thật). 5 conflict cụ thể (A1-A5: `currentDebt` trong schema, phone unique, code tự sinh, Repository Boundary violation, permission naming) + 3 ambiguity (C1-C3: `totalPoint` projection, field ngoài minimum list, xóa hay giữ cột tài chính/thống kê).
- **`ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN`** lần 1 (Decision AR-T011-01 đến 08) — kết quả RFC REVISION REQUIRED, Implementation authorization NOT GRANTED.
- **`ARCHITECT RESOLUTION — RFC-T011 CUSTOMER DOMAIN`** lần 2 (Decision CR01-CR13) — kết quả APPROVED WITH DECISIONS: CR01 xác nhận brownfield refactor; CR02 `currentDebt` deprecated-not-deleted; CR03 `totalRevenue`/`totalOrder` giữ làm projection; CR04 `totalPoint` giữ nguyên; CR05 code optional-input/mandatory-stored; CR06 phone không unique; CR07 field ngoài minimum list được giữ; CR08/CR09 `CustomerDomainService` bắt buộc, API tối thiểu 6 method; CR10 permission dấu hai chấm; CR11 tách migration theo mục đích; CR12 Backward Compatibility ưu tiên; CR13 thứ tự triển khai. AUTHORIZATION: cập nhật RFC + viết SPEC-T011-CUSTOMER-001.
- **RFC-T011 — Customer Domain v2** (`docs/rfc/RFC-T011-customer-domain.md`) — Claude Code cập nhật theo CR01-CR13, đánh dấu rõ từng mục thay đổi, giữ lịch sử bản v1 (gạch ngang, không xóa).
- **SPEC-T011-CUSTOMER-001** — Claude Code soạn theo ủy quyền tường minh, cụ thể hóa RFC v2 thành 6 quyết định triển khai (§0), 3 migration, entity/repository/domain-service/API/DTO/test đầy đủ.
- **`ARCHITECTURE REVIEW — SPEC-T011-CUSTOMER-001`** (Decision SR01-SR15) — kết quả **APPROVED WITH DECISIONS**: SR01 xác nhận brownfield (Evolution, không Rewrite); SR02 xác nhận 3 migration tách theo thứ tự A→B→C; SR03 xác nhận 6 method `CustomerDomainService`, không thêm; SR04 Repository Boundary (điểm quan trọng nhất) — `checkout`/`customer-point` bắt buộc chuyển sang `CustomerDomainService`; SR05-SR07 xác nhận giữ nguyên `totalPoint`/`currentDebt`/`totalRevenue`/`totalOrder` như đã thiết kế; SR08 làm rõ quy tắc code generation (cấm `count()+1`, bắt buộc atomic/org-scoped/concurrency-safe); SR09 xác nhận phone non-unique; SR10 bổ sung field hệ thống không editable qua PATCH (§4.3); SR11 xác nhận `code?` optional ở Create, không có ở Update; SR12 giữ nguyên bộ event hiện tại, không thêm; SR13 bổ sung Projection Test + Compatibility Test + Repository Boundary Architecture Test cụ thể (§12); SR14 bổ sung End-to-End Migration Scenario làm Acceptance Criteria #13 (§13.1); SR15 chốt Commit Strategy 7 commit (§14, thay Implementation Order cũ).
- **AUTHORIZATION**: SPEC-T011-CUSTOMER-001 APPROVED. Claude Code được phép (1) cập nhật SPEC theo SR08-SR15 (đã thực hiện — chính là bản này) và (2) bắt đầu Implementation — **Fast Track Workflow**, không tạo Implementation Plan riêng (`SPEC Review → Implementation → Implementation Report → Release Review → Commit → Tag`). Không push/tag/commit trước Final Release Review. Sau khi hoàn thành implementation: xuất `IMPLEMENTATION REPORT — T011 CUSTOMER DOMAIN` và dừng chờ Architect Release Review.
- SPEC-T011-CUSTOMER-001 (tài liệu này) — **LOCKED**, Implementation đang tiến hành.
