# Inventory — Single Write Path

> Tài liệu phân tích/thiết kế (T003.5). Nội dung ban đầu là **đề xuất** cho `SPEC-INV-001`.
>
> **Update T004 (đã triển khai, SPEC-INV-001 APPROVED FOR IMPLEMENTATION):** Đề xuất ở tài liệu này đã được hiện thực với một số điều chỉnh theo ARCHITECT DECISION (SPEC-INV-001 + Revision 1) — xem `docs/implementation/sprint-00-t004-report.md` để biết chi tiết đầy đủ. Tóm tắt các điều chỉnh so với đề xuất gốc:
> - Không dùng thẳng `IInventoryRepository`/`INVENTORY_REPOSITORY` làm cửa ngõ public — đúng như §5 dự đoán, KHÔNG thêm tầng "Domain Service" tách biệt theo nghĩa route lại logic nghiệp vụ, nhưng SPEC-INV-001 (Decision 3/8/11/12) bắt buộc một class `InventoryDomainService` làm **cửa ngõ duy nhất được export** — `IInventoryRepository` lùi thành chi tiết nội bộ, không export ra ngoài module (đúng tinh thần §5 "giữ nguyên mẫu Application Service → Repository", chỉ khác là mẫu đó nay áp dụng NỘI BỘ trong `inventory` module, còn module khác gọi qua `InventoryDomainService`).
> - `recordMovement()`/`recordSaleMovement()` đã hợp nhất thành MỘT hàm ghi duy nhất (đúng Hướng A ở §4) — `IInventoryRepository.recordMovement(tx, input)`, `tx` bắt buộc, luôn Optimistic Lock.
> - Public interface của `InventoryDomainService`: `increase()`, `decrease()`, `adjust()`, `transfer()`, `recordMovement()` (đúng theo Decision 10).
> - Checkout — module duy nhất đã đi đúng cửa trước T004 — vẫn được refactor tối thiểu (chỉ đổi tầng inject, xem SPEC-INV-001 Revision 1) để tuân thủ tuyệt đối "Single Writer, không ngoại lệ" (Decision 12), không đổi business logic/transaction/response.

## 1. Câu hỏi cần trả lời chính xác: Ai được phép ghi Inventory?

**Quy tắc Target (đề xuất):** Chỉ có **MỘT hàm ghi** — hiện thân bởi `IInventoryRepository` (namespace `INVENTORY_REPOSITORY` DI token) — được phép thay đổi `Inventory.quantity`/`avgCost`/`lastCost` và tạo dòng `InventoryMovement`. Mọi module nghiệp vụ cần thay đổi tồn kho (Purchase, POS/Checkout, Transfer, Stock Count, Adjustment, và tương lai Refund) PHẢI:

1. Import `InventoryModule` vào module của mình.
2. Inject `INVENTORY_REPOSITORY` qua token (không import trực tiếp `PrismaInventoryRepository`).
3. Gọi hàm ghi, truyền `tx` hiện tại của mình vào để cùng nằm trong 1 transaction DB.

**Không module nghiệp vụ nào được:**
- Gọi `tx.inventory.upsert()` / `tx.inventory.update()` / `tx.inventory.create()` trực tiếp từ repository của mình.
- Gọi `tx.inventoryMovement.create()` trực tiếp từ repository của mình.
- Expose bất kỳ endpoint POST/PATCH/DELETE nào chỉnh `Inventory` (đã đúng hôm nay — `InventoryController` chỉ có 3 route GET).

Luồng ví dụ theo đúng mẫu SPEC đưa ra:

```
Purchase → InventoryDomainService → InventoryMovement → InventorySnapshot
```

Ánh xạ vào codebase hiện tại: `PurchaseOrderService.receive()` → `IInventoryRepository.recordMovement(input, tx)` → ghi `InventoryMovement` (ledger) → upsert `Inventory` (snapshot), cùng 1 transaction.

## 2. Hiện trạng: 6 nơi ghi, chỉ 1 nơi đi đúng cửa

| # | Module | Hàm | Đi qua `IInventoryRepository`? | Có `tx` composable? | Có lock? |
|---|---|---|---|---|---|
| 1 | `inventory` (chính chủ) | `recordMovement()` | — (đây là chính interface) | ❌ Không — tự mở `$transaction` riêng | ❌ Không |
| 2 | `inventory` (chính chủ) | `recordSaleMovement()` | — (đây là chính interface) | ✅ Có — nhận `tx?` tùy chọn | ✅ Optimistic Lock |
| 3 | `checkout` (Prompt 035) | gọi `recordSaleMovement(..., tx)` | ✅ Đúng — qua `INVENTORY_REPOSITORY` | ✅ | ✅ (thừa hưởng từ #2) |
| 4 | `purchase-order.receive()` | tự viết `tx.inventory.upsert()` | ❌ Bỏ qua | N/A (tự có tx riêng) | ❌ |
| 5 | `purchase-return.complete()` | tự viết `tx.inventory.upsert()` | ❌ Bỏ qua | N/A | ❌ |
| 6 | `transfer.transitionStatus()` | tự viết `tx.inventory.upsert()` | ❌ Bỏ qua | N/A | ❌ |
| 7 | `stock-count.complete()` | tự viết `tx.inventory.upsert()` | ❌ Bỏ qua | N/A | ❌ |
| 8 | `inventory-adjustment.complete()` | tự viết `tx.inventory.upsert()` | ❌ Bỏ qua | N/A | ❌ |

Chỉ `checkout` (xây sau khi luật "không gọi chéo DB module khác" có hiệu lực từ Prompt 031) đi đúng. 5 module còn lại xây TRƯỚC luật đó, nên bỏ qua interface dù interface đã tồn tại từ trước và tự nhận là "sole write path" trong doc comment của chính nó.

## 3. Lý do kỹ thuật thật sự của việc bỏ qua (không phải lười biếng)

Đọc kỹ code của cả 5 module cho thấy đây không phải sơ suất — có lý do kỹ thuật cụ thể, ghi rõ trong comment tại `prisma-purchase-order.repository.ts`:

> "Không gọi `IInventoryRepository.recordMovement()` vì hàm đó tự mở transaction riêng — không thể tham gia transaction ngoài này, vi phạm yêu cầu 'Purchase + Inventory + Movement History phải là một Transaction'."

Cụ thể: `recordMovement()` (method #1 ở bảng trên) tự gọi `this.prisma.$transaction(...)` bên trong nó — không nhận `tx` từ bên ngoài. Nhưng cả 5 module đều cần tính atomic giữa (a) chuyển trạng thái aggregate của chính mình (PurchaseOrder: APPROVED→RECEIVED), (b) ghi Debt/cập nhật item con, và (c) ghi Inventory — tất cả trong CÙNG MỘT transaction. Nếu gọi `recordMovement()` như nó đang là, sẽ tạo ra 2 transaction riêng biệt, mất tính atomic (nếu bước (a) rollback sau khi (c) đã commit, dữ liệu sai lệch).

**Kết luận quan trọng:** sửa 5 module này KHÔNG chỉ là "đổi cách gọi cho đúng chỗ" — nó đòi hỏi thay đổi chữ ký của `recordMovement()` để chấp nhận `tx?: Prisma.TransactionClient` giống hệt `recordSaleMovement()` đã làm ở Prompt 035. Đây là **tiền đề bắt buộc**, không phải tùy chọn, cho T004. Chi tiết ở [[inventory-migration-plan]].

## 4. Đề xuất: hợp nhất `recordMovement()` và `recordSaleMovement()`?

Hiện có 2 hàm ghi song song trong cùng interface với hành vi khác nhau (một có lock+check âm kho, một không). Có 2 hướng cho SPEC-INV-001 cân nhắc:

**Hướng A — Một hàm ghi tổng quát duy nhất.** Nâng cấp `recordMovement()` để có compare-and-swap lock + negative-stock check (cấu hình theo `movementType`, xem [[inventory-locking-strategy]] và [[inventory-migration-plan]] §Prerequisites), rồi merge `recordSaleMovement()` vào làm một cách gọi tiện lợi (`recordMovement({movementType: 'SALE', ...})`) hoặc xóa hẳn, giữ lại 1 hàm.

**Hướng B — Giữ 2 hàm, thêm các hàm chuyên biệt khác.** `recordSaleMovement()` giữ nguyên cho POS (đã đúng, đã có test), thêm các hàm tương tự cho từng nhóm nghiệp vụ (`recordPurchaseMovement`, `recordTransferMovement`, ...) nếu mỗi loại có luật riêng đủ khác biệt.

Khuyến nghị (không phải quyết định): **Hướng A** — tránh phân mảnh logic lock/check ra nhiều hàm, giữ đúng tinh thần "1 cửa ngõ ghi duy nhất" mà SPEC yêu cầu ở mức triệt để nhất. Nhưng đây là quyết định thiết kế cần SPEC-INV-001 chốt, không tự quyết ở đây.

## 5. `InventoryDomainService` — có cần thêm 1 tầng mới không?

Yêu cầu gốc dùng tên `InventoryDomainService` làm ví dụ luồng. Trong codebase hiện tại, **không có tầng "Domain Service" tách biệt cho Inventory** — toàn bộ logic nghiệp vụ (tính Average Cost, check âm kho, lock) nằm ngay trong `PrismaInventoryRepository` (tầng Infrastructure), được gọi trực tiếp qua interface `IInventoryRepository` (tầng Domain) từ Application Service của module khác (`checkout.service.ts`). Đây là mẫu "Application Service → Repository" đã thống nhất toàn dự án — không có Domain Service riêng cho bất kỳ module nào khác (Customer, Organization, Branch đều theo mẫu này).

**[OPEN QUESTION cho SPEC-INV-001]**: Giữ nguyên mẫu hiện tại (repository đảm nhận cả logic nghiệp vụ ghi, gọi thẳng qua DI token) hay tách riêng một `InventoryDomainService` đứng giữa Application Service của caller và `IInventoryRepository`? Khuyến nghị: **giữ nguyên mẫu hiện tại** — thêm tầng Domain Service riêng cho Inventory sẽ phá vỡ tính nhất quán với toàn bộ 24 module khác trong dự án, mà không giải quyết vấn đề gốc (vấn đề gốc là 5 module bỏ qua interface, không phải do thiếu tầng trung gian).

## 6. Đường đọc (read path) — không bị ràng buộc như đường ghi

3 hàm đọc (`search`, `getByProduct`, `getHistory`) không đe dọa bất biến "1 người ghi", nên không cần siết chặt như đường ghi. Quy tắc hiện tại (đã đúng, giữ nguyên): mọi module cần XEM tồn kho gọi qua `IInventoryRepository`/`InventoryService`, không tự query thẳng bảng `inventories`/`inventory_movements` bằng Prisma client của module mình.

Phát hiện LOW từ Prompt A01: module `warehouse` có truy vấn đọc (kiểm tra tồn tại) thẳng vào bảng Inventory thay vì qua `IInventoryRepository`. Đây là vi phạm đường đọc, mức độ thấp, không nằm trong phạm vi T004 (T004 chỉ xử lý đường GHI của 5 module) — nêu ở đây để không bị quên, xử lý riêng nếu cần.
